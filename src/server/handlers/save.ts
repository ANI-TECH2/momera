import { serverSupabase } from "../supabase";
import {
  extractContent,
  detectCategory,
  generateHash,
  normalizeText,
} from "@/server/helpers";
import { buildSaveReply } from "@/server/nlp/replyBuilder";
import {
  detectBulkPriceList,
  handleBulkPriceSave,
} from "@/server/handlers/bulkPriceSave";
import { findExistingPrice, findExistingNote } from "@/server/helpers/duplicatechecks";
import { ExtractedEntity } from "@/app/api/chat+api";

type SaveEntity = ExtractedEntity;

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type PendingSaveDuplicate = {
  existingId: string;
  newContent: string;
  newTitle: string;
  category: string;
};

// ─── INTENT KEYWORDS ─────────────────────────────────────────────────────────

const INTENT_VERB_PATTERN =
  /\b(save|store|remember|keep|add|note|write\s*down)\b/gi;

// ─── CORE HELPERS ─────────────────────────────────────────────────────────────

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripIntentKeywords(text: string): string {
  return safeString(text)
    .replace(INTENT_VERB_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSaveCommand(text: string): string {
  return safeString(text)
    .replace(/^\s*(save|store|remember|keep|add|note|write\s*down)\b\s*/i, "")
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
  return /\b(password|passwd|secret|login|username|credential|passphrase|otp|2fa|token|api\s*key)\b/i.test(text);
}

function looksLikeMeetingOrReminder(text: string): boolean {
  return /\b(date|birthday|dob|born|appointment|meeting|schedule|reminder|anniversary|event)\b/i.test(text);
}

function looksLikeBankOrIdInfo(text: string): boolean {
  return /\b(account|acct|nuban|bvn|nin|id\s*number|reg\s*number|matric)\b/i.test(text);
}

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
    .replace(INTENT_VERB_PATTERN, " ")
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
  const cleanOriginal = stripIntentKeywords(safeString(original));
  if (cleanOriginal.length > 0) return cleanOriginal;
  const parts = [name, "contact", phone || email].filter(Boolean);
  return parts.join(" ").trim();
}

function looksLikeRealContact(text: string, entities: SaveEntity[] = []): boolean {
  const lower = text.toLowerCase();

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
  if (looksLikePinOrCode(text)) return true;
  if (looksLikeMeetingOrReminder(lower)) return true;
  if (looksLikeBankOrIdInfo(lower)) return true;
  if (looksLikeRealContact(text, entities)) return false;
  if (hasPhoneNumber(text) || hasEmail(text)) return true;

  return false;
}

function getBestSaveContent(stripped: string, entities: SaveEntity[] = []): string {
  if (stripped.length >= 2) {
    const extracted = safeString(extractContent(stripped));
    const extractedIsRicher =
      extracted.length >= 2 &&
      extracted.length > stripped.length &&
      extracted.length >= Math.max(12, Math.floor(stripped.length * 0.8));

    return extractedIsRicher ? extracted : stripped;
  }

  const usefulEntities = entities
    .filter((item) =>
      ["phone", "email", "money", "date_like", "place", "keyword", "name_like"].includes(
        item.entity
      )
    )
    .map((item) => safeString(item.sourceText))
    .filter(Boolean);

  if (usefulEntities.length > 0) return usefulEntities.join(" ");

  return safeString(extractContent(stripped)) || stripped;
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

const TRAILING_PRICE_WITH_UNIT =
  /\d+(?:,\d{3})*(?:\.\d{1,2})?\s*(?:bags?|pcs?|pieces?|units?|litres?|liters?|ltrs?|kg|kgs?|grams?|tons?|crates?|cartons?|bundles?|rolls?|packs?|sachets?|bottles?|tins?|wraps?|yards?|metres?|meters?|dozens?|b|k)?\s*$/gi;

function extractProductName(text: string): string {
  const cleaned = text
    .replace(INTENT_VERB_PATTERN, " ")
    .replace(/\b(price|prices|cost|amount|sell|selling)\b/gi, " ")
    .replace(/\b(is|are|was|were)\b/gi, " ")
    .replace(/(?:₦|ngn)\s*\d+(?:,\d{3})*(?:\.\d{1,2})?/gi, " ")
    .replace(TRAILING_PRICE_WITH_UNIT, " ")
    .replace(/[=:,-]/g, " ")
    .replace(/\b(of|for|the|a|an|my)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return toTitleCase(cleaned);
}

function looksLikePriceMessage(message: string, entities: SaveEntity[] = []): boolean {
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
  if (looksLikePinOrCode(content)) return "note";
  if (looksLikeRealContact(content, entities)) return "contact";
  if (looksLikeCredential(content)) return "secure_note";

  const detected = detectCategory(content);
  if (!detected) return "note";

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

  return content.slice(0, 80);
}

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

// ─── UPDATE/REPLACE LOGIC ────────────────────────────────────────────────────

export async function replaceDuplicate(
  userId: string,
  duplicate: PendingSaveDuplicate
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: updateError } = await serverSupabase
      .from("notes")
      .update({
        content: duplicate.newContent,
        title: duplicate.newTitle,
        category: duplicate.category,
        content_hash: generateHash(duplicate.newContent),
        updated_at: new Date().toISOString(),
      })
      .eq("id", duplicate.existingId)
      .eq("user_id", userId);

    if (updateError) {
      console.error("[Save] Replace duplicate error:", updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (err) {
    console.error("[Save] Replace unexpected error:", err);
    return { success: false, error: "Unexpected error" };
  }
}

// ─── KEEP BOTH LOGIC ─────────────────────────────────────────────────────────

export async function keepBoth(
  userId: string,
  newNote: {
    content: string;
    title: string;
    category: string;
  }
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { data: inserted, error: insertError } = await serverSupabase
      .from("notes")
      .insert({
        user_id: userId,
        content: newNote.content,
        title: newNote.title,
        category: newNote.category,
        content_hash: generateHash(newNote.content),
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[Save] Keep both insert error:", insertError);
      return { success: false, error: insertError.message };
    }

    return { success: true, id: inserted?.id };
  } catch (err) {
    console.error("[Save] Keep both unexpected error:", err);
    return { success: false, error: "Unexpected error" };
  }
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

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

    const strippedMessage = stripIntentKeywords(stripSaveCommand(cleanMessage));

    const forcedNote =
      looksLikePinOrCode(strippedMessage) ||
      (looksLikeLongFreeText(strippedMessage) &&
        !looksLikePriceMessage(strippedMessage, entities) &&
        !looksLikeRealContact(strippedMessage, entities));

    const rawContent = forcedNote
      ? strippedMessage
      : getBestSaveContent(strippedMessage, entities);

    const content = safeString(rawContent) || strippedMessage;

    if (!content || content.length < 2) {
      return Response.json({
        type: "assistant",
        message:
          "What do you want me to save? Please add the content after the save keyword.\n\nExample: *Save my car pin 1234*",
      });
    }

    // ─── PRICE SAVE ──────────────────────────────────────────────────────────
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

      const { exact: exactPrice, similar: similarPrice } =
        await findExistingPrice(userId, productName, price);

      if (exactPrice) {
        return Response.json({
          type: "assistant",
          message:
            `⚠️ *${exactPrice.product_name}* at ₦${exactPrice.price} is already saved.\n\n` +
            `If the price has changed, say:\n` +
            `*Update ${exactPrice.product_name} price to <new price>*`,
          duplicate: true,
          existingId: exactPrice.id,
        });
      }

      if (similarPrice) {
        if (similarPrice.price !== price) {
          return Response.json({
            type: "assistant",
            message:
              `⚠️ You already have *${similarPrice.product_name}* saved at ₦${similarPrice.price}.\n\n` +
              `Did you mean to update the price to ₦${price}?\n` +
              `Say *Update ${similarPrice.product_name} price to ${price}* to change it, ` +
              `or give your product a different name to save it separately.`,
            duplicate: true,
            existingId: similarPrice.id,
          });
        }

        return Response.json({
          type: "assistant",
          message:
            `⚠️ A similar product *${similarPrice.product_name}* at ₦${similarPrice.price} already exists.\n\n` +
            `Is *${productName}* a different product? If yes, please use a clearer name to save it.\n` +
            `Otherwise say *Update ${similarPrice.product_name}* to edit the existing entry.`,
          duplicate: true,
          existingId: similarPrice.id,
        });
      }

      // ── No duplicate — insert price ───────────────────────────────────────
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
            // normalized_content handled by DB trigger or omitted safely
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

    // ─── NOTE / CONTACT SAVE ─────────────────────────────────────────────────
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

    const { exact: exactNote, similar: similarNote } =
      await findExistingNote(userId, contentHash, title);

    if (exactNote) {
      return Response.json({
        type: "assistant",
        message:
          `⚠️ Already saved!\n\n"${safeString(exactNote.content).slice(0, 100)}"\n\n` +
          `Say *replace it* to overwrite, or *keep both* to save a new copy.`,
        duplicate: true,
        existingId: exactNote.id,
        newContent: finalContent,
        newTitle: title,
        category: category,
      });
    }

    if (similarNote) {
      return Response.json({
        type: "assistant",
        message:
          `⚠️ A similar note already exists:\n\n"${safeString(similarNote.content).slice(0, 100)}"\n\n` +
          `Did you mean to update that note, or is this a different one?\n` +
          `• Say *replace it* to overwrite the existing note.\n` +
          `• Say *keep both* to save this as a separate note.\n` +
          `• Or change the title/content so it's clearly different.`,
        duplicate: true,
        existingId: similarNote.id,
        newContent: finalContent,
        newTitle: title,
        category: category,
      });
    }

    // ── No duplicate — insert note ────────────────────────────────────────
    const { data: inserted, error: insertError } = await serverSupabase
      .from("notes")
      .insert({
        user_id: userId,
        content: finalContent,
        title,
        category,
        content_hash: contentHash,
        // FIX: removed normalized_content — column not in schema cache
        // Add a DB trigger to auto-populate it, or reload schema cache in Supabase
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