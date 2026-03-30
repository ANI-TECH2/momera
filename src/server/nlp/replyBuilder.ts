import { Note, Document, StorageImage } from "@/lib/types";

type SavedItem = Note | Document | StorageImage;

type ItemType = "note" | "document" | "image";

type BaseSavedItem = Partial<SavedItem> & {
  category?: string | null;
  content?: string | null;
  description?: string | null;
  file_name?: string | null;
  fileName?: string | null;
};

// MAIN REPLY BUILDER
export function buildSmartReply(
  userMessage: string,
  foundItems: BaseSavedItem[],
  itemType: ItemType = "note"
): string {
  if (!foundItems || foundItems.length === 0) {
    return buildNotFoundReply(userMessage);
  }

  const question = userMessage.toLowerCase().trim();
  const first = foundItems[0];

  if (itemType === "document" || itemType === "image") {
    return buildFileReply(first, foundItems.length, itemType);
  }

  if (foundItems.length > 1) {
    return buildMultipleReply(foundItems);
  }

  const category = (first.category || "note").toLowerCase();
  const content = first.content ?? "";

  if (category === "contact") {
    return buildContactReply(question, content);
  }

  if (category === "idea") {
    return `💡 Your idea:\n\n"${content}"`;
  }

  if (category === "reminder") {
    return `🔔 Reminder:\n\n"${content}"`;
  }

  if (category === "receipt") {
    return `🧾 Receipt info:\n\n"${content}"`;
  }

  return buildNoteReply(content);
}

// CONTACT REPLY
function buildContactReply(question: string, content: string): string {
  const name = extractName(content);
  const phone = extractPhone(content);
  const email = extractEmail(content);

  if (question.includes("number") || question.includes("phone")) {
    if (phone) return `📱 ${name ? `${name}: ` : ""}${phone}`;
  }

  if (question.includes("email")) {
    if (email) return `📧 ${name ? `${name}: ` : ""}${email}`;
  }

  if (question.includes("who")) {
    if (name) {
      return `👤 ${name}${phone ? ` — ${phone}` : ""}${
        email ? ` — ${email}` : ""
      }`;
    }
  }

  if (name || phone || email) {
    return `👤 Contact found:\n\n${content}`;
  }

  return buildNoteReply(content);
}

// FILE REPLY
function buildFileReply(
  item: BaseSavedItem,
  total: number,
  itemType: "document" | "image"
): string {
  const name =
    item.file_name ||
    item.fileName ||
    (itemType === "image" ? "image" : "file");

  const desc = item.description || "No description";

  if (total > 1) {
    return `📁 Found ${total} ${
      itemType === "image" ? "images" : "files"
    }.\n\nMost recent:\n${name}\n${desc}`;
  }

  return `📄 ${name}\n${desc}\n\nTap to open.`;
}

// MULTIPLE RESULTS
function buildMultipleReply(items: BaseSavedItem[]): string {
  const list = items
    .slice(0, 5)
    .map((item, i) => {
      const content =
        item.content || item.description || item.file_name || item.fileName || "";
      return `${i + 1}. ${content.slice(0, 60)}`;
    })
    .join("\n");

  return `I found ${items.length} matches:\n\n${list}\n\nBe more specific to narrow it down.`;
}

// NOTE REPLY
function buildNoteReply(content: string): string {
  return `📝 ${content}`;
}

// NOT FOUND
function buildNotFoundReply(question: string): string {
  return `I couldn't find anything for "${question}".\n\nTry:\n• "show my notes"\n• "find john number"\n• or save it first`;
}

// SAVE CONFIRM
export function buildSaveReply(category: string, content: string): string {
  const normalizedCategory = (category || "note").toLowerCase();
  const name = extractName(content);

  const replies: Record<string, string> = {
    contact: `✅ Saved ${name || "contact"} 📱`,
    idea: "💡 Idea saved",
    reminder: "🔔 Reminder saved",
    receipt: "🧾 Receipt saved",
    note: "✅ Saved",
  };

  return replies[normalizedCategory] || replies.note;
}

// EXTRACTORS
export function extractPhone(text: string): string | null {
  const match = text.match(/(?:\+?\d[\d\s-]{7,}\d)/);
  return match ? match[0].trim() : null;
}

export function extractEmail(text: string): string | null {
  const match = text.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  );
  return match ? match[0] : null;
}

export function extractName(text: string): string | null {
  const twoWords = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/);
  if (twoWords) return twoWords[1];

  const afterKeyword = text.match(
    /(?:classmate|friend|contact|colleague|brother|sister|customer)\s+([A-Z][a-z]+)/i
  );
  if (afterKeyword) return afterKeyword[1];

  const singleWord = text.match(/\b([A-Z][a-z]+)\b/);
  return singleWord ? singleWord[1] : null;
}