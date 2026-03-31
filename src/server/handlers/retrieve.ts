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

type FileRow = {
  id: string;
  file_name?: string | null;
  description?: string | null;
  file_type?: string | null;
  file_path: string;
  created_at?: string | null;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "\\$&");
}

function extractPhones(text: string): string[] {
  const matches = text.match(/(?:\+?\d[\d\s\-()]{8,}\d)/g) ?? [];
  const cleaned = matches.map((item) => item.replace(/[^\d+]/g, "")).filter(Boolean);
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
  if (digits.startsWith("0")) {
    variants.add(digits);
    if (digits.length >= 11) variants.add(`234${digits.slice(1)}`);
  } else if (digits.startsWith("234")) {
    variants.add(digits);
    variants.add(`0${digits.slice(3)}`);
  } else {
    variants.add(digits);
  }
  return [...variants];
}

function cleanKeyword(message: string): string {
  return message
    .toLowerCase()
    .replace(
      /^(show\s+me\s+my|show\s+my|find\s+my|get\s+my|retrieve|search\s+for|search|look\s+up|what\s+is\s+my|what\s+was\s+my|do\s+i\s+have)\s+/i,
      ""
    )
    .replace(/\b(my|me|please|the|a|an|i|saved?|stored?|for|about)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitKeywords(keyword: string): string[] {
  return [...new Set(
    keyword.split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 1)
  )];
}

function buildFtsQuery(keyword: string): string {
  return splitKeywords(keyword)
    .map((w) => `'${w.replace(/'/g, " ")}'`)
    .join(" | ");
}

function summarizeNote(note: NoteRow, index: number): string {
  const title = safeString(note.title);
  const content = safeString(note.content);
  const preview = title || content;
  return `${index + 1}. ${preview.slice(0, 100)}`;
}

function detectFileIntent(message: string) {
  return {
    lookingForDoc: /\b(document|doc|pdf|file|receipt|invoice)\b/i.test(message),
    lookingForImage: /\b(image|photo|picture|img|screenshot)\b/i.test(message),
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

// ─── DB SEARCH FUNCTIONS ──────────────────────────────────────

async function searchDocuments(userId: string, keyword: string) {
  const safeKeyword = escapeLike(keyword);
  const { data, error } = await serverSupabase
    .from("documents").select("*").eq("user_id", userId)
    .or(`description.ilike.%${safeKeyword}%,file_name.ilike.%${safeKeyword}%,file_type.ilike.%${safeKeyword}%`)
    .order("created_at", { ascending: false }).limit(5);
  if (error) { console.error("[Retrieve] Documents search error:", error); return null; }
  return (data ?? []) as FileRow[];
}

async function searchImages(userId: string, keyword: string) {
  const safeKeyword = escapeLike(keyword);
  const { data, error } = await serverSupabase
    .from("images").select("*").eq("user_id", userId)
    .or(`description.ilike.%${safeKeyword}%,file_name.ilike.%${safeKeyword}%`)
    .order("created_at", { ascending: false }).limit(5);
  if (error) { console.error("[Retrieve] Images search error:", error); return null; }
  return (data ?? []) as FileRow[];
}

async function createSignedUrl(bucket: string, filePath: string) {
  const { data, error } = await serverSupabase.storage.from(bucket).createSignedUrl(filePath, 600);
  if (error) { console.error(`[Retrieve] Signed URL error:`, error); return null; }
  return data?.signedUrl ?? null;
}

async function searchNotesByPhones(userId: string, phoneVariants: string[]) {
  if (!phoneVariants.length) return null;
  const phoneQueries = phoneVariants
    .filter(Boolean)
    .flatMap((p) => [
      `content.ilike.%${escapeLike(p)}%`,
      `title.ilike.%${escapeLike(p)}%`,
    ])
    .join(",");
  if (!phoneQueries) return null;
  const { data, error } = await serverSupabase
    .from("notes").select("*").eq("user_id", userId).or(phoneQueries)
    .order("created_at", { ascending: false }).limit(5);
  if (error) { console.error("[Retrieve] Phone search error:", error); return null; }
  return (data ?? []) as NoteRow[];
}

async function searchNotesByFts(userId: string, keyword: string) {
  if (!keyword) return null;
  const ftsQuery = buildFtsQuery(keyword);
  if (!ftsQuery) return null;
  const { data, error } = await serverSupabase
    .from("notes").select("*").eq("user_id", userId)
    .textSearch("fts", ftsQuery)
    .order("created_at", { ascending: false }).limit(5);
  if (error) { console.error("[Retrieve] FTS search error:", error); return null; }
  return (data ?? []) as NoteRow[];
}

async function searchNotesByKeywords(userId: string, keyword: string) {
  const words = splitKeywords(keyword);
  if (!words.length) return null;
  const orQuery = words
    .flatMap((word) => {
      const safeWord = escapeLike(word);
      return [
        `content.ilike.%${safeWord}%`,
        `title.ilike.%${safeWord}%`,
        `category.ilike.%${safeWord}%`,
      ];
    })
    .join(",");
  const { data, error } = await serverSupabase
    .from("notes").select("*").eq("user_id", userId).or(orQuery)
    .order("created_at", { ascending: false }).limit(5);
  if (error) { console.error("[Retrieve] Keyword search error:", error); return null; }
  return (data ?? []) as NoteRow[];
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
  message: string,        // ✅ always a plain string
  userId: string,
  entities: ExtractedEntity[] = []
) {
  if (!userId) {
    return Response.json(
      { type: "system", message: "Please log in to search your notes." },
      { status: 401 }
    );
  }

  // ✅ Safe string guard — no more .trim() on non-strings
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
    const lowerKeyword = cleanKeyword(cleanMessage);

    // ✅ Use phone entities from NLP if available, else extract from text
    const entityPhones = entities
      .filter((e) => e.entity === "phone")
      .map((e) => safeString(e.value ?? e.sourceText));

    const rawPhones = entityPhones.length ? entityPhones : extractPhones(cleanMessage);
    const normalizedPhones = rawPhones.map(normalizePhone).filter(Boolean);
    const phoneVariants = [
      ...new Set(
        [...rawPhones, ...normalizedPhones].flatMap((p) => getPhoneVariants(p))
      ),
    ];

    console.log(`[Retrieve] keyword="${lowerKeyword}" phones=${JSON.stringify(phoneVariants)}`);

    const { lookingForDoc, lookingForImage } = detectFileIntent(cleanMessage);

    // ─── DOCUMENTS ────────────────────────────────────────
    if (lookingForDoc) {
      const docs = await searchDocuments(userId, lowerKeyword);
      if (docs && docs.length > 0) {
        const first = docs[0];
        const signedUrl = await createSignedUrl("documents", first.file_path);
        return Response.json({
          type: "file_card",
          message: "📄 Found your document!",
          fileCard: {
            id: first.id,
            fileName: first.file_name,
            description: first.description,
            fileType: first.file_type,
            filePath: first.file_path,
            signedUrl,
            createdAt: first.created_at,
          },
          results: docs,
        });
      }
      return Response.json({
        type: "not_found",
        message: `📄 No documents found matching *"${lowerKeyword}"*.`,
      });
    }

    // ─── IMAGES ───────────────────────────────────────────
    if (lookingForImage) {
      const images = await searchImages(userId, lowerKeyword);
      if (images && images.length > 0) {
        const first = images[0];
        const signedUrl = await createSignedUrl("images", first.file_path);
        return Response.json({
          type: "file_card",
          message: "🖼️ Found your image!",
          fileCard: {
            id: first.id,
            fileName: first.file_name,
            description: first.description,
            fileType: "image",
            filePath: first.file_path,
            signedUrl,
            createdAt: first.created_at,
          },
          results: images,
        });
      }
      return Response.json({
        type: "not_found",
        message: `🖼️ No images found matching *"${lowerKeyword}"*.`,
      });
    }

    // ─── NOTES: phone → FTS → keyword fallback ────────────
    let collectedNotes: NoteRow[] = [];

    if (phoneVariants.length) {
      const phoneResults = await searchNotesByPhones(userId, phoneVariants);
      if (phoneResults?.length) collectedNotes = [...phoneResults];
    }

    if (!collectedNotes.length && lowerKeyword) {
      const ftsResults = await searchNotesByFts(userId, lowerKeyword);
      if (ftsResults?.length) collectedNotes = [...ftsResults];
    }

    if (!collectedNotes.length && lowerKeyword) {
      const fallbackResults = await searchNotesByKeywords(userId, lowerKeyword);
      if (fallbackResults?.length) collectedNotes = [...fallbackResults];
    }

    const notes = dedupeNotes(collectedNotes).slice(0, 5);

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

    // ─── NOTHING FOUND — show recent notes ────────────────
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
      message: `Nothing saved yet matching *"${lowerKeyword}"*.\n\nTry: *"Save John number 08031234567"*`,
    });

  } catch (error) {
    console.error("[Retrieve Handler] Unexpected error:", error);
    return Response.json(
      { type: "system", message: "Server error. Please try again." },
      { status: 500 }
    );
  }
}