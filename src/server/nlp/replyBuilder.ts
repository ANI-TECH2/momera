import { Note, Document, StorageImage } from "@/lib/types";

type SavedItem = Note | Document | StorageImage;
type ItemType = "note" | "document" | "image";

type BaseSavedItem = Partial<SavedItem> & {
  category?: string | null;
  content?: string | null;
  description?: string | null;
  file_name?: string | null;
  fileName?: string | null;
  created_at?: string | null;
};

type ProductPriceItem = {
  product_name: string;
  price: number;
  currency?: string | null;
  category?: string | null;
  created_at?: string | null;
};

type ReplyContext = {
  userName?: string | null;
  countryCode?: string | null; // e.g. NG, US, UK, GH
  now?: Date;
};

// ─── UTILS ────────────────────────────────────────────────────

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";

  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return "";

  const diff = Date.now() - time;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
  }

  const months = Math.floor(days / 30);
  return `${months} month${months !== 1 ? "s" : ""} ago`;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatCurrency(price: number, currency = "NGN"): string {
  const symbolMap: Record<string, string> = {
    NGN: "₦",
    USD: "$",
    GBP: "£",
    EUR: "€",
    GHS: "GH₵",
    KES: "KSh",
    ZAR: "R",
  };

  const symbol = symbolMap[currency] || currency;
  return `${symbol}${price.toLocaleString()}`;
}

function getTimePeriod(now = new Date()): "morning" | "afternoon" | "evening" {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function getDisplayName(userName?: string | null): string {
  if (!userName) return "";
  const cleaned = userName.trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function getCountryGreetingFlavor(countryCode?: string | null): string {
  const code = (countryCode || "").trim().toUpperCase();

  switch (code) {
    case "NG":
      return "Hope you're doing well.";
    case "GH":
      return "You're welcome.";
    case "KE":
      return "Glad to help.";
    case "US":
    case "UK":
    case "CA":
    case "AU":
      return "How can I help today?";
    default:
      return "What can I help you with today?";
  }
}

function buildGreetingReply(context?: ReplyContext): string {
  const now = context?.now ?? new Date();
  const period = getTimePeriod(now);
  const userName = getDisplayName(context?.userName);
  const flavor = getCountryGreetingFlavor(context?.countryCode);

  const greeting =
    period === "morning"
      ? "Good morning"
      : period === "afternoon"
      ? "Good afternoon"
      : "Good evening";

  if (userName) {
    return `${greeting}, ${userName}! I’m Memora. ${flavor}`;
  }

  return `${greeting}! I’m Memora. ${flavor}`;
}

// ─── GREETING DETECTION ───────────────────────────────────────

function isGreeting(message: string): boolean {
  const q = message.trim().toLowerCase();

  return /^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening|morning|afternoon|evening)\b/.test(
    q
  );
}

// ─── EXTRACTORS ───────────────────────────────────────────────

export function extractPhone(text: string): string | null {
  const match = text.match(/(?:\+?\d[\d\s\-]{7,}\d)/);
  return match ? match[0].trim() : null;
}

export function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

export function extractName(text: string): string | null {
  const twoWords = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/);
  if (twoWords) return twoWords[1];

  const afterKeyword = text.match(
    /(?:classmate|friend|contact|colleague|brother|sister|customer|client|my)\s+([A-Z][a-z]+)/i
  );
  if (afterKeyword) return afterKeyword[1];

  const singleWord = text.match(/\b([A-Z][a-z]+)\b/);
  return singleWord ? singleWord[1] : null;
}

function detectQuestion(message: string): {
  isAsking: boolean;
  wantsPhone: boolean;
  wantsEmail: boolean;
  wantsName: boolean;
  wantsPrice: boolean;
  wantsDate: boolean;
  wantsLocation: boolean;
} {
  const q = message.toLowerCase();

  return {
    isAsking:
      /^(what|who|where|when|how|is|are|do|did|can|show|find|get|tell|give)/.test(q) ||
      q.includes("?"),
    wantsPhone: /\b(phone|number|call|mobile|contact|reach|whatsapp)\b/.test(q),
    wantsEmail: /\b(email|mail|e-mail)\b/.test(q),
    wantsName: /\b(who|name|person)\b/.test(q),
    wantsPrice: /\b(price|cost|how much|rate|worth|amount|sell|selling)\b/.test(q),
    wantsDate: /\b(when|date|time|day|schedule|appointment)\b/.test(q),
    wantsLocation: /\b(where|location|address|place)\b/.test(q),
  };
}

// ─── PRICE REPLY ──────────────────────────────────────────────

export function buildPriceReply(
  userMessage: string,
  prices: ProductPriceItem[]
): string {
  if (!prices || prices.length === 0) {
    return buildPriceNotFoundReply(userMessage);
  }

  const best = prices[0];
  const formatted = formatCurrency(best.price, best.currency ?? "NGN");
  const when = timeAgo(best.created_at);
  const whenStr = when ? ` _(saved ${when})_` : "";

  if (prices.length === 1) {
    const intros = [
      `💰 *${best.product_name}* is ${formatted}${whenStr}`,
      `The price of *${best.product_name}* is ${formatted}${whenStr}`,
      `*${best.product_name}* — ${formatted}${whenStr}`,
    ];

    let reply = pickRandom(intros);

    if (best.category && best.category !== "product") {
      reply += `\n_Category: ${best.category}_`;
    }

    return reply;
  }

  const list = prices
    .map(
      (p, i) =>
        `${i + 1}. *${p.product_name}* — ${formatCurrency(
          p.price,
          p.currency ?? "NGN"
        )}`
    )
    .join("\n");

  return `💰 Found ${prices.length} price matches:\n\n${list}\n\n_Say the product name to get more details._`;
}

function buildPriceNotFoundReply(userMessage: string): string {
  const keyword = userMessage
    .toLowerCase()
    .replace(/\b(price|cost|how much|what is|what's|the|of|is|are|rate|worth)\b/gi, "")
    .replace(/[?.,!]/g, "")
    .trim();

  return `No saved price found for *"${keyword}"*.\n\nTo save it, say:\n_"Save ${keyword} price 500"_`;
}

// ─── SAVE REPLY ───────────────────────────────────────────────

export function buildSaveReply(
  category: string,
  content: string,
  context?: ReplyContext
): string {
  const cat = (category || "note").toLowerCase();
  const name = extractName(content);
  const phone = extractPhone(content);
  const email = extractEmail(content);
  const userName = getDisplayName(context?.userName);

  if (cat === "contact") {
    if (name && phone) return `✅ Saved *${name}* — ${phone}`;
    if (name && email) return `✅ Saved *${name}* — ${email}`;
    if (name) return `✅ *${name}* saved to contacts`;
    return `✅ Contact saved`;
  }

  if (cat === "idea") {
    const ideas = [
      `💡 Idea noted${userName ? `, ${userName}` : ""}! I'll keep that safe.`,
      `💡 Got it${userName ? `, ${userName}` : ""} — idea saved.`,
      `💡 Nice idea${userName ? `, ${userName}` : ""}! Saved.`,
    ];
    return pickRandom(ideas);
  }

  if (cat === "reminder") {
    const reminders = [
      `🔔 Reminder set${userName ? `, ${userName}` : ""}! I'll keep that for you.`,
      `🔔 Got it${userName ? `, ${userName}` : ""} — reminder saved.`,
      `🔔 Reminder saved.`,
    ];
    return pickRandom(reminders);
  }

  if (cat === "receipt") {
    return `🧾 Receipt saved. You can retrieve it anytime.`;
  }

  if (cat === "password" || cat === "credential") {
    return `🔐 Saved securely.`;
  }

  const previews = content.slice(0, 50);
  const noteReplies = [
    `✅ Saved: _"${previews}${content.length > 50 ? "..." : ""}"_`,
    `✅ Got it${userName ? `, ${userName}` : ""}! Saved.`,
    `✅ Done — I'll remember that.`,
    `✅ Saved for you.`,
  ];

  return pickRandom(noteReplies);
}

// ─── CONTACT REPLY ────────────────────────────────────────────

function buildContactReply(
  question: string,
  content: string,
  savedAt?: string | null
): string {
  const q = detectQuestion(question);
  const name = extractName(content);
  const phone = extractPhone(content);
  const email = extractEmail(content);
  const when = timeAgo(savedAt);
  const whenStr = when ? ` _(saved ${when})_` : "";

  if (q.wantsPhone && phone) {
    return `📱 ${name ? `*${name}*: ` : ""}${phone}${whenStr}`;
  }

  if (q.wantsEmail && email) {
    return `📧 ${name ? `*${name}*: ` : ""}${email}${whenStr}`;
  }

  if (q.wantsName && name) {
    return `👤 *${name}*${phone ? `\n📱 ${phone}` : ""}${email ? `\n📧 ${email}` : ""}${whenStr}`;
  }

  const parts: string[] = [];
  if (name) parts.push(`👤 *${name}*`);
  if (phone) parts.push(`📱 ${phone}`);
  if (email) parts.push(`📧 ${email}`);
  if (!parts.length) parts.push(`📝 ${content}`);

  return parts.join("\n") + whenStr;
}

// ─── FILE REPLY ───────────────────────────────────────────────

function buildFileReply(
  item: BaseSavedItem,
  total: number,
  itemType: "document" | "image"
): string {
  const name =
    item.file_name ||
    item.fileName ||
    (itemType === "image" ? "Untitled image" : "Untitled file");

  const desc = item.description ? `\n_${item.description}_` : "";
  const emoji = itemType === "image" ? "🖼️" : "📄";

  if (total > 1) {
    return `${emoji} Found *${total} ${
      itemType === "image" ? "images" : "files"
    }*.\n\nMost recent: *${name}*${desc}\n\nTap to open.`;
  }

  return `${emoji} *${name}*${desc}\n\nTap to open.`;
}

// ─── MULTIPLE RESULTS ─────────────────────────────────────────

function buildMultipleReply(items: BaseSavedItem[], userMessage: string): string {
  const q = detectQuestion(userMessage);

  const list = items
    .slice(0, 5)
    .map((item, i) => {
      const text =
        item.content || item.description || item.file_name || item.fileName || "";
      const name = extractName(text);
      const phone = extractPhone(text);
      const label = name || text.slice(0, 50) || "Untitled item";
      const extra = q.wantsPhone && phone ? ` — ${phone}` : "";
      return `${i + 1}. ${label}${extra}`;
    })
    .join("\n");

  const intros = [
    `Found *${items.length} matches*:`,
    `Here are *${items.length} results*:`,
    `I found *${items.length} items*:`,
  ];

  return `${pickRandom(intros)}\n\n${list}\n\n_Be more specific to narrow it down._`;
}

// ─── NOT FOUND ────────────────────────────────────────────────

function buildNotFoundReply(
  userMessage: string,
  context?: ReplyContext
): string {
  if (isGreeting(userMessage)) {
    return buildGreetingReply(context);
  }

  const q = detectQuestion(userMessage);

  const keyword = userMessage
    .toLowerCase()
    .replace(/^(show|find|get|what is|who is|give me|tell me|search for)\s+/i, "")
    .replace(/\b(my|the|a|an|please)\b/gi, "")
    .replace(/[?.,!]/g, "")
    .trim();

  if (q.wantsPhone) {
    return `Couldn't find a phone number for *"${keyword}"*.\n\nTo save it:\n_"Save ${keyword} 08012345678"_`;
  }

  if (q.wantsPrice) {
    return `No saved price for *"${keyword}"*.\n\nTo save it:\n_"Save ${keyword} price 500"_`;
  }

  const notFoundReplies = [
    `Nothing saved matching *"${keyword}"* yet.\n\nTry saving it first — just say _"Save ${keyword}..."_`,
    `I don't have anything for *"${keyword}"*.\n\nYou can save it by saying _"Save ${keyword}..."_`,
    `No results for *"${keyword}"*.\n\nWant to save something? Say _"Save ${keyword}..."_`,
  ];

  return pickRandom(notFoundReplies);
}

// ─── MAIN REPLY BUILDER ───────────────────────────────────────

export function buildSmartReply(
  userMessage: string,
  foundItems: BaseSavedItem[],
  itemType: ItemType = "note",
  context?: ReplyContext
): string {
  // greetings first
  if (isGreeting(userMessage)) {
    return buildGreetingReply(context);
  }

  if (!foundItems || foundItems.length === 0) {
    return buildNotFoundReply(userMessage, context);
  }

  const q = detectQuestion(userMessage);
  const first = foundItems[0];

  if (itemType === "document" || itemType === "image") {
    return buildFileReply(first, foundItems.length, itemType);
  }

  if (foundItems.length > 1) {
    return buildMultipleReply(foundItems, userMessage);
  }

  const category = (first.category || "note").toLowerCase();
  const content = first.content ?? "";
  const savedAt = first.created_at;

  if (category === "contact") {
    return buildContactReply(userMessage, content, savedAt);
  }

  if (category === "idea") {
    const when = timeAgo(savedAt);
    return `💡 *Your idea${when ? ` (${when})` : ""}:*\n\n"${content}"`;
  }

  if (category === "reminder") {
    const when = timeAgo(savedAt);
    return `🔔 *Reminder${when ? ` (saved ${when})` : ""}:*\n\n"${content}"`;
  }

  if (category === "receipt") {
    return `🧾 *Receipt:*\n\n${content}`;
  }

  if (category === "password" || category === "credential") {
    return `🔐 *Saved info:*\n\n${content}`;
  }

  if (q.wantsPhone) {
    const phone = extractPhone(content);
    const name = extractName(content);
    if (phone) return `📱 ${name ? `*${name}*: ` : ""}${phone}`;
  }

  if (q.wantsEmail) {
    const email = extractEmail(content);
    const name = extractName(content);
    if (email) return `📧 ${name ? `*${name}*: ` : ""}${email}`;
  }

  if (q.wantsPrice) {
    return buildPriceReply(userMessage, []);
  }

  const when = timeAgo(savedAt);
  const whenStr = when ? `\n\n_Saved ${when}_` : "";
  return `📝 ${content}${whenStr}`;
}

// ─── BULK SAVE REPLY ──────────────────────────────────────────

export function buildBulkSaveReply(
  saved: { product_name: string; price: number }[],
  skipped: string[],
  failed: string[]
): string {
  const total = saved.length;
  const currency = "₦";

  if (total === 0 && skipped.length === 0) {
    return (
      `❌ Couldn't parse any prices.\n\n` +
      `Make sure each item has a name and number:\n` +
      `_"pepper 50"_\n_"garri 800"_\n_"rice 2500"_`
    );
  }

  const intros = [
    `✅ Saved *${total} price${total !== 1 ? "s" : ""}* successfully!`,
    `✅ Done! *${total} price${total !== 1 ? "s" : ""}* saved.`,
    `✅ All set — *${total} item${total !== 1 ? "s" : ""}* saved.`,
  ];

  let reply = pickRandom(intros);

  if (total > 0) {
    const list = saved
      .map((p) => `• *${p.product_name}* — ${currency}${p.price.toLocaleString()}`)
      .join("\n");
    reply += `\n\n${list}`;
  }

  if (skipped.length > 0) {
    reply += `\n\n⚠️ *Already saved (skipped):*\n${skipped
      .map((s) => `• ${s}`)
      .join("\n")}`;
  }

  if (failed.length > 0) {
    reply +=
      `\n\n❌ *Couldn't parse ${failed.length} item${
        failed.length !== 1 ? "s" : ""
      }:*\n` +
      `${failed.map((f) => `• ${f}`).join("\n")}\n` +
      `_Make sure format is: name then number, e.g. "garri 500"_`;
  }

  return reply;
}