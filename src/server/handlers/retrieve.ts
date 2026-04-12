// ─── RETRIEVE HANDLER ─────────────────────────────────────────
// Thin orchestration layer. All helpers live in retrieveHelpers.ts
// and all DB queries live in retrieveQueries.ts.

import { buildSmartReply } from "@/server/nlp/replyBuilder";
import { ExtractedEntity } from "@/app/api/chat+api";

import {
  safeString,
  extractPhones,
  normalizePhone,
  getPhoneVariants,
  cleanKeyword,
  cleanPriceKeyword,
  detectPriceIntent,
  detectFileIntent,
  dedupeNotes,
  summarizeNote,
  summarizeFile,
  summarizePrice,
  FileRow,
} from "@/server/handlers/Retrievehelpers";

import {
  searchNotes,
  fetchRecentNotes,
  searchProductPrices,
  fetchRecentPrices,
  searchImages,
  searchDocuments,
  searchAllData,
  createSignedUrl,
} from "@/server/handlers/Retrievequeries";

// ─── HELPERS ──────────────────────────────────────────────────

function pickBestKeyword(message: string, fallback: string): string {
  const cleaned = typeof fallback === "string" ? fallback.trim() : "";
  if (cleaned) return cleaned;

  return typeof message === "string" ? message.trim() : "";
}

function buildFileResponse(
  type: "image" | "document",
  files: FileRow[],
  signedUrl: string | null
): Response {
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

function buildRecentFallbackMessage(
  keyword: string,
  recentNotes: any[],
  recentPrices: any[]
): string {
  let msg = `Nothing found for *"${keyword}"*.\n\n`;

  if (recentNotes.length > 0) {
    msg += `Your recent notes:\n${recentNotes.map(summarizeNote).join("\n")}\n\n`;
  }

  if (recentPrices.length > 0) {
    msg += `Your recent prices:\n${recentPrices.map(summarizePrice).join("\n")}\n\n`;
  }

  return msg.trim();
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
    const { lookingForImage, lookingForDoc } = detectFileIntent(cleanMessage);
    const lookingForPrice = detectPriceIntent(cleanMessage);

    const cleanedKeyword = cleanKeyword(cleanMessage);
    const cleanedPriceKeyword = cleanPriceKeyword(cleanMessage);

    const lowerKeyword = pickBestKeyword(cleanMessage, cleanedKeyword);
    const priceKeyword = pickBestKeyword(lowerKeyword, cleanedPriceKeyword);

    // Build phone variants from NLP entities or raw extraction
    const entityPhones = entities
      .filter((e) => e.entity === "phone")
      .map((e) => safeString(e.value ?? e.sourceText))
      .filter(Boolean);

    const rawPhones = entityPhones.length > 0 ? entityPhones : extractPhones(cleanMessage);
    const normalizedPhones = rawPhones.map(normalizePhone).filter(Boolean);

    const phoneVariants = [
      ...new Set(
        [...rawPhones, ...normalizedPhones].flatMap((p) => getPhoneVariants(p))
      ),
    ].filter(Boolean);

    console.log(
      `[Retrieve] keyword="${lowerKeyword}" | priceKeyword="${priceKeyword}" ` +
        `| image=${lookingForImage} | doc=${lookingForDoc} | price=${lookingForPrice} ` +
        `| phones=${JSON.stringify(phoneVariants)}`
    );

    // ── IMAGE ──────────────────────────────────────────────────
    if (lookingForImage) {
      const images = await searchImages(userId, lowerKeyword);

      if (images.length > 0) {
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

      if (docs.length > 0) {
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

        const msg =
          prices.length === 1
            ? `💰 *${best.product_name}* — ${symbol}${best.price}${
                best.category ? `\n_Category: ${best.category}_` : ""
              }`
            : `💰 Found ${prices.length} price matches:\n\n${prices
                .map(summarizePrice)
                .join("\n")}`;

        return Response.json({
          type: "price_result",
          message: msg,
          product_price: best,
          matches: prices.length,
          all_prices: prices,
        });
      }

      // Fallback: search ALL tables in parallel before giving up
      const fallback = await searchAllData(userId, priceKeyword, []);

      if (fallback.notes.length > 0) {
        const topNotes = dedupeNotes(fallback.notes).slice(0, 3);

        return Response.json({
          type: "not_found",
          message:
            `No saved price found for *"${priceKeyword}"*.\n\nBut I found related notes:\n\n` +
            topNotes.map(summarizeNote).join("\n") +
            `\n\nTo save a price: *"Save ${priceKeyword} price 500"*`,
          notes: topNotes,
        });
      }

      if (fallback.images.length > 0 || fallback.documents.length > 0) {
        let msg = `No saved price found for *"${priceKeyword}"*, but I found:\n\n`;

        if (fallback.images.length > 0) {
          msg += `**${fallback.images.length} image(s):**\n`;
          msg += fallback.images.map(summarizeFile).join("\n") + "\n\n";
        }

        if (fallback.documents.length > 0) {
          msg += `**${fallback.documents.length} document(s):**\n`;
          msg += fallback.documents.map(summarizeFile).join("\n") + "\n\n";
        }

        return Response.json({ type: "not_found", message: msg.trim() });
      }

      const [recentPrices, recentNotes] = await Promise.all([
        fetchRecentPrices(userId),
        fetchRecentNotes(userId),
      ]);

      let notFoundMsg = `No saved price found for *"${priceKeyword}"*.\n\n`;

      if (recentPrices.length > 0) {
        notFoundMsg += `Your recent prices:\n${recentPrices
          .map(summarizePrice)
          .join("\n")}\n\n`;
      }

      if (recentNotes.length > 0) {
        notFoundMsg += `Your recent notes:\n${recentNotes
          .map(summarizeNote)
          .join("\n")}\n\n`;
      }

      notFoundMsg += `To save this price: *"Save ${priceKeyword} price 500"*`;

      return Response.json({
        type: "not_found",
        message: notFoundMsg,
        recentPrices,
        recentNotes,
      });
    }

    // ── NOTES + CROSS-TABLE (all in one shot) ──────────────────
    const allResults = await searchAllData(userId, lowerKeyword, phoneVariants);
    const notes = dedupeNotes(allResults.notes).slice(0, 5);

    if (notes.length === 1) {
      return Response.json({
        type: "retrieve_result",
        message: buildSmartReply(cleanMessage, notes, "note"),
        note: notes[0],
        matches: 1,
      });
    }

    if (notes.length > 1) {
      return Response.json({
        type: "retrieve_multiple",
        message:
          `Found ${notes.length} matches for *"${lowerKeyword}"*:\n\n` +
          notes.map(summarizeNote).join("\n"),
        notes,
        matches: notes.length,
      });
    }

    // No notes — check prices from already-fetched results
    if (allResults.prices.length > 0) {
      return Response.json({
        type: "price_result",
        message:
          `No notes found for *"${lowerKeyword}"*, but found saved price info:\n\n` +
          allResults.prices.map(summarizePrice).join("\n"),
        product_price: allResults.prices[0],
        matches: allResults.prices.length,
        all_prices: allResults.prices,
      });
    }

    // No notes or prices — check files
    const hasImages = allResults.images.length > 0;
    const hasDocs = allResults.documents.length > 0;

    if (hasImages || hasDocs) {
      let msg = `No notes found for *"${lowerKeyword}"*, but I found:\n\n`;

      if (hasImages) {
        msg += `**${allResults.images.length} image(s):**\n`;
        msg += allResults.images.map(summarizeFile).join("\n");
        msg += `\n\nSay *"show my images"* to view them.\n`;
      }

      if (hasDocs) {
        msg += `\n**${allResults.documents.length} document(s):**\n`;
        msg += allResults.documents.map(summarizeFile).join("\n");
        msg += `\n\nSay *"show my documents"* to view them.`;
      }

      return Response.json({ type: "not_found", message: msg.trim() });
    }

    // Show recents as last resort
    const [recentNotes, recentPrices] = await Promise.all([
      fetchRecentNotes(userId),
      fetchRecentPrices(userId),
    ]);

    if (recentNotes.length > 0 || recentPrices.length > 0) {
      return Response.json({
        type: "not_found",
        message: buildRecentFallbackMessage(lowerKeyword, recentNotes, recentPrices),
        recentNotes,
        recentPrices,
      });
    }

    // Truly empty
    return Response.json({
      type: "not_found",
      message:
        `Nothing saved yet matching *"${lowerKeyword}"*.\n\n` +
        `Try:\n` +
        `→ *"Save John number 08031234567"*\n` +
        `→ *"Save pepper price 600"*\n` +
        `→ *"What is the price of pepper?"*\n` +
        `→ Tap **+** to upload files`,
    });
  } catch (error) {
    console.error("[Retrieve Handler] Unexpected error:", error);

    return Response.json(
      { type: "system", message: "Server error. Please try again." },
      { status: 500 }
    );
  }
}