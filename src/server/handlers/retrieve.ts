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

type ProductPriceRow = {
  id: string;
  product_name: string;
  price: number;
  currency?: string | null;
  category?: string | null;
  description?: string | null;
  normalized_content?: string | null;
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
  const matches =
    text.match(
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
  if (digits.startsWith("0") && digits.length >= 11) {
    return `234${digits.slice(1)}`;
  }
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
    .replace(/\b(please|the|a|an|saved?|stored?)\b/gi, " ")
    .replace(/\b(image|images|photo|photos|picture|pictures|img|screenshot|pic|snap|jpg|jpeg|png)\b/gi, " ")
    .replace(/\b(document|documents|doc|docs|pdf|file|files|receipt|invoice|contract|report)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPriceKeyword(message: string): string {
  return message
    .toLowerCase()
    .replace(
      /^(show\s+me\s+my|show\s+my|find\s+my|get\s+my|retrieve|search\s+for|search|look\s+up|what\s+is\s+my|what\s+was\s+my|do\s+i\s+have|give\s+me|tell\s+me|what\s+is|what\s+are|can\s+you\s+find|i\s+need|bring\s+up|pull\s+up)\s+/i,
      ""
    )
    .replace(/\b(price|prices|cost|costs|how\s+much|rate|rates|worth|naira|ngn)\b/gi, " ")
    .replace(/\b(the|a|an|please|for|of|about|saved?|stored?|all|is|are)\b/gi, " ")
    .replace(/[?.,!₦]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitKeywords(keyword: string): string[] {
  return [
    ...new Set(
      keyword
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 1)
    ),
  ];
}

function buildFtsQuery(keyword: string): string {
  const words = splitKeywords(keyword);
  if (!words.length) return "";
  return words.map((w) => `'${w.replace(/'/g, " ")}'`).join(" | ");
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

function summarizePrice(price: ProductPriceRow, index: number): string {
  const currency = price.currency ?? "NGN";
  const symbol = currency === "NGN" ? "₦" : currency;
  return `${index + 1}. ${price.product_name} — ${symbol}${price.price}`;
}

function detectPriceIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\b(price|prices|cost|costs|how much|rate|rates|worth|sell|selling|market|naira)\b/.test(lower) ||
    /ngn/i.test(lower) ||
    message.includes("₦")
  );
}

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

function normalizeSimpleText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── FILE SEARCH ──────────────────────────────────────────────

async function searchDocuments(userId: string, keyword: string) {
  if (!keyword || keyword.trim().length < 2) {
    const { data, error } = await serverSupabase
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("[Retrieve] Documents error:", error);
      return null;
    }
    return (data ?? []) as FileRow[];
  }

  const safeKeyword = escapeLike(keyword);

  const { data, error } = await serverSupabase
    .from("documents")
    .select("*")
    .eq("user_id", userId)
    .or(`description.ilike.%${safeKeyword}%,file_name.ilike.%${safeKeyword}%,file_type.ilike.%${safeKeyword}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[Retrieve] Documents error:", error);
    return null;
  }
  return (data ?? []) as FileRow[];
}

async function searchImages(userId: string, keyword: string) {
  if (!keyword || keyword.trim().length < 2) {
    const { data, error } = await serverSupabase
      .from("images")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("[Retrieve] Images error:", error);
      return null;
    }
    return (data ?? []) as FileRow[];
  }

  const safeKeyword = escapeLike(keyword);

  const { data, error } = await serverSupabase
    .from("images")
    .select("*")
    .eq("user_id", userId)
    .or(`description.ilike.%${safeKeyword}%,file_name.ilike.%${safeKeyword}%,file_type.ilike.%${safeKeyword}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[Retrieve] Images error:", error);
    return null;
  }
  return (data ?? []) as FileRow[];
}

async function createSignedUrl(bucket: string, filePath: string) {
  const { data, error } = await serverSupabase.storage
    .from(bucket)
    .createSignedUrl(filePath, 3600);

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

// ─── PRODUCT PRICE SEARCH ─────────────────────────────────────
// KEY FIX: Each tier now requires ALL keyword words to match the
// same product name — not just ANY one word. This prevents "garri"
// from returning "pepper" or "fruit" just because they share a
// common short word.
//
// Tier priority: exact → startsWith → contains → ALL-words match
// Tier 4 (partial word) now uses every() not some(), so all words
// in the query must appear in the product name to qualify.

async function searchProductPrices(
  userId: string,
  keyword: string
): Promise<ProductPriceRow[]> {
  const cleanKw = normalizeSimpleText(keyword);

  // No keyword → return most recent 5
  if (!cleanKw) {
    const { data, error } = await serverSupabase
      .from("product_prices")
      .select("id, product_name, price, currency, category, description, normalized_content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("[PriceSearch] recent fetch error:", error);
      return [];
    }
    return (data ?? []) as ProductPriceRow[];
  }

  // Pull a broad recent set to score in-memory (fast tiers)
  const { data: recentRows, error: recentError } = await serverSupabase
    .from("product_prices")
    .select("id, product_name, price, currency, category, description, normalized_content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (recentError) {
    console.error("[PriceSearch] recent fetch error:", recentError);
    return [];
  }

  const rows = (recentRows ?? []) as ProductPriceRow[];

  // Tier 1 — exact product name match
  const exact = rows.filter(
    (r) => normalizeSimpleText(r.product_name) === cleanKw
  );
  if (exact.length > 0) return exact.slice(0, 5);

  // Tier 2 — product name starts with keyword
  const startsWith = rows.filter((r) =>
    normalizeSimpleText(r.product_name).startsWith(cleanKw)
  );
  if (startsWith.length > 0) return startsWith.slice(0, 5);

  // Tier 3 — product name contains the full keyword string
  const contains = rows.filter((r) =>
    normalizeSimpleText(r.product_name).includes(cleanKw)
  );
  if (contains.length > 0) return contains.slice(0, 5);

  // Tier 4 — ALL keyword words must appear in the product name.
  // FIX: Changed some() → every() so "garri" only matches products
  // whose name contains the word "garri", not any unrelated product.
  const words = splitKeywords(cleanKw);
  if (words.length > 0) {
    const allWordsMatch = rows.filter((r) => {
      const name = normalizeSimpleText(r.product_name);
      // every word in the query must exist in this product name
      return words.every((w) => name.includes(w));
    });
    if (allWordsMatch.length > 0) return allWordsMatch.slice(0, 5);
  }

  // Tier 5 — broader DB fallback using the full keyword string only.
  // FIX: Removed the loose OR across description/category/normalized_content
  // which was causing unrelated products to surface. Now we only match
  // product_name so a search for "garri" can't accidentally return
  // "pepper" because both share the same category or description text.
  const safeKw = escapeLike(cleanKw);
  const { data: fallbackRows, error: fallbackError } = await serverSupabase
    .from("product_prices")
    .select("id, product_name, price, currency, category, description, normalized_content, created_at")
    .eq("user_id", userId)
    .ilike("product_name", `%${safeKw}%`)   // product_name only — no cross-field leakage
    .order("created_at", { ascending: false })
    .limit(5);

  if (fallbackError) {
    console.error("[PriceSearch] fallback error:", fallbackError);
    return [];
  }

  return (fallbackRows ?? []) as ProductPriceRow[];
}

// ─── NOTES SEARCH ─────────────────────────────────────────────

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

  // Pass 1 — phone number variants (highest priority)
  if (phoneVariants.length) {
    const phoneQuery = phoneVariants
      .filter(Boolean)
      .flatMap((p) => [
        `content.ilike.%${escapeLike(p)}%`,
        `title.ilike.%${escapeLike(p)}%`,
      ])
      .join(",");

    if (phoneQuery) {
      const { data, error } = await serverSupabase
        .from("notes")
        .select("*")
        .eq("user_id", userId)
        .or(phoneQuery)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) console.error("[Search] Phone pass error:", error);
      else addResults(data as NoteRow[], 5);
    }
  }

  if (!keyword) {
    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  // Pass 2 — exact ilike match on content/title
  const { data: exactData, error: exactError } = await serverSupabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .or(`content.ilike.%${escapeLike(keyword)}%,title.ilike.%${escapeLike(keyword)}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  if (exactError) console.error("[Search] Exact pass error:", exactError);
  else addResults(exactData as NoteRow[], 4);

  // Pass 3 — full-text search
  const ftsQuery = buildFtsQuery(keyword);
  if (ftsQuery) {
    const { data: ftsData, error: ftsError } = await serverSupabase
      .from("notes")
      .select("*")
      .eq("user_id", userId)
      .textSearch("fts", ftsQuery, { type: "websearch", config: "english" })
      .order("created_at", { ascending: false })
      .limit(5);

    if (ftsError) console.warn("[Search] FTS pass error:", ftsError.message);
    else addResults(ftsData as NoteRow[], 3);
  }

  // Pass 4 — normalized_content ilike
  const { data: normalizedData, error: normalizedError } = await serverSupabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .ilike("normalized_content", `%${escapeLike(keyword.toLowerCase())}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  if (normalizedError) console.error("[Search] Normalized pass error:", normalizedError);
  else addResults(normalizedData as NoteRow[], 2);

  // Pass 5 — individual word hits across content/title/category
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

    const { data: wordData, error: wordError } = await serverSupabase
      .from("notes")
      .select("*")
      .eq("user_id", userId)
      .or(wordQuery)
      .order("created_at", { ascending: false })
      .limit(5);

    if (wordError) console.error("[Search] Word pass error:", wordError);
    else addResults(wordData as NoteRow[], 1);
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime()
      );
    })
    .slice(0, 5);
}

async function fetchRecentNotes(userId: string): Promise<NoteRow[]> {
  const { data, error } = await serverSupabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) {
    console.error("[Retrieve] Recent notes error:", error);
    return [];
  }
  return (data ?? []) as NoteRow[];
}

async function fetchRecentPrices(userId: string): Promise<ProductPriceRow[]> {
  const { data, error } = await serverSupabase
    .from("product_prices")
    .select("id, product_name, price, currency, category, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) {
    console.error("[Retrieve] Recent prices error:", error);
    return [];
  }
  return (data ?? []) as ProductPriceRow[];
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

  const cleanMessage =
    typeof message === "string" ? message.trim() : String(message ?? "").trim();

  console.log(`[Retrieve] message: "${cleanMessage}" | entities: ${entities.length}`);

  if (!cleanMessage) {
    return Response.json(
      { type: "system", message: "No search query provided." },
      { status: 400 }
    );
  }

  try {
    const { lookingForDoc, lookingForImage } = detectFileIntent(cleanMessage);
    const lookingForPrice = detectPriceIntent(cleanMessage);

    const lowerKeyword = cleanKeyword(cleanMessage);
    const priceKeyword = cleanPriceKeyword(cleanMessage);

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

    console.log(
      `[Retrieve] keyword="${lowerKeyword}" | priceKeyword="${priceKeyword}" | image=${lookingForImage} | doc=${lookingForDoc} | price=${lookingForPrice} | phones=${JSON.stringify(phoneVariants)}`
    );

    // ── IMAGE ──────────────────────────────────────────────────
    if (lookingForImage) {
      const images = await searchImages(userId, lowerKeyword);

      if (images?.length) {
        const signedUrl = await createSignedUrl("images", images[0].file_path);
        return buildFileResponse("image", images, signedUrl);
      }

      return Response.json({
        type: "not_found",
        message: lowerKeyword
          ? `No images found matching *"${lowerKeyword}"*.\n\nTap the **+** button to upload an image.`
          : `You have no uploaded images yet.\n\nTap the **+** button to upload one.`,
      });
    }

    // ── DOCUMENT ───────────────────────────────────────────────
    if (lookingForDoc) {
      const docs = await searchDocuments(userId, lowerKeyword);

      if (docs?.length) {
        const signedUrl = await createSignedUrl("documents", docs[0].file_path);
        return buildFileResponse("document", docs, signedUrl);
      }

      return Response.json({
        type: "not_found",
        message: lowerKeyword
          ? `No documents found matching *"${lowerKeyword}"*.\n\nTap the **+** button to upload a document.`
          : `You have no uploaded documents yet.\n\nTap the **+** button to upload one.`,
      });
    }

    // ── PRICE ──────────────────────────────────────────────────
    if (lookingForPrice) {
      console.log(`[Retrieve] Price search: "${priceKeyword}"`);

      const prices = await searchProductPrices(userId, priceKeyword);

      if (prices.length > 0) {
        const best = prices[0];
        const currency = best.currency ?? "NGN";
        const symbol = currency === "NGN" ? "₦" : currency;

        const message =
          prices.length === 1
            ? `💰 *${best.product_name}* — ${symbol}${best.price}${best.category ? `\n_Category: ${best.category}_` : ""}`
            : `💰 Found ${prices.length} price matches:\n\n${prices.map(summarizePrice).join("\n")}`;

        return Response.json({
          type: "price_result",
          message,
          product_price: best,
          matches: prices.length,
          all_prices: prices,
        });
      }

      // Price not found — also try notes before giving up
      console.log(`[Retrieve] No prices found for "${priceKeyword}" — trying notes`);

      const notesForPrice = await searchNotes(userId, priceKeyword, []);
      const dedupedNotesForPrice = dedupeNotes(notesForPrice).slice(0, 3);

      if (dedupedNotesForPrice.length > 0) {
        return Response.json({
          type: "not_found",
          message:
            `No saved price found for *"${priceKeyword}"*.\n\nBut I found related notes:\n\n` +
            dedupedNotesForPrice.map(summarizeNote).join("\n") +
            `\n\nTo save a price: *"Save ${priceKeyword} price 500"*`,
          notes: dedupedNotesForPrice,
        });
      }

      const [recentPrices, recentNotes] = await Promise.all([
        fetchRecentPrices(userId),
        fetchRecentNotes(userId),
      ]);

      let notFoundMsg = `No saved price found for *"${priceKeyword}"*.\n\n`;

      if (recentPrices.length > 0) {
        notFoundMsg += `Your recent prices:\n${recentPrices.map(summarizePrice).join("\n")}\n\n`;
      }

      if (recentNotes.length > 0) {
        notFoundMsg += `Your recent notes:\n${recentNotes.map(summarizeNote).join("\n")}\n\n`;
      }

      notFoundMsg += `To save this price: *"Save ${priceKeyword} price 500"*`;

      return Response.json({
        type: "not_found",
        message: notFoundMsg,
        recentPrices,
        recentNotes,
      });
    }

    // ── NOTES ──────────────────────────────────────────────────
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

    // Notes not found — try prices as a cross-table fallback
    const crossPrices = await searchProductPrices(userId, lowerKeyword);

    if (crossPrices.length > 0) {
      return Response.json({
        type: "price_result",
        message:
          `No notes found for *"${lowerKeyword}"*, but found a saved price:\n\n` +
          crossPrices.map(summarizePrice).join("\n"),
        product_price: crossPrices[0],
        matches: crossPrices.length,
        all_prices: crossPrices,
      });
    }

    // Try files as a last cross-table check
    const [fallbackImages, fallbackDocs] = await Promise.all([
      searchImages(userId, lowerKeyword),
      searchDocuments(userId, lowerKeyword),
    ]);

    const hasImages = (fallbackImages?.length ?? 0) > 0;
    const hasDocs = (fallbackDocs?.length ?? 0) > 0;

    if (hasImages || hasDocs) {
      let fallbackMsg = `No notes found for *"${lowerKeyword}"*, but I found:\n\n`;

      if (hasImages) {
        fallbackMsg += `**${fallbackImages!.length} image(s):**\n`;
        fallbackMsg += fallbackImages!.map(summarizeFile).join("\n");
        fallbackMsg += `\n\nSay *"show my images"* to view them.\n`;
      }

      if (hasDocs) {
        fallbackMsg += `\n**${fallbackDocs!.length} document(s):**\n`;
        fallbackMsg += fallbackDocs!.map(summarizeFile).join("\n");
        fallbackMsg += `\n\nSay *"show my documents"* to view them.`;
      }

      return Response.json({ type: "not_found", message: fallbackMsg });
    }

    // Absolutely nothing found — show recent saves from both tables
    const [recentNotes, recentPrices] = await Promise.all([
      fetchRecentNotes(userId),
      fetchRecentPrices(userId),
    ]);

    const hasRecentNotes = recentNotes.length > 0;
    const hasRecentPrices = recentPrices.length > 0;

    if (hasRecentNotes || hasRecentPrices) {
      let recentMsg = `Nothing found for *"${lowerKeyword}"*.\n\n`;

      if (hasRecentNotes) {
        recentMsg += `Your recent notes:\n${recentNotes.map(summarizeNote).join("\n")}\n\n`;
      }

      if (hasRecentPrices) {
        recentMsg += `Your recent prices:\n${recentPrices.map(summarizePrice).join("\n")}\n\n`;
      }

      return Response.json({
        type: "not_found",
        message: recentMsg.trim(),
        recentNotes,
        recentPrices,
      });
    }

    // Truly empty account
    return Response.json({
      type: "not_found",
      message: `Nothing saved yet matching *"${lowerKeyword}"*.\n\nTry:\n→ *"Save John number 08031234567"*\n→ *"Save pepper price 600"*\n→ *"What is the price of pepper?"*\n→ Tap **+** to upload files`,
    });
  } catch (error) {
    console.error("[Retrieve Handler] Unexpected error:", error);
    return Response.json(
      { type: "system", message: "Server error. Please try again." },
      { status: 500 }
    );
  }
}