// ─── TYPES ────────────────────────────────────────────────────

export type NoteRow = {
  id: string;
  title?: string | null;
  content?: string | null;
  category?: string | null;
  created_at?: string | null;
  normalized_content?: string | null;
  [key: string]: unknown;
};

export type ScoredNote = NoteRow & { score: number };

export type FileRow = {
  id: string;
  file_name?: string | null;
  description?: string | null;
  file_type?: string | null;
  file_path: string;
  created_at?: string | null;
};

export type ProductPriceRow = {
  id: string;
  product_name: string;
  price: number;
  currency?: string | null;
  category?: string | null;
  description?: string | null;
  normalized_content?: string | null;
  created_at?: string | null;
};

// ─── STRING UTILS ─────────────────────────────────────────────

export function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "\\$&");
}

export function normalizeSimpleText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function splitKeywords(keyword: string): string[] {
  return [
    ...new Set(
      keyword.split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 1)
    ),
  ];
}

export function buildFtsQuery(keyword: string): string {
  const words = splitKeywords(keyword);
  if (!words.length) return "";
  return words.map((w) => `'${w.replace(/'/g, " ")}'`).join(" | ");
}

export function dedupeNotes(notes: NoteRow[]): NoteRow[] {
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

// ─── PHONE UTILS ──────────────────────────────────────────────

export function extractPhones(text: string): string[] {
  const matches =
    text.match(/(?:\+?(?:\d{1,3})[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g) ?? [];
  const cleaned = matches
    .map((item) => item.replace(/[^\d+]/g, ""))
    .filter((item) => item.length >= 7);
  return [...new Set(cleaned)];
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0") && digits.length >= 11) return `234${digits.slice(1)}`;
  return digits;
}

export function getPhoneVariants(value: string): string[] {
  const digits = value.replace(/\D/g, "");
  if (!digits) return [];
  const variants = new Set<string>();
  variants.add(digits);
  if (digits.startsWith("0") && digits.length >= 11) variants.add(`234${digits.slice(1)}`);
  else if (digits.startsWith("234")) variants.add(`0${digits.slice(3)}`);
  return [...variants];
}

// ─── KEYWORD CLEANERS ─────────────────────────────────────────

export function cleanKeyword(message: string): string {
  return message
    .toLowerCase()
    // Strip leading intent phrases
    .replace(
      /^(show\s+me\s+my|show\s+my|show\s+me|find\s+my|get\s+my|retrieve\s+my|retrieve|search\s+for|search|look\s+up|what\s+is\s+my|what\s+was\s+my|do\s+i\s+have|give\s+me\s+my|give\s+me|tell\s+me\s+my|tell\s+me|what\s+is|what\s+are|can\s+you\s+find|i\s+need|bring\s+up|pull\s+up)\s+/i,
      ""
    )
    // Strip only filler words — do NOT strip "password", "number", "account" etc.
    .replace(/\b(please|the|a|an)\b/gi, " ")
    // Strip file-type words only (not content words)
    .replace(/\b(image|images|photo|photos|picture|pictures|img|screenshot|screenshots|pic|pics|snap|jpg|jpeg|png)\b/gi, " ")
    .replace(/\b(document|documents|doc|docs|pdf|file|files|receipt|invoice|contract|report)\b/gi, " ")
    .replace(/[?.,!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanPriceKeyword(message: string): string {
  return message
    .toLowerCase()
    .replace(
      /^(show\s+me\s+my|show\s+my|show\s+me|find\s+my|get\s+my|retrieve\s+my|retrieve|search\s+for|search|look\s+up|what\s+is\s+my|what\s+was\s+my|do\s+i\s+have|give\s+me\s+my|give\s+me|tell\s+me\s+my|tell\s+me|what\s+is|what\s+are|can\s+you\s+find|i\s+need|bring\s+up|pull\s+up)\s+/i,
      ""
    )
    .replace(/\b(price|prices|cost|costs|how\s+much|rate|rates|worth|naira|ngn)\b/gi, " ")
    .replace(/\b(the|a|an|please|for|of|about|all|is|are)\b/gi, " ")
    .replace(/[?.,!₦]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── INTENT DETECTORS ─────────────────────────────────────────

export function detectPriceIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\b(price|prices|cost|costs|how much|rate|rates|worth|sell|selling|market|naira)\b/.test(lower) ||
    /ngn/i.test(lower) ||
    message.includes("₦")
  );
}

export function detectFileIntent(message: string): {
  lookingForImage: boolean;
  lookingForDoc: boolean;
} {
  const lower = message.toLowerCase();
  return {
    lookingForImage:
      /\b(image|images|photo|photos|picture|pictures|img|screenshot|screenshots|pic|pics|snap|jpg|jpeg|png)\b/i.test(lower) ||
      /\b(show|find|get|retrieve|display|see|view)\b.{0,30}\b(upload(ed)?|scanned?|taken?|saved?|stored?)\b/i.test(lower),
    lookingForDoc:
      /\b(document|documents|doc|docs|pdf|pdfs|file|files|receipt|receipts|invoice|invoices|contract|contracts|report|reports)\b/i.test(lower),
  };
}

// ─── SUMMARIZERS ──────────────────────────────────────────────

export function summarizeNote(note: NoteRow, index: number): string {
  const title = safeString(note.title);
  const content = safeString(note.content);
  const preview = title || content.slice(0, 80);
  return `${index + 1}. ${preview || "Untitled note"}`;
}

export function summarizeFile(file: FileRow, index: number): string {
  const name = safeString(file.file_name);
  const desc = safeString(file.description);
  return `${index + 1}. ${name || desc || "Unnamed file"}`;
}

export function summarizePrice(price: ProductPriceRow, index: number): string {
  const symbol = (price.currency ?? "NGN") === "NGN" ? "₦" : price.currency!;
  return `${index + 1}. ${price.product_name} — ${symbol}${price.price}`;
}