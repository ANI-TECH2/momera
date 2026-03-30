import { NoteCategory } from "@/lib/types";
import { SAVE_KEYWORDS, STOP_WORDS } from "@/lib/constants";

// ─── EXTRACT CONTENT AFTER SAVE KEYWORD ─────────────────────────────────────
export function extractContent(message: string): string {
  if (!message) return "";

  const lower = message.toLowerCase();

  for (const keyword of SAVE_KEYWORDS) {
    if (lower.includes(keyword)) {
      const index = lower.indexOf(keyword) + keyword.length;
      return message.slice(index).trim();
    }
  }

  return message.trim();
}

// ─── EXTRACT SEARCH KEYWORD FROM QUESTION ───────────────────────────────────
export function extractSearchKeyword(message: string): string {
  if (!message) return "";

  const words = message.toLowerCase().split(/\s+/);

  const keywords = words.filter(
    (w) => !STOP_WORDS.includes(w) && w.length > 2
  );

  return keywords.join(" ").trim() || message.trim();
}

// ─── AUTO DETECT CATEGORY ────────────────────────────────────────────────────
export function detectCategory(content: string): NoteCategory {
  if (!content) return "note";

  const lower = content.toLowerCase();

  // CONTACT
  if (
    lower.includes("classmate") ||
    lower.includes("friend") ||
    lower.includes("contact") ||
    lower.includes("colleague") ||
    lower.includes("number") ||
    lower.includes("phone") ||
    lower.includes("email") ||
    /\b0\d{10}\b/.test(lower) // ✅ FIXED REGEX
  ) {
    return "contact";
  }

  // IDEA
  if (
    lower.includes("idea") ||
    lower.includes("app") ||
    lower.includes("plan") ||
    lower.includes("build") ||
    lower.includes("startup") ||
    lower.includes("project")
  ) {
    return "idea";
  }

  // RECEIPT
  if (
    lower.includes("receipt") ||
    lower.includes("payment") ||
    lower.includes("bought") ||
    lower.includes("paid") ||
    lower.includes("purchase") ||
    lower.includes("₦") ||
    lower.includes("naira")
  ) {
    return "receipt";
  }

  // REMINDER
  if (
    lower.includes("remind") ||
    lower.includes("don't forget") ||
    lower.includes("remember to") ||
    lower.includes("must do") ||
    lower.includes("todo") ||
    lower.includes("to do")
  ) {
    return "reminder";
  }

  return "note";
}

// ─── NORMALIZE TEXT ──────────────────────────────────────────────────────────
export function normalizeText(text: string): string {
  if (!text) return "";

  return text
    .toLowerCase()
    .replace(/\s+/g, " ")        // ✅ FIXED
    .replace(/[^\w\s]/g, "")     // ✅ FIXED
    .trim();
}

// ─── GENERATE CONTENT HASH ───────────────────────────────────────────────────
export function generateHash(text: string): string {
  const normalized = normalizeText(text);
  let hash = 0;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // ✅ safer 32-bit
  }

  return Math.abs(hash).toString(16);
}

// ─── FORMAT FILE SIZE ────────────────────────────────────────────────────────
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ─── FORMAT DATE ─────────────────────────────────────────────────────────────
export function formatDate(dateStr: string): string {
  if (!dateStr) return "";

  const date = new Date(dateStr);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}