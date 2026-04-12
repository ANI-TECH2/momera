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

function getBestSaveContent(message: string, entities: SaveEntity[] = []): string {
  const extracted = safeString(extractContent(message));
  if (extracted.length >= 2) return extracted;

  const usefulEntities = entities
    .filter((item) =>
      ["phone", "email", "money", "date_like", "place", "keyword", "name_like"].includes(
        item.entity
      )
    )
    .map((item) => safeString(item.sourceText))
    .filter(Boolean);

  if (usefulEntities.length > 0) return usefulEntities.join(" ");
  return extracted;
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

function isNoteContent(text: string): boolean {
  const lower = text.toLowerCase();

  if (
    /\b(password|passwd|secret|login|username|credential|passphrase|otp|2fa|token|api\s*key)\b/i.test(
      lower
    )
  ) {
    return true;
  }

  if (/\bpin\b/i.test(lower) && /\d{4,}/.test(text)) return true;

  const hasContactWord = /\b(call|contact|mobile|tel|whatsapp|number)\b/i.test(lower);
  const hasPhoneDigits =
    /\b0[789]\d{9}\b/.test(text) || /\+\d{1,3}[\s\-]?\d{6,14}/.test(text);

  if (hasContactWord && hasPhoneDigits) return true;
  if (hasPhoneDigits) return true;

  if (
    /\b(date|birthday|dob|born|appointment|meeting|schedule|reminder|anniversary|event)\b/i.test(
      lower
    )
  ) {
    return true;
  }

  if (/\b(account|acct|nuban|bvn|nin|id\s*number|reg\s*number|matric)\b/i.test(lower)) {
    return true;
  }

  return false;
}

function looksLikePriceMessage(message: string, entities: SaveEntity[] = []): boolean {
  if (isNoteContent(message)) return false;

  const text = message.toLowerCase();

  const hasMoneyEntity = entities.some((item) => item.entity === "money");
  const hasCurrency = /(₦|ngn)/i.test(message);
  const hasPriceKeyword = /\b(price|prices|cost|sell|selling|costs?|priced?)\b/.test(text);
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

    const content = getBestSaveContent(cleanMessage, entities);

    if (!content || content.length < 2) {
      return Response.json({
        type: "assistant",
        message:
          "What do you want me to save? Please add the content after the save keyword.\n\nExample: *Save my classmate John 08012345678*",
      });
    }

    const isPriceSave = looksLikePriceMessage(content, entities);

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

      const { data: existingPrice, error: existingPriceError } = await serverSupabase
        .from("product_prices")
        .select("id, product_name, price, created_at")
        .eq("user_id", userId)
        .eq("price", price)
        .eq("currency", "NGN")
        .ilike("product_name", productName)
        .maybeSingle();

      if (existingPriceError) {
        console.error("[Save Handler] Price duplicate check error:", existingPriceError);
      }

      if (existingPrice) {
        return Response.json({
          type: "assistant",
          message: `⚠️ Already saved!\n\n${existingPrice.product_name} — ₦${existingPrice.price}\n\nSay *update the price* if you want to change it.`,
          duplicate: true,
          existingId: existingPrice.id,
        });
      }

      const { data: insertedPrice, error: insertPriceError } = await serverSupabase
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

    const category = detectCategory(content);
    const contentHash = generateHash(content);
    const normalizedContent = normalizeText(content);

    const { data: existing, error: fetchError } = await serverSupabase
      .from("notes")
      .select("id, content, created_at")
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
        content,
        title: content.slice(0, 60),
        category,
        content_hash: contentHash,
        normalized_content: normalizedContent,
        metadata: {
          entities,
          originalMessage: cleanMessage,
        },
        created_at: new Date().toISOString(),
      })
      .select("id, content, category, created_at")
      .single();

    if (insertError) {
      console.error("[Save Handler] Insert error:", insertError);
      return Response.json(
        { type: "system", message: "Failed to save. Please try again." },
        { status: 500 }
      );
    }

    const reply = buildSaveReply(category, content);

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