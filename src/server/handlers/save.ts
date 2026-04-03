import { serverSupabase } from "../supabase";
import {
  extractContent,
  detectCategory,
  generateHash,
  normalizeText,
} from "../helpers";
import { buildSaveReply } from "../nlp/replyBuilder";
import { ExtractedEntity } from "@/app/api/chat+api";

type SaveEntity = ExtractedEntity;

type ParsedPrice = {
  product_name: string;
  price: number;
  raw: string;
};

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
    .replace(/\b(price|cost|amount|sell|selling)\b/gi, " ")
    .replace(/\b(is|are|was|were)\b/gi, " ")
    .replace(/(?:₦|ngn)\s*\d+(?:,\d{3})*(?:\.\d{1,2})?/gi, " ")
    .replace(/\b\d+(?:,\d{3})*(?:\.\d{1,2})?\b\s*$/g, " ")
    .replace(/[=:,-]/g, " ")
    .replace(/\b(of|for|the|a|an|my)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return toTitleCase(cleaned);
}

// ─── CORE CLASSIFIER ──────────────────────────────────────────

function isNoteContent(text: string): boolean {
  const lower = text.toLowerCase();

  // Security / credentials — always a note
  if (/\b(password|passwd|secret|login|username|credential|passphrase|otp|2fa|token|api\s*key)\b/i.test(lower)) {
    return true;
  }

  // PIN only when it looks like an actual PIN (digits nearby), not a product called "pin"
  if (/\bpin\b/i.test(lower) && /\d{4,}/.test(text)) return true;

  // Phone NUMBER context — must have a contact/call word AND actual digits
  // "phone 200" (product price) should NOT match; "John phone 08012345678" should
  const hasContactWord = /\b(call|contact|mobile|tel|whatsapp|number)\b/i.test(lower);
  const hasPhoneDigits = /\b0[789]\d{9}\b/.test(text) || /\+\d{1,3}[\s\-]?\d{6,14}/.test(text);

  if (hasContactWord && hasPhoneDigits) return true;
  if (hasPhoneDigits) return true; // raw Nigerian/intl number with no product context

  // Date / appointment — always a note
  if (/\b(date|birthday|dob|born|appointment|meeting|schedule|reminder|anniversary|event)\b/i.test(lower)) {
    return true;
  }

  // Account / ID numbers — always a note
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
  const hasPriceKeyword = /\b(price|cost|sell|selling|costs?|priced?)\b/.test(text);
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

// ─── BULK PRICE DETECTION & PARSING ──────────────────────────
//
// Supports ALL these user input styles:
//
//   Style A — multiline (one product per line):
//     pepper 50
//     garri 50
//     fruit 50
//
//   Style B — inline space/comma separated:
//     price pepper 50 garri 50 fruit 50
//     price: pepper 50, garri 50, fruit 50
//
//   Style C — with explicit trigger word:
//     save prices pepper 50 garri 50 fruit 50
//     price list: pepper 50, garri 50, fruit 50

function stripBulkTrigger(message: string): string {
  return message
    .replace(
      /^(save\s+(these\s+)?prices?|bulk\s+save|price\s+list[:.]?|save\s+price\s+list[:.]?|here\s+are\s+(my\s+)?prices?[:.]?|prices?[:.]?)\s*/i,
      ""
    )
    .trim();
}

/**
 * Parse a single "product name + price" token pair.
 * Accepts both:
 *   - Full lines:  "pepper 50"  /  "garri - 200"  /  "Rice: 2000"
 *   - Inline pair: same formats but extracted from a flat string
 */
function parsePriceLine(line: string): ParsedPrice | null {
  const raw = line.trim();
  if (!raw || raw.length < 2) return null;
  if (isNoteContent(raw)) return null;

  const cleaned = raw
    .replace(/ngn\s*/gi, "")
    .replace(/₦/g, "")
    .replace(/\s*[-=:]\s*/g, " ")
    .replace(/[()[\]]/g, " ")
    .replace(/,(?=\d{3})/g, "")   // strip thousand separators: 1,000 → 1000
    .replace(/,/g, " ")            // remaining commas become spaces
    .replace(/\s+/g, " ")
    .trim();

  // Expect: <words> <number>   e.g. "red pepper 50" or "garri 2000"
  const match = cleaned.match(/^(.+?)\s+(\d+(?:\.\d{1,2})?)$/);
  if (!match) return null;

  let productName = match[1]
    .replace(/\b(price|cost|amount|of|the|a|an|my|save|store)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const price = Number(match[2]);

  if (!productName || productName.length < 1 || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    product_name: toTitleCase(productName),
    price,
    raw,
  };
}

/**
 * Split an INLINE price string into individual product+price pairs.
 *
 * Input:  "pepper 50 garri 50 fruit 50"
 * Output: ["pepper 50", "garri 50", "fruit 50"]
 *
 * Strategy: scan token by token; whenever we see a number that follows
 * at least one word, emit that chunk as a candidate line.
 */
function splitInlinePricePairs(text: string): string[] {
  // Also handle comma-separated: "pepper 50, garri 50, fruit 50"
  const normalised = text.replace(/,\s*/g, " ").trim();
  const tokens = normalised.split(/\s+/);

  const pairs: string[] = [];
  let buffer: string[] = [];

  for (const token of tokens) {
    const isNumber = /^\d+(?:\.\d{1,2})?$/.test(token);

    if (isNumber && buffer.length > 0) {
      // Close the current pair
      pairs.push(`${buffer.join(" ")} ${token}`);
      buffer = [];
    } else {
      buffer.push(token);
    }
  }

  // Leftover words with no price — ignore (they can't form a valid pair)
  return pairs;
}

/**
 * Decide whether the message is a bulk price list.
 *
 * Returns true when:
 *  - Has an explicit bulk trigger keyword, OR
 *  - Has 2+ newline-separated parseable lines, OR
 *  - Has 2+ inline product+price pairs (e.g. "price pepper 50 garri 50")
 */
function detectBulkPriceList(message: string): boolean {
  const hasTrigger =
    /^(save\s+(these\s+)?prices?|bulk\s+save|price\s+list[:.]?|save\s+price\s+list[:.]?|here\s+are\s+(my\s+)?prices?[:.]?|prices?[:.]?)/i.test(
      message.trim()
    );

  if (hasTrigger) {
    // Confirm there is at least one parseable pair after the trigger
    const body = stripBulkTrigger(message);
    const inlinePairs = splitInlinePricePairs(body);
    const multiLinePairs = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);

    const parseableInline = inlinePairs.filter((l) => parsePriceLine(l) !== null);
    const parseableMulti = multiLinePairs.filter((l) => parsePriceLine(l) !== null);

    return parseableInline.length >= 1 || parseableMulti.length >= 2;
  }

  // No trigger — check multiline body
  const lines = message.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const parseable = lines.filter((line) => parsePriceLine(line) !== null);
    if (parseable.length >= 2) return true;
  }

  // Check inline pairs (single line, no trigger)
  const inlinePairs = splitInlinePricePairs(message);
  const parseableInline = inlinePairs.filter((l) => parsePriceLine(l) !== null);
  return parseableInline.length >= 2;
}

/**
 * Extract all ParsedPrice entries from the message, handling both
 * multiline and inline formats.
 */
function extractBulkPrices(message: string): {
  parsed: ParsedPrice[];
  failed: string[];
} {
  const body = stripBulkTrigger(message);

  // Prefer multiline splitting if there are actual newlines
  const hasNewlines = /\n/.test(body);
  const candidates: string[] = hasNewlines
    ? body.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    : splitInlinePricePairs(body);

  // If multiline splitting produced < 2 candidates, try inline as fallback
  const effectiveCandidates =
    candidates.length < 2 && !hasNewlines
      ? splitInlinePricePairs(body)
      : candidates;

  const parsed: ParsedPrice[] = [];
  const failed: string[] = [];

  for (const line of effectiveCandidates) {
    const result = parsePriceLine(line);
    if (result) {
      parsed.push(result);
    } else if (line.length > 1) {
      failed.push(line);
    }
  }

  return { parsed, failed };
}

// ─── BULK SAVE ────────────────────────────────────────────────

async function handleBulkPriceSave(
  message: string,
  userId: string
): Promise<Response> {
  const { parsed, failed } = extractBulkPrices(message);

  if (parsed.length === 0) {
    return Response.json({
      type: "assistant",
      message:
        "I could not extract any prices from your list.\n\nMake sure each item has a name and a number:\n\n*pepper 50*\n*garri 500*\n*fruit 200*\n\nOr inline: *price pepper 50 garri 500 fruit 200*",
    });
  }

  const insertRows: object[] = [];
  const skipped: string[] = [];

  for (const item of parsed) {
    const cleanProductName = toTitleCase(item.product_name);
    const normalizedProductName = buildProductNormalizedName(cleanProductName);
    const category = detectCategory(cleanProductName) || "product";
    const normalizedContent = normalizeText(
      `${cleanProductName} ${normalizedProductName} ${category} ${item.raw} NGN`
    );

    const { data: existing, error: existingError } = await serverSupabase
      .from("product_prices")
      .select("id, product_name, price")
      .eq("user_id", userId)
      .eq("price", item.price)
      .eq("currency", "NGN")
      .ilike("product_name", cleanProductName)
      .maybeSingle();

    if (existingError) {
      console.error("[Save Handler] Bulk duplicate check error:", existingError);
    }

    if (existing) {
      skipped.push(`${existing.product_name} ₦${existing.price}`);
      continue;
    }

    insertRows.push({
      user_id: userId,
      product_name: cleanProductName,
      price: item.price,
      currency: "NGN",
      category,
      description: item.raw,
      normalized_content: normalizedContent,
    });
  }

  if (insertRows.length === 0) {
    return Response.json({
      type: "assistant",
      message: `⚠️ All ${parsed.length} prices are already saved:\n\n${skipped.map((s) => `• ${s}`).join("\n")}`,
      duplicate: true,
    });
  }

  const { data: inserted, error: insertError } = await serverSupabase
    .from("product_prices")
    .insert(insertRows)
    .select("id, product_name, price, currency, category, created_at");

  if (insertError) {
    console.error("[Save Handler] Bulk price insert error:", insertError);
    return Response.json(
      { type: "system", message: "Failed to save prices. Please try again." },
      { status: 500 }
    );
  }

  const savedList = (inserted ?? [])
    .map((p) => `• ${p.product_name} — ₦${p.price}`)
    .join("\n");

  let reply = `✅ Saved ${inserted?.length ?? 0} price${(inserted?.length ?? 0) !== 1 ? "s" : ""}:\n\n${savedList}`;

  if (skipped.length > 0) {
    reply += `\n\n⚠️ Already saved (skipped):\n${skipped.map((s) => `• ${s}`).join("\n")}`;
  }

  if (failed.length > 0) {
    reply += `\n\n❌ Could not parse (${failed.length} line${failed.length !== 1 ? "s" : ""}):\n${failed.map((f) => `• ${f}`).join("\n")}`;
  }

  return Response.json({
    type: "save_confirm",
    message: reply,
    product_prices: inserted ?? [],
    skipped,
    failed,
  });
}

// ─── MAIN HANDLER ─────────────────────────────────────────────

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

    // Step 1: bulk price list
    if (detectBulkPriceList(cleanMessage)) {
      console.log("[Save Handler] Bulk price list detected");
      return handleBulkPriceSave(cleanMessage, userId);
    }

    // Step 2: single save
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

    // Step 3: regular note save
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
        message: `⚠️ Already saved!\n\n"${safeString(existing.content).slice(0, 100)}"\n\nSay *replace it* to overwrite or *keep both* to save again.`,
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