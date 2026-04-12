import { serverSupabase } from "../supabase";
import { detectCategory, normalizeText } from "../helpers";

type ParsedPrice = {
  product_name: string;
  price: number;
  raw: string;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function stripBulkTrigger(message: string): string {
  return message
    .replace(
      /^(save\s+(these\s+)?prices?|bulk\s+save|price\s+list[:.]?|save\s+price\s+list[:.]?|here\s+are\s+(my\s+)?prices?[:.]?|prices?[:.]?)\s*/i,
      ""
    )
    .trim();
}

function parsePriceLine(line: string): ParsedPrice | null {
  const raw = line.trim();
  if (!raw || raw.length < 2) return null;
  if (isNoteContent(raw)) return null;

  const cleaned = raw
    .replace(/ngn\s*/gi, "")
    .replace(/₦/g, "")
    .replace(/\s*[-=:]\s*/g, " ")
    .replace(/[()[\]]/g, " ")
    .replace(/,(?=\d{3})/g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = cleaned.match(/^(.+?)\s+(\d+(?:\.\d{1,2})?)$/);
  if (!match) return null;

  const productName = match[1]
    .replace(/\b(price|cost|amount|of|the|a|an|my|save|store)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const price = Number(match[2]);

  if (!productName || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    product_name: toTitleCase(productName),
    price,
    raw,
  };
}

function splitInlinePricePairs(text: string): string[] {
  const normalised = text.replace(/,\s*/g, " ").trim();
  const tokens = normalised.split(/\s+/);

  const pairs: string[] = [];
  let buffer: string[] = [];

  for (const token of tokens) {
    const isNumber = /^\d+(?:\.\d{1,2})?$/.test(token);

    if (isNumber && buffer.length > 0) {
      pairs.push(`${buffer.join(" ")} ${token}`);
      buffer = [];
    } else {
      buffer.push(token);
    }
  }

  return pairs;
}

export function detectBulkPriceList(message: string): boolean {
  const hasTrigger =
    /^(save\s+(these\s+)?prices?|bulk\s+save|price\s+list[:.]?|save\s+price\s+list[:.]?|here\s+are\s+(my\s+)?prices?[:.]?|prices?[:.]?)/i.test(
      message.trim()
    );

  if (hasTrigger) {
    const body = stripBulkTrigger(message);
    const inlinePairs = splitInlinePricePairs(body);
    const multiLinePairs = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);

    const parseableInline = inlinePairs.filter((l) => parsePriceLine(l) !== null);
    const parseableMulti = multiLinePairs.filter((l) => parsePriceLine(l) !== null);

    return parseableInline.length >= 1 || parseableMulti.length >= 2;
  }

  const lines = message.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const parseable = lines.filter((line) => parsePriceLine(line) !== null);
    if (parseable.length >= 2) return true;
  }

  const inlinePairs = splitInlinePricePairs(message);
  const parseableInline = inlinePairs.filter((l) => parsePriceLine(l) !== null);
  return parseableInline.length >= 2;
}

function extractBulkPrices(message: string): {
  parsed: ParsedPrice[];
  failed: string[];
} {
  const body = stripBulkTrigger(message);

  const hasNewlines = /\n/.test(body);
  const candidates: string[] = hasNewlines
    ? body.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    : splitInlinePricePairs(body);

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

export async function handleBulkPriceSave(
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

  const insertRows: Array<{
    user_id: string;
    product_name: string;
    price: number;
    currency: string;
    category: string;
    description: string;
    normalized_content: string;
  }> = [];

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
      message: `⚠️ All ${parsed.length} prices are already saved:\n\n${skipped
        .map((s) => `• ${s}`)
        .join("\n")}`,
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

  let reply = `✅ Saved ${inserted?.length ?? 0} price${
    (inserted?.length ?? 0) !== 1 ? "s" : ""
  }:\n\n${savedList}`;

  if (skipped.length > 0) {
    reply += `\n\n⚠️ Already saved (skipped):\n${skipped
      .map((s) => `• ${s}`)
      .join("\n")}`;
  }

  if (failed.length > 0) {
    reply += `\n\n❌ Could not parse (${failed.length} line${
      failed.length !== 1 ? "s" : ""
    }):\n${failed.map((f) => `• ${f}`).join("\n")}`;
  }

  return Response.json({
    type: "save_confirm",
    message: reply,
    product_prices: inserted ?? [],
    skipped,
    failed,
  });
}