import { serverSupabase } from "../supabase";
import {
  extractContent,
  detectCategory,
  generateHash,
  normalizeText,
} from "../helpers";
import { buildSaveReply } from "../nlp/replyBuilder";
import {
  detectBulkPriceList,
  handleBulkPriceSave,
} from "@/server/handlers/bulkPriceSave";
 
import { ExtractedEntity } from "@/app/api/chat+api";
 
type SaveEntity = ExtractedEntity;
 
function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
 
function stripSaveCommand(text: string): string {
  return safeString(text)
    .replace(
      /^\s*(save|store|remember|keep|add|note|write\s*down)\b\s*/i,
      ""
    )
    .trim();
}
 
function normalizeSimpleText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
 
function toTitleCase(text: string): string {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
 
function buildProductNormalizedName(name: string): string {
  return normalizeSimpleText(name);
}
 
// ─── IMPORTANT: Any note with >= 2 chars is worth saving ─────
// We no longer require 8 words or 60 chars. Short notes like
// "car pin 1234" or "wifi pw: abc123" are valid and important.
function looksLikeLongFreeText(text: string): boolean {
  const words = safeString(text).split(/\s+/).filter(Boolean);
  return words.length >= 8 || text.length >= 60;
}
 
function extractPhoneNumber(text: string): string {
  const match = text.match(
    /\b0[789][01]\d{8}\b|\+234[\s-]?[789][01]\d{8}\b|\+\d{1,3}[\s-]?\d{6,14}\b/
  );
  if (!match) return "";
  return match[0].replace(/\s+/g, "");
}
 
function hasPhoneNumber(text: string): boolean {
  return extractPhoneNumber(text).length > 0;
}
 
function hasEmail(text: string): boolean {
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text);
}
 
function extractEmail(text: string): string {
  const match = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return match?.[0] ?? "";
}
 
function looksLikeCredential(text: string): boolean {
  return /\b(password|passwd|secret|login|username|credential|passphrase|otp|2fa|token|api\s*key)\b/i.test(
    text
  );
}
 
function looksLikeMeetingOrReminder(text: string): boolean {
  return /\b(date|birthday|dob|born|appointment|meeting|schedule|reminder|anniversary|event)\b/i.test(
    text
  );
}
 
function looksLikeBankOrIdInfo(text: string): boolean {
  return /\b(account|acct|nuban|bvn|nin|id\s*number|reg\s*number|matric)\b/i.test(text);
}
 
// ─── PIN / CODE detection ─────────────────────────────────────
// A pin note is something like "car pin 1234", "door pin 5678",
// "wifi password abc123". These must ALWAYS save as plain notes,
// never as contacts or prices.
function looksLikePinOrCode(text: string): boolean {
  return (
    (/\bpin\b/i.test(text) && /\d{3,}/.test(text)) ||
    (/\b(code|pw|pwd|pass|password|secret|key|otp)\b/i.test(text) &&
      /[a-z0-9]{3,}/i.test(text))
  );
}
 
function extractContactName(text: string): string {
  const phone = extractPhoneNumber(text);
  const email = extractEmail(text);
 
  const cleaned = text
    .replace(/\b(save|store|remember|keep|add)\b/gi, " ")
    .replace(/\b(contact|number|phone|mobile|tel|whatsapp|call|reach)\b/gi, " ")
    .replace(/\b(is|for|of|my|name)\b/gi, " ")
    .replace(phone, " ")
    .replace(email, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
 
  return toTitleCase(cleaned);
}
 
function buildContactDescription(
  name: string,
  phone: string,
  email: string,
  original: string
): string {
  const cleanOriginal = safeString(original);
  if (cleanOriginal.length > 0) return cleanOriginal;
  const parts = [name, "contact", phone || email].filter(Boolean);
  return parts.join(" ").trim();
}
 
function looksLikeRealContact(text: string, entities: SaveEntity[] = []): boolean {
  const lower = text.toLowerCase();
 
  // Hard exclusions — these are notes, not contacts
  if (looksLikeCredential(lower)) return false;
  if (looksLikeMeetingOrReminder(lower)) return false;
  if (looksLikeBankOrIdInfo(lower)) return false;
  if (looksLikePinOrCode(text)) return false;
 
  const phone = hasPhoneNumber(text);
  const email = hasEmail(text);
  const hasContactWord =
    /\b(contact|phone|mobile|tel|whatsapp|call|reach|number)\b/i.test(text);
 
  const possibleName = extractContactName(text);
  const hasTwoWordName = /\b[a-z]{2,}\s+[a-z]{2,}\b/i.test(possibleName);
  const hasSingleNameEntity = entities.some((item) => item.entity === "name_like");
  const hasNameSignal =
    hasSingleNameEntity ||
    hasTwoWordName ||
    /^[a-z]{2,}$/i.test(possibleName) ||
    /\bname\b/i.test(lower);
 
  return (phone || email) && (hasContactWord || hasNameSignal);
}
 
function isNoteContent(text: string, entities: SaveEntity[] = []): boolean {
  const lower = text.toLowerCase();
 
  if (looksLikeCredential(lower)) return true;
  if (looksLikePinOrCode(text)) return true;          // ← pin/code always a note
  if (looksLikeMeetingOrReminder(lower)) return true;
  if (looksLikeBankOrIdInfo(lower)) return true;
 
  if (looksLikeRealContact(text, entities)) return false;
 
  if (hasPhoneNumber(text) || hasEmail(text)) return true;
 
  return false;
}
 
// ─── CORE FIX: always prefer the full stripped message ────────
// Previously this tried to "extract" content and could return a
// fragment shorter than the real note. Now we keep the full
// stripped text unless extractContent gives something clearly
// better (longer and richer).
function getBestSaveContent(message: string, entities: SaveEntity[] = []): string {
  const cleanedMessage = safeString(message);
  const stripped = stripSaveCommand(cleanedMessage);
 
  // Always trust the full stripped text for short important notes
  // (pins, codes, passwords, anything the user explicitly saved).
  if (stripped.length >= 2) {
    // Only replace with extractContent output if it's meaningfully
    // longer than what we already have — i.e. it adds context.
    const extracted = safeString(extractContent(cleanedMessage));
    const extractedIsRicher =
      extracted.length >= 2 &&
      extracted.length > stripped.length &&
      extracted.length >= Math.max(12, Math.floor(stripped.length * 0.8));
 
    return extractedIsRicher ? extracted : stripped;
  }
 
  // Fallback to entity text if stripped is empty
  const usefulEntities = entities
    .filter((item) =>
      ["phone", "email", "money", "date_like", "place", "keyword", "name_like"].includes(
        item.entity
      )
    )
    .map((item) => safeString(item.sourceText))
    .filter(Boolean);
 
  if (usefulEntities.length > 0) return usefulEntities.join(" ");
 
  return safeString(extractContent(cleanedMessage)) || cleanedMessage;
}
 
function extractPriceValue(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
 
  const patterns = [
    /(?:₦|ngn\s*)(\d+(?:\.\d{1,2})?)/i,
    /\bprice\s*(?:is|=)?\s*(\d+(?:\.\d{1,2})?)/i,
    /\bcost\s*(?:is|=)?\s*(\d+(?:\.\d{1,2})?)/i,
    /\bamount\s*(?:is|=)?\s*(\d+(?:\.\d{1,2})?)/i,
    /=\s*(\d+(?:\.\d{1,2})?)/i,
    /[-:]\s*(\d+(?:\.\d{1,2})?)$/i,
    /\b(\d+(?:\.\d{1,2})?)$/i,
  ];
 
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
 
  return null;
}
 
function extractProductName(text: string): string {
  const cleaned = text
    .replace(/\b(save|store|remember|keep|add)\b/gi, " ")
    .replace(/\b(price|prices|cost|amount|sell|selling)\b/gi, " ")
    .replace(/\b(is|are|was|were)\b/gi, " ")
    .replace(/(?:₦|ngn)\s*\d+(?:,\d{3})*(?:\.\d{1,2})?/gi, " ")
    .replace(/\b\d+(?:,\d{3})*(?:\.\d{1,2})?\b\s*$/g, " ")
    .replace(/[=:,-]/g, " ")
    .replace(/\b(of|for|the|a|an|my)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
 
  return toTitleCase(cleaned);
}
 
function looksLikePriceMessage(message: string, entities: SaveEntity[] = []): boolean {
  // Pin/code notes contain numbers but are NOT prices
  if (isNoteContent(message, entities)) return false;
 
  const text = message.toLowerCase();
 
  const hasMoneyEntity = entities.some((item) => item.entity === "money");
  const hasCurrency = /(₦|ngn)/i.test(message);
  const hasPriceKeyword =
    /\b(price|prices|cost|sell|selling|costs?|priced?)\b/.test(text);
  const hasAmountWithContext =
    /\bamount\b/.test(text) && (hasCurrency || hasPriceKeyword);
 
  const hasStrongSignal =
    hasMoneyEntity || hasCurrency || hasPriceKeyword || hasAmountWithContext;
 
  if (!hasStrongSignal) return false;
 
  return extractPriceValue(message) !== null;
}
 
function buildPriceNormalizedContent(input: {
  productName: string;
  category: string;
  description: string;
  currency?: string;
}) {
  return normalizeText(
    `${input.productName} ${input.category} ${input.description} ${input.currency ?? "NGN"}`
  );
}
 
function resolveFinalCategory(content: string, entities: SaveEntity[] = []): string {
  if (looksLikePinOrCode(content)) return "note";         // ← pins always note
  if (looksLikeRealContact(content, entities)) return "contact";
  if (looksLikeCredential(content)) return "secure_note";
 
  const detected = detectCategory(content);
  if (!detected) return "note";
 
  // prevent weak classifiers from forcing random text into contact
  if (detected === "contact" && !looksLikeRealContact(content, entities)) {
    return "note";
  }
 
  return detected;
}
 
function buildBetterTitle(content: string, category: string): string {
  if (category === "contact") {
    const possibleName = extractContactName(content);
    if (possibleName) return possibleName.slice(0, 60);
    return "Contact";
  }
 
  // For short notes use the full content as title (it's usually one line)
  return content.slice(0, 80);
}
 
// ─── Build a rich normalized string so search can find the note
// using any word in it (e.g. "car", "pin", "1234" all hit it).
function buildNoteNormalizedContent(
  content: string,
  contactName: string,
  contactPhone: string,
  contactEmail: string
): string {
  return normalizeText(
    `${content} ${contactName} ${contactPhone} ${contactEmail}`
  );
}
 
export async function handleSave(
  message: string,
  userId: string,
  entities: SaveEntity[] = []
) {
  if (!userId) {
    return Response.json(
      { type: "system", message: "Please log in to save notes." },
      { status: 401 }
    );
  }
 
  try {
    const cleanMessage = safeString(message);
 
    if (!cleanMessage) {
      return Response.json(
        { type: "system", message: "Missing message" },
        { status: 400 }
      );
    }
 
    if (detectBulkPriceList(cleanMessage)) {
      console.log("[Save Handler] Bulk price list detected");
      return handleBulkPriceSave(cleanMessage, userId);
    }
 
    const strippedMessage = stripSaveCommand(cleanMessage);
 
    // ─── Decide routing ──────────────────────────────────────
    // A pin/code note must NEVER be routed to price or contact,
    // regardless of what other signals are present.
    const forcedNote =
      looksLikePinOrCode(strippedMessage) ||
      (looksLikeLongFreeText(strippedMessage) &&
        !looksLikePriceMessage(strippedMessage, entities) &&
        !looksLikeRealContact(strippedMessage, entities));
 
    const rawContent = forcedNote
      ? strippedMessage
      : getBestSaveContent(cleanMessage, entities);
 
    // ─── CORE FIX: minimum length is 2 chars, not 12 ─────────
    // Previously the guard `content.length < 2` sometimes
    // rejected real notes because extractContent trimmed them.
    // Now we fall back to strippedMessage if rawContent is empty.
    const content = safeString(rawContent) || safeString(strippedMessage);
 
    if (!content || content.length < 2) {
      return Response.json({
        type: "assistant",
        message:
          "What do you want me to save? Please add the content after the save keyword.\n\nExample: *Save my car pin 1234*",
      });
    }
 
    // ─── Price save ──────────────────────────────────────────
    const isPriceSave =
      !looksLikePinOrCode(content) && looksLikePriceMessage(content, entities);
 
    if (isPriceSave) {
      const price = extractPriceValue(content);
      const rawProductName = extractProductName(content);
      const productName = toTitleCase(rawProductName);
      const normalizedProductName = buildProductNormalizedName(productName);
      const category = detectCategory(productName || content) || "product";
 
      if (!price || !productName) {
        return Response.json({
          type: "assistant",
          message:
            "I found a possible price, but I could not clearly detect the product name.\n\nExample: *Save coke price 300*",
        });
      }
 
      const normalizedContent = buildPriceNormalizedContent({
        productName: `${productName} ${normalizedProductName}`,
        category,
        description: content,
        currency: "NGN",
      });
 
      const { data: existingPrice, error: existingPriceError } =
        await serverSupabase
          .from("product_prices")
          .select("id, product_name, price, created_at")
          .eq("user_id", userId)
          .eq("price", price)
          .eq("currency", "NGN")
          .ilike("product_name", productName)
          .maybeSingle();
 
      if (existingPriceError) {
        console.error(
          "[Save Handler] Price duplicate check error:",
          existingPriceError
        );
      }
 
      if (existingPrice) {
        return Response.json({
          type: "assistant",
          message: `⚠️ Already saved!\n\n${existingPrice.product_name} — ₦${existingPrice.price}\n\nSay *update the price* if you want to change it.`,
          duplicate: true,
          existingId: existingPrice.id,
        });
      }
 
      const { data: insertedPrice, error: insertPriceError } =
        await serverSupabase
          .from("product_prices")
          .insert({
            user_id: userId,
            product_name: productName,
            price,
            currency: "NGN",
            category,
            description: content,
            normalized_content: normalizedContent,
          })
          .select("id, product_name, price, currency, category, created_at")
          .single();
 
      if (insertPriceError) {
        console.error("[Save Handler] Price insert error:", insertPriceError);
        return Response.json(
          { type: "system", message: "Failed to save price. Please try again." },
          { status: 500 }
        );
      }
 
      return Response.json({
        type: "save_confirm",
        message: `✅ Saved price for *${insertedPrice.product_name}* — ₦${insertedPrice.price}`,
        product_price: insertedPrice,
      });
    }
 
    // ─── Note / Contact save ─────────────────────────────────
    const category = resolveFinalCategory(content, entities);
 
    const contactName =
      category === "contact" ? extractContactName(content) : "";
    const contactPhone =
      category === "contact" ? extractPhoneNumber(content) : "";
    const contactEmail =
      category === "contact" ? extractEmail(content) : "";
 
    const title =
      category === "contact" && contactName
        ? contactName
        : buildBetterTitle(content, category);
 
    const finalContent =
      category === "contact"
        ? buildContactDescription(
            contactName || title,
            contactPhone,
            contactEmail,
            content
          )
        : content;
 
    const contentHash = generateHash(finalContent);
 
    // ─── Normalized content: every word indexed for search ───
    // We include the raw content, title, and all contact fields
    // so that searching "car pin" or "1234" both find this note.
    const normalizedContent = buildNoteNormalizedContent(
      finalContent,
      contactName,
      contactPhone,
      contactEmail
    );
 
    const { data: existing, error: fetchError } = await serverSupabase
      .from("notes")
      .select("id, title, content, created_at")
      .eq("user_id", userId)
      .eq("content_hash", contentHash)
      .maybeSingle();
 
    if (fetchError) {
      console.error("[Save Handler] Duplicate check error:", fetchError);
    }
 
    if (existing) {
      return Response.json({
        type: "assistant",
        message: `⚠️ Already saved!\n\n"${safeString(existing.content).slice(
          0,
          100
        )}"\n\nSay *replace it* to overwrite or *keep both* to save again.`,
        duplicate: true,
        existingId: existing.id,
      });
    }
 
    const { data: inserted, error: insertError } = await serverSupabase
      .from("notes")
      .insert({
        user_id: userId,
        content: finalContent,
        title,
        category,
        content_hash: contentHash,
        normalized_content: normalizedContent,
        metadata: {
          entities,
          originalMessage: cleanMessage,
          isRealContact: category === "contact",
          contact_name: category === "contact" ? contactName : null,
          phone: category === "contact" ? contactPhone : null,
          email: category === "contact" ? contactEmail : null,
        },
        created_at: new Date().toISOString(),
      })
      .select("id, title, content, category, metadata, created_at")
      .single();
 
    if (insertError) {
      console.error("[Save Handler] Insert error:", insertError);
      return Response.json(
        { type: "system", message: "Failed to save. Please try again." },
        { status: 500 }
      );
    }
 
    const reply =
      category === "contact"
        ? `✅ Saved contact: *${title}*${
            contactPhone ? ` — ${contactPhone}` : ""
          }${contactEmail ? ` ${contactEmail}` : ""}`
        : buildSaveReply(category, finalContent);
 
    return Response.json({
      type: "save_confirm",
      message: reply,
      note: inserted ?? null,
    });
  } catch (error) {
    console.error("[Save Handler] Unexpected error:", error);
    return Response.json(
      { type: "system", message: "Server error. Please try again." },
      { status: 500 }
    );
  }
}