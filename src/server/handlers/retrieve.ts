import { serverSupabase } from "@/server/supabase";
import { buildSmartReply } from "@/server/nlp/replyBuilder";
import { ExtractedEntity } from "@/app/api/chat+api";

type NoteRow = {
  id: string;
  title?: string | null;
  content?: string | null;
  category?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

type ScoredNote = NoteRow & { score: number };

type FileRow = {
  id: string;
  file_name?: string | null;
  description?: string | null;
  file_type?: string | null;
  file_path: string;
  created_at?: string | null;
};

// ─── HELPERS ──────────────────────────────────────────────────

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "\\$&");
}

function extractPhones(text: string): string[] {
  const matches = text.match(
    /(?:\+?(?:\d{1,3})[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g
  ) ?? [];
  const cleaned = matches
    .map((item) => item.replace(/[^\d+]/g, ""))
    .filter((item) => item.length >= 7);
  return [...new Set(cleaned)];
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0") && digits.length >= 11) return `234${digits.slice(1)}`;
  return digits;
}

function getPhoneVariants(value: string): string[] {
  const digits = value.replace(/\D/g, "");
  if (!digits) return [];
  const variants = new Set<string>();
  variants.add(digits);
  if (digits.startsWith("0") && digits.length >= 11) {
    variants.add(`234${digits.slice(1)}`);
  } else if (digits.startsWith("234")) {
    variants.add(`0${digits.slice(3)}`);
  }
  return [...variants];
}

function cleanKeyword(message: string): string {
  return message
    .toLowerCase()
    .replace(
      /^(show\s+me\s+my|show\s+my|find\s+my|get\s+my|retrieve|search\s+for|search|look\s+up|what\s+is\s+my|what\s+was\s+my|do\s+i\s+have|give\s+me|tell\s+me|what\s+is|what\s+are|can\s+you\s+find|i\s+need|bring\s+up|pull\s+up)\s+/i,
      ""
    )
    .replace(/\b(my|me|please|the|a|an|i|saved?|stored?|for|about|all)\b/gi, " ")
    // ✅ Also strip file type words from keyword so search is cleaner
    .replace(/\b(image|images|photo|photos|picture|pictures|img|screenshot|pic|snap|jpg|jpeg|png)\b/gi, " ")
    .replace(/\b(document|documents|doc|docs|pdf|file|files|receipt|invoice|contract|report)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitKeywords(keyword: string): string[] {
  return [...new Set(
    keyword.split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 1)
  )];
}

function buildFtsQuery(keyword: string): string {
  const words = splitKeywords(keyword);
  if (!words.length) return "";
  return words
    .map((w) => `'${w.replace(/'/g, " ")}'`)
    .join(" | ");
}

function summarizeNote(note: NoteRow, index: number): string {
  const title = safeString(note.title);
  const content = safeString(note.content);
  const preview = title || content;
  return `${index + 1}. ${preview.slice(0, 100)}`;
}

function summarizeFile(file: FileRow, index: number): string {
  const name = safeString(file.file_name);
  const desc = safeString(file.description);
  return `${index + 1}. ${name || desc || "Unnamed file"}`;
}

// ✅ Detect file intent from ORIGINAL message before any cleaning
function detectFileIntent(message: string) {
  const lower = message.toLowerCase();
  return {
    lookingForImage:
      /\b(image|images|photo|photos|picture|pictures|img|screenshot|screenshots|pic|pics|snap|jpg|jpeg|png)\b/i.test(lower) ||
      /\b(show|find|get|retrieve|display|see|view)\b.{0,30}\b(upload(ed)?|scanned?|taken?|saved?|stored?)\b/i.test(lower),

    lookingForDoc:
      /\b(document|documents|doc|docs|pdf|pdfs|file|files|receipt|receipts|invoice|invoices|contract|contracts|report|reports)\b/i.test(lower),
  };
}

function dedupeNotes(notes: NoteRow[]): NoteRow[] {
  const seen = new Set<string>();
  const output: NoteRow[] = [];
  for (const note of notes) {
    const id = String(note.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(note);
  }
  return output;
}

// ─── FILE SEARCH FUNCTIONS ────────────────────────────────────

async function searchDocuments(userId: string, keyword: string) {
  if (!keyword || keyword.trim().length < 2) {
    const { data, error } = await serverSupabase
      .from("documents").select("*").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(5);
    if (error) { console.error("[Retrieve] Documents error:", error); return null; }
    return (data ?? []) as FileRow[];
  }
  const safeKeyword = escapeLike(keyword);
  const { data, error } = await serverSupabase
    .from("documents").select("*").eq("user_id", userId)
    .or(
      `description.ilike.%${safeKeyword}%,` +
      `file_name.ilike.%${safeKeyword}%,` +
      `file_type.ilike.%${safeKeyword}%`
    )
    .order("created_at", { ascending: false }).limit(5);
  if (error) { console.error("[Retrieve] Documents error:", error); return null; }
  return (data ?? []) as FileRow[];
}

async function searchImages(userId: string, keyword: string) {
  if (!keyword || keyword.trim().length < 2) {
    const { data, error } = await serverSupabase
      .from("images").select("*").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(5);
    if (error) { console.error("[Retrieve] Images error:", error); return null; }
    return (data ?? []) as FileRow[];
  }
  const safeKeyword = escapeLike(keyword);
  const { data, error } = await serverSupabase
    .from("images").select("*").eq("user_id", userId)
    .or(
      `description.ilike.%${safeKeyword}%,` +
      `file_name.ilike.%${safeKeyword}%,` +
      `file_type.ilike.%${safeKeyword}%`
    )
    .order("created_at", { ascending: false }).limit(5);
  if (error) { console.error("[Retrieve] Images error:", error); return null; }
  return (data ?? []) as FileRow[];
}

async function createSignedUrl(bucket: string, filePath: string) {
  const { data, error } = await serverSupabase.storage
    .from(bucket).createSignedUrl(filePath, 3600);
  if (error) {
    console.error(`[Retrieve] Signed URL error for ${bucket}/${filePath}:`, error);
    return null;
  }
  return data?.signedUrl ?? null;
}

function buildFileResponse(
  type: "image" | "document",
  files: FileRow[],
  signedUrl: string | null
) {
  const first = files[0];
  const emoji = type === "image" ? "🖼️" : "📄";
  const label = type === "image" ? "image" : "document";
  let message = `${emoji} Found your ${label}!`;
  if (files.length > 1) {
    message += `\n\n${files.length} ${label}s found — showing most recent.`;
  }
  return Response.json({
    type: "file_card",
    message,
    fileCard: {
      id: first.id,
      fileName: first.file_name,
      description: first.description,
      fileType: type === "image" ? "image" : first.file_type,
      filePath: first.file_path,
      signedUrl,
      createdAt: first.created_at,
    },
    results: files,
  });
}

// ─── COMBINED SCORED NOTE SEARCH ──────────────────────────────

async function searchNotes(
  userId: string,
  keyword: string,
  phoneVariants: string[]
): Promise<NoteRow[]> {

  const scoreMap = new Map<string, ScoredNote>();

  const addResults = (notes: NoteRow[] | null, score: number) => {
    if (!notes?.length) return;
    for (const note of notes) {
      const id = String(note.id ?? "");
      if (!id) continue;
      const existing = scoreMap.get(id);
      if (!existing || score > existing.score) {
        scoreMap.set(id, { ...note, score });
      }
    }
  };

  // Step 1: Phone — score 5
  if (phoneVariants.length) {
    const phoneQuery = phoneVariants
      .filter(Boolean)
      .flatMap((p) => [
        `content.ilike.%${escapeLike(p)}%`,
        `title.ilike.%${escapeLike(p)}%`,
      ])
      .join(",");
    if (phoneQuery) {
      const { data } = await serverSupabase
        .from("notes").select("*").eq("user_id", userId)
        .or(phoneQuery).order("created_at", { ascending: false }).limit(5);
      addResults(data as NoteRow[], 5);
      console.log(`[Search] Step 1 Phone: ${data?.length ?? 0}`);
    }
  }

  if (!keyword) {
    return Array.from(scoreMap.values()).sort((a, b) => b.score - a.score).slice(0, 5);
  }

  // Step 2: Exact phrase — score 4
  const { data: exactData } = await serverSupabase
    .from("notes").select("*").eq("user_id", userId)
    .or(`content.ilike.%${escapeLike(keyword)}%,title.ilike.%${escapeLike(keyword)}%`)
    .order("created_at", { ascending: false }).limit(5);
  addResults(exactData as NoteRow[], 4);
  console.log(`[Search] Step 2 Exact: ${exactData?.length ?? 0}`);

  // Step 3: FTS — score 3
  const ftsQuery = buildFtsQuery(keyword);
  if (ftsQuery) {
    const { data: ftsData, error: ftsError } = await serverSupabase
      .from("notes").select("*").eq("user_id", userId)
      .textSearch("fts", ftsQuery, { type: "websearch", config: "english" })
      .order("created_at", { ascending: false }).limit(5);
    if (!ftsError) {
      addResults(ftsData as NoteRow[], 3);
      console.log(`[Search] Step 3 FTS: ${ftsData?.length ?? 0}`);
    } else {
      console.warn("[Search] FTS error:", ftsError.message);
    }
  }

  // Step 4: Normalized — score 2
  const { data: normalizedData } = await serverSupabase
    .from("notes").select("*").eq("user_id", userId)
    .ilike("normalized_content", `%${escapeLike(keyword.toLowerCase())}%`)
    .order("created_at", { ascending: false }).limit(5);
  addResults(normalizedData as NoteRow[], 2);
  console.log(`[Search] Step 4 Normalized: ${normalizedData?.length ?? 0}`);

  // Step 5: Word by word — score 1
  const words = splitKeywords(keyword);
  if (words.length) {
    const wordQuery = words
      .flatMap((word) => {
        const safeWord = escapeLike(word);
        return [
          `content.ilike.%${safeWord}%`,
          `title.ilike.%${safeWord}%`,
          `category.ilike.%${safeWord}%`,
        ];
      })
      .join(",");
    const { data: wordData } = await serverSupabase
      .from("notes").select("*").eq("user_id", userId)
      .or(wordQuery).order("created_at", { ascending: false }).limit(5);
    addResults(wordData as NoteRow[], 1);
    console.log(`[Search] Step 5 Words: ${wordData?.length ?? 0}`);
  }

  const sorted = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score).slice(0, 5);
  console.log(`[Search] Total: ${sorted.length}`);
  return sorted;
}

async function fetchRecentNotes(userId: string) {
  const { data, error } = await serverSupabase
    .from("notes").select("*").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(3);
  if (error) { console.error("[Retrieve] Recent notes error:", error); return null; }
  return (data ?? []) as NoteRow[];
}

// ─── MAIN HANDLER ─────────────────────────────────────────────
export async function handleRetrieve(
  message: string,
  userId: string,
  entities: ExtractedEntity[] = []
) {
  if (!userId) {
    return Response.json(
      { type: "system", message: "Please log in to search your notes." },
      { status: 401 }
    );
  }

  const cleanMessage = typeof message === "string"
    ? message.trim()
    : String(message ?? "").trim();

  console.log(`[Retrieve] message: "${cleanMessage}" | entities: ${entities.length}`);

  if (!cleanMessage) {
    return Response.json(
      { type: "system", message: "No search query provided." },
      { status: 400 }
    );
  }

  try {
    // ✅ Step 1 — Detect file intent from ORIGINAL message FIRST
    const { lookingForDoc, lookingForImage } = detectFileIntent(cleanMessage);

    // ✅ Step 2 — Clean keyword AFTER detection (strips file words too)
    const lowerKeyword = cleanKeyword(cleanMessage);

    // ✅ Step 3 — Extract phones
    const entityPhones = entities
      .filter((e) => e.entity === "phone")
      .map((e) => safeString(e.value ?? e.sourceText));

    const rawPhones = entityPhones.length
      ? entityPhones
      : extractPhones(cleanMessage);

    const normalizedPhones = rawPhones.map(normalizePhone).filter(Boolean);
    const phoneVariants = [
      ...new Set(
        [...rawPhones, ...normalizedPhones].flatMap((p) => getPhoneVariants(p))
      ),
    ];

    console.log(
      `[Retrieve] keyword="${lowerKeyword}" | image=${lookingForImage} | doc=${lookingForDoc} | phones=${JSON.stringify(phoneVariants)}`
    );

    // ─── IMAGES — go straight to point ───────────────────
    if (lookingForImage) {
      console.log(`[Retrieve] Image search: "${lowerKeyword}"`);
      const images = await searchImages(userId, lowerKeyword);

      if (images?.length) {
        const signedUrl = await createSignedUrl("images", images[0].file_path);
        return buildFileResponse("image", images, signedUrl);
      }

      // ✅ Image not found — do NOT search notes, tell user directly
      return Response.json({
        type: "not_found",
        message: lowerKeyword
          ? `🖼️ No images found matching *"${lowerKeyword}"*.\n\nTap the **+** button to upload an image.`
          : `🖼️ You have no uploaded images yet.\n\nTap the **+** button to upload one.`,
      });
    }

    // ─── DOCUMENTS — go straight to point ────────────────
    if (lookingForDoc) {
      console.log(`[Retrieve] Document search: "${lowerKeyword}"`);
      const docs = await searchDocuments(userId, lowerKeyword);

      if (docs?.length) {
        const signedUrl = await createSignedUrl("documents", docs[0].file_path);
        return buildFileResponse("document", docs, signedUrl);
      }

      // ✅ Doc not found — do NOT search notes, tell user directly
      return Response.json({
        type: "not_found",
        message: lowerKeyword
          ? `📄 No documents found matching *"${lowerKeyword}"*.\n\nTap the **+** button to upload a document.`
          : `📄 You have no uploaded documents yet.\n\nTap the **+** button to upload one.`,
      });
    }

    // ─── NOTES SEARCH ─────────────────────────────────────
    const rawResults = await searchNotes(userId, lowerKeyword, phoneVariants);
    const notes = dedupeNotes(rawResults).slice(0, 5);

    if (notes.length === 1) {
      const reply = buildSmartReply(cleanMessage, notes, "note");
      return Response.json({
        type: "retrieve_result",
        message: reply,
        note: notes[0],
        matches: 1,
      });
    }

    if (notes.length > 1) {
      return Response.json({
        type: "retrieve_multiple",
        message: `Found ${notes.length} matches for *"${lowerKeyword}"*:\n\n${notes.map(summarizeNote).join("\n")}`,
        notes,
        matches: notes.length,
      });
    }

    // ─── NOTHING FOUND IN NOTES ───────────────────────────
    // ✅ Now also check images and docs before giving up
    console.log(`[Retrieve] No notes found — checking files as fallback`);

    const [fallbackImages, fallbackDocs] = await Promise.all([
      searchImages(userId, lowerKeyword),
      searchDocuments(userId, lowerKeyword),
    ]);

    const hasImages = (fallbackImages?.length ?? 0) > 0;
    const hasDocs = (fallbackDocs?.length ?? 0) > 0;

    if (hasImages || hasDocs) {
      let fallbackMsg = `No notes found for *"${lowerKeyword}"*, but I found:\n\n`;

      if (hasImages) {
        fallbackMsg += `🖼️ **${fallbackImages!.length} image(s):**\n`;
        fallbackMsg += fallbackImages!.map(summarizeFile).join("\n");
        fallbackMsg += `\n\nSay *"show my images"* to view them.\n`;
      }

      if (hasDocs) {
        fallbackMsg += `\n📄 **${fallbackDocs!.length} document(s):**\n`;
        fallbackMsg += fallbackDocs!.map(summarizeFile).join("\n");
        fallbackMsg += `\n\nSay *"show my documents"* to view them.`;
      }

      return Response.json({
        type: "not_found",
        message: fallbackMsg,
      });
    }

    // ─── TRULY NOTHING FOUND ──────────────────────────────
    const recentNotes = await fetchRecentNotes(userId);
    if (recentNotes?.length) {
      return Response.json({
        type: "not_found",
        message: `Nothing found for *"${lowerKeyword}"*.\n\nYour recent saves:\n\n${recentNotes.map(summarizeNote).join("\n")}`,
        recentNotes,
      });
    }

    return Response.json({
      type: "not_found",
      message: `Nothing saved yet matching *"${lowerKeyword}"*.\n\nTry:\n→ *"Save John number 08031234567"*\n→ Tap **+** to upload files`,
    });

  } catch (error) {
    console.error("[Retrieve Handler] Unexpected error:", error);
    return Response.json(
      { type: "system", message: "Server error. Please try again." },
      { status: 500 }
    );
  }
}