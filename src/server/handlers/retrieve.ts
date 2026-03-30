import { serverSupabase } from "@/server/supabase";
import { extractSearchKeyword, normalizeText } from "@/server/helpers";
import { buildSmartReply } from "@/server/nlp/replyBuilder";

type RetrieveEntity = {
  entity: string;
  sourceText: string;
  value?: string;
  accuracy?: number;
};

type RetrievePayload = {
  message?: string;
  entities?: RetrieveEntity[];
  intentScore?: number;
  intentSource?: string;
};

type NoteRow = {
  id: string;
  user_id: string;
  title?: string | null;
  content?: string | null;
  category?: string | null;
  normalized_content?: string | null;
  created_at?: string | null;
  metadata?: any;
};

function isRequestLike(value: unknown): value is Request {
  return !!value && typeof value === "object" && "json" in value;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function extractPayload(
  input: Request | string | RetrievePayload
): Promise<RetrievePayload> {
  if (typeof input === "string") {
    return { message: input };
  }

  if (isRequestLike(input)) {
    return input
      .json()
      .then((body) =>
        body && typeof body === "object" ? (body as RetrievePayload) : {}
      )
      .catch(() => ({}));
  }

  return input ?? {};
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;

  return digits;
}

function extractPhones(text: string): string[] {
  const matches = text.match(/(?:\+?\d[\d\s-]{7,}\d)/g) ?? [];
  return [...new Set(matches.map((item) => normalizePhone(item)).filter(Boolean))];
}

function normalizeKeyword(keyword: string): string {
  return normalizeText(keyword || "").trim();
}

function getSearchKeyword(message: string): string {
  const extracted = safeString(extractSearchKeyword(message));
  if (extracted) return extracted;

  return message
    .replace(
      /^(show|find|get|retrieve|search(?:\s+for)?|look\s+up|what\s+is|what\s+was|do\s+i\s+have)\s+/i,
      ""
    )
    .replace(/\b(my|me|please)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function noteToSearchBlob(note: NoteRow): string {
  return normalizeText(
    [
      note.title ?? "",
      note.content ?? "",
      note.category ?? "",
      note.normalized_content ?? "",
    ].join(" ")
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreNote(note: NoteRow, keyword: string, phones: string[]): number {
  const content = safeString(note.content);
  const title = safeString(note.title);
  const category = safeString(note.category);
  const normalizedBlob = noteToSearchBlob(note);

  let score = 0;

  const normalizedKeyword = normalizeKeyword(keyword);
  const normalizedTitle = normalizeText(title);
  const normalizedContent = normalizeText(content);
  const normalizedCategory = normalizeText(category);

  // ── PHONE / NUMBER PRIORITY ────────────────────────────────
  if (phones.length > 0) {
    const contentPhones = extractPhones(content);
    const titlePhones = extractPhones(title);
    const metadataPhones = Array.isArray(note.metadata?.phones)
      ? note.metadata.phones
          .map((p: unknown) => normalizePhone(String(p ?? "")))
          .filter(Boolean)
      : [];

    const allStoredPhones = [...new Set([...contentPhones, ...titlePhones, ...metadataPhones])];

    for (const phone of phones) {
      if (allStoredPhones.includes(phone)) {
        score += 1000; // exact stored phone match should win first
      } else if (allStoredPhones.some((p) => p.includes(phone) || phone.includes(p))) {
        score += 600;
      }
    }
  }

  // ── EXACT TEXT PRIORITY ────────────────────────────────────
  if (normalizedKeyword) {
    if (normalizedContent === normalizedKeyword) score += 900;
    if (normalizedTitle === normalizedKeyword) score += 850;
    if (normalizedCategory === normalizedKeyword) score += 300;

    if (normalizedContent.includes(normalizedKeyword)) score += 260;
    if (normalizedTitle.includes(normalizedKeyword)) score += 220;
    if (normalizedCategory.includes(normalizedKeyword)) score += 120;

    const exactWordRegex = new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, "i");
    if (exactWordRegex.test(normalizedBlob)) score += 180;

    const keywordWords = normalizedKeyword.split(/\s+/).filter(Boolean);
    for (const word of keywordWords) {
      if (!word) continue;
      const wordRegex = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
      if (wordRegex.test(normalizedBlob)) score += 40;
    }
  }

  // ── SMALL RECENCY BONUS ────────────────────────────────────
  if (note.created_at) {
    const createdTime = new Date(note.created_at).getTime();
    if (!Number.isNaN(createdTime)) {
      const ageMs = Date.now() - createdTime;
      const oneDay = 24 * 60 * 60 * 1000;
      if (ageMs < oneDay) score += 20;
      else if (ageMs < 7 * oneDay) score += 10;
    }
  }

  return score;
}

function buildMultipleNotesMessage(keyword: string, notes: NoteRow[]): string {
  const label = keyword || "your search";
  const lines = notes.slice(0, 5).map((note, index) => {
    const preview = safeString(note.content).slice(0, 90);
    return `${index + 1}. ${preview}`;
  });

  return `I found ${notes.length} matches for "${label}". Here are the closest ones:\n\n${lines.join(
    "\n"
  )}`;
}

// ─── RETRIEVE HANDLER ─────────────────────────────────────────
// Supports:
// handleRetrieve("find john", userId)
// handleRetrieve(request, userId)
export async function handleRetrieve(
  input: Request | string | RetrievePayload,
  userId: string
) {
  if (!userId) {
    return Response.json(
      { type: "system", message: "Please log in to search your notes." },
      { status: 401 }
    );
  }

  try {
    const payload = await extractPayload(input);
    const message = safeString(payload.message);
    const entities = Array.isArray(payload.entities) ? payload.entities : [];

    if (!message) {
      return Response.json(
        { type: "system", message: "Missing message" },
        { status: 400 }
      );
    }

    const keyword = getSearchKeyword(message);
    const lower = message.toLowerCase();

    const lookingForDoc =
      lower.includes("document") ||
      lower.includes("doc") ||
      lower.includes("pdf") ||
      lower.includes("file") ||
      (lower.includes("receipt") && lower.includes("upload"));

    const lookingForImage =
      lower.includes("image") ||
      lower.includes("photo") ||
      lower.includes("picture") ||
      lower.includes("img");

    const phonesFromMessage = extractPhones(message);
    const phonesFromKeyword = extractPhones(keyword);
    const phonesFromEntities = entities
      .filter((e) => e.entity === "phone")
      .map((e) => normalizePhone(e.sourceText));

    const allPhones = [
      ...new Set([...phonesFromMessage, ...phonesFromKeyword, ...phonesFromEntities].filter(Boolean)),
    ];

    // ─── SEARCH DOCUMENTS ─────────────────────────────────────
    if (lookingForDoc) {
      const { data: docs, error: docsError } = await serverSupabase
        .from("documents")
        .select("*")
        .eq("user_id", userId)
        .ilike("description", `%${keyword}%`)
        .order("created_at", { ascending: false })
        .limit(5);

      if (docsError) {
        console.error("[Retrieve Handler] Docs search error:", docsError);
      }

      if (docs && docs.length > 0) {
        const reply = buildSmartReply(message, docs, "document");

        const { data: signedUrlData, error: urlError } = await serverSupabase.storage
          .from("documents")
          .createSignedUrl(docs[0].file_path, 60 * 10);

        if (urlError) {
          console.error("[Retrieve Handler] Signed URL error:", urlError);
        }

        return Response.json({
          type: "file_card",
          message: reply,
          fileCard: {
            id: docs[0].id,
            fileName: docs[0].file_name,
            description: docs[0].description,
            fileType: docs[0].file_type,
            filePath: docs[0].file_path,
            signedUrl: signedUrlData?.signedUrl ?? null,
            createdAt: docs[0].created_at,
          },
        });
      }
    }

    // ─── SEARCH IMAGES ────────────────────────────────────────
    if (lookingForImage) {
      const { data: images, error: imagesError } = await serverSupabase
        .from("images")
        .select("*")
        .eq("user_id", userId)
        .ilike("description", `%${keyword}%`)
        .order("created_at", { ascending: false })
        .limit(5);

      if (imagesError) {
        console.error("[Retrieve Handler] Images search error:", imagesError);
      }

      if (images && images.length > 0) {
        const reply = buildSmartReply(message, images, "image");

        const { data: signedUrlData, error: urlError } = await serverSupabase.storage
          .from("images")
          .createSignedUrl(images[0].file_path, 60 * 10);

        if (urlError) {
          console.error("[Retrieve Handler] Image signed URL error:", urlError);
        }

        return Response.json({
          type: "file_card",
          message: reply,
          fileCard: {
            id: images[0].id,
            fileName: images[0].file_name,
            description: images[0].description,
            fileType: "image",
            filePath: images[0].file_path,
            signedUrl: signedUrlData?.signedUrl ?? null,
            createdAt: images[0].created_at,
          },
        });
      }
    }

    // ─── SEARCH NOTES (LOAD MORE, RANK IN APP) ────────────────
    // Important fix:
    // fetch candidate rows first, then rank exact DB matches before returning.
    const { data: notes, error: notesError } = await serverSupabase
      .from("notes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(150);

    if (notesError) {
      console.error("[Retrieve Handler] Notes search error:", notesError);
      return Response.json(
        {
          type: "system",
          message: "❌ Failed to search your notes. Please try again.",
        },
        { status: 500 }
      );
    }

    const noteRows = (notes ?? []) as NoteRow[];

    const ranked = noteRows
      .map((note) => ({
        note,
        score: scoreNote(note, keyword, allPhones),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        const aTime = a.note.created_at ? new Date(a.note.created_at).getTime() : 0;
        const bTime = b.note.created_at ? new Date(b.note.created_at).getTime() : 0;
        return bTime - aTime;
      });

    const matchedNotes = ranked.map((item) => item.note);

    if (matchedNotes.length > 0) {
      // Exact/best match check:
      const best = ranked[0];
      const second = ranked[1];

      // If best is clearly stronger, return one.
      if (!second || best.score >= second.score + 200) {
        const reply = buildSmartReply(message, [best.note], "note");
        return Response.json({
          type: "retrieve_result",
          message: reply,
          note: best.note,
          matches: 1,
        });
      }

      // If several close matches exist, return multiple so user can choose.
      return Response.json({
        type: "retrieve_multiple",
        message: buildMultipleNotesMessage(keyword, matchedNotes),
        notes: matchedNotes.slice(0, 5).map((note) => ({
          id: note.id,
          title: note.title,
          content: note.content,
          category: note.category,
          created_at: note.created_at,
        })),
        matches: matchedNotes.length,
      });
    }

    // ─── SHOW RECENT NOTES AS FALLBACK ────────────────────────
    const recentNotes = noteRows.slice(0, 3);

    if (recentNotes.length > 0) {
      return Response.json({
        type: "not_found",
        message: `I couldn't find "${keyword}" exactly in your current database. Here are your recent saves:\n\n${recentNotes
          .map((n, i) => `${i + 1}. ${safeString(n.content).slice(0, 80)}`)
          .join("\n")}`,
      });
    }

    // ─── NOTHING SAVED YET ────────────────────────────────────
    return Response.json({
      type: "not_found",
      message: `I couldn't find anything matching "${keyword}". Try saving first by saying 'save my [your info]'`,
    });
  } catch (error) {
    console.error("[Retrieve Handler] Unexpected error:", error);
    return Response.json(
      { type: "system", message: "Server error. Please try again." },
      { status: 500 }
    );
  }
}