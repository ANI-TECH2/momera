import { serverSupabase } from "../supabase";

// Defined locally to avoid circular import with chat+api.
// Keep in sync with the ExtractedEntity type in chat+api.ts.
export type ExtractedEntity = {
  entity: string;
  sourceText: string;
  value?: string;
  accuracy?: number;
};

type DeleteEntity = ExtractedEntity;

// ─── TYPES ────────────────────────────────────────────────────────────────────

type DeletableTable = "notes" | "product_prices" | "images" | "documents";

type DeleteTarget = {
  table: DeletableTable;
  label: string; // human-readable e.g. "note", "price", "image", "document"
};

type MatchedRecord = {
  id: string;
  label: string;      // display name for the user
  table: DeletableTable;
  file_path?: string; // only for images/documents
};

// ─── UTILS ────────────────────────────────────────────────────────────────────

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

// ─── INTENT PARSING ───────────────────────────────────────────────────────────

/**
 * Strips the delete command verbs and filler words from the message,
 * returning just the subject the user wants to delete.
 *
 * "delete my note about pepper" → "pepper"
 * "remove the price for rice"   → "rice"
 * "clear my image of receipt"   → "receipt"
 */
function extractDeleteSubject(message: string): string {
  return safeString(message)
    .replace(/\b(delete|remove|clear|erase|drop|wipe)\b/gi, " ")
    .replace(/\b(my|the|a|an|all|every|everything)\b/gi, " ")
    .replace(/\b(note|notes|price|prices|contact|contacts|image|images|document|documents|file|files|record|records|entry|entries)\b/gi, " ")
    .replace(/\b(about|for|of|on|with|called|named|from)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detects which table the user is targeting based on keywords in the message.
 * Returns an ordered list — first is most likely.
 */
function detectDeleteTargets(message: string): DeleteTarget[] {
  const lower = message.toLowerCase();
  const targets: DeleteTarget[] = [];

  if (/\b(image|photo|picture|pic)\b/.test(lower))
    targets.push({ table: "images", label: "image" });

  if (/\b(document|doc|file|pdf|attachment)\b/.test(lower))
    targets.push({ table: "documents", label: "document" });

  if (/\b(price|cost|amount|product)\b/.test(lower))
    targets.push({ table: "product_prices", label: "price" });

  if (/\b(contact)\b/.test(lower))
    targets.push({ table: "notes", label: "contact" });

  if (/\b(note|notes|remember|saved|info|record)\b/.test(lower))
    targets.push({ table: "notes", label: "note" });

  // ── No explicit table keyword → search ALL tables in priority order ──────
  // Fixes "delete pepper" being misrouted to notes when pepper is a price.
  // Prices come first since bare product names (pepper, rice, garri) are
  // almost always prices, not notes.
  if (targets.length === 0) {
    targets.push({ table: "product_prices", label: "price" });
    targets.push({ table: "notes", label: "note" });
    targets.push({ table: "images", label: "image" });
    targets.push({ table: "documents", label: "document" });
  }

  return targets;
}

// ─── FUZZY SEARCH ─────────────────────────────────────────────────────────────

/**
 * Searches notes for records matching the subject.
 * Uses normalized_content ilike for broad matching.
 */
async function findMatchingNotes(
  userId: string,
  subject: string
): Promise<MatchedRecord[]> {
  if (!subject) {
    // No subject → return most recent 5 so user can pick
    const { data } = await serverSupabase
      .from("notes")
      .select("id, title, content, category")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    return (data ?? []).map((row) => ({
      id: row.id,
      label: row.title || safeString(row.content).slice(0, 60) || "Untitled note",
      table: "notes" as DeletableTable,
    }));
  }

  const normalized = normalizeForSearch(subject);
  const terms = normalized.split(" ").filter((w) => w.length >= 2);

  // Build OR filter: each word must appear somewhere in normalized_content or title
  const filters = terms
    .map((t) => `normalized_content.ilike.%${t}%,title.ilike.%${t}%`)
    .join(",");

  const { data } = await serverSupabase
    .from("notes")
    .select("id, title, content, category")
    .eq("user_id", userId)
    .or(filters)
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.title || safeString(row.content).slice(0, 60) || "Untitled note",
    table: "notes" as DeletableTable,
  }));
}

/**
 * Searches product_prices for records matching the subject.
 */
async function findMatchingPrices(
  userId: string,
  subject: string
): Promise<MatchedRecord[]> {
  if (!subject) {
    const { data } = await serverSupabase
      .from("product_prices")
      .select("id, product_name, price, currency")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    return (data ?? []).map((row) => ({
      id: row.id,
      label: `${row.product_name} — ${row.currency ?? "₦"}${row.price}`,
      table: "product_prices" as DeletableTable,
    }));
  }

  const normalized = normalizeForSearch(subject);
  const terms = normalized.split(" ").filter((w) => w.length >= 2);
  const filters = terms.map((t) => `normalized_content.ilike.%${t}%,product_name.ilike.%${t}%`).join(",");

  const { data } = await serverSupabase
    .from("product_prices")
    .select("id, product_name, price, currency")
    .eq("user_id", userId)
    .or(filters)
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? []).map((row) => ({
    id: row.id,
    label: `${row.product_name} — ${row.currency ?? "₦"}${row.price?.toLocaleString()}`,
    table: "product_prices" as DeletableTable,
  }));
}

/**
 * Searches images or documents for records matching the subject.
 */
async function findMatchingFiles(
  userId: string,
  subject: string,
  table: "images" | "documents"
): Promise<MatchedRecord[]> {
  if (!subject) {
    const { data } = await serverSupabase
      .from(table)
      .select("id, file_name, file_path, description")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    return (data ?? []).map((row) => ({
      id: row.id,
      label: row.file_name || row.description || "Untitled file",
      table,
      file_path: row.file_path,
    }));
  }

  const normalized = normalizeForSearch(subject);
  const terms = normalized.split(" ").filter((w) => w.length >= 2);
  const filters = terms.map((t) => `file_name.ilike.%${t}%,description.ilike.%${t}%`).join(",");

  const { data } = await serverSupabase
    .from(table)
    .select("id, file_name, file_path, description")
    .eq("user_id", userId)
    .or(filters)
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.file_name || row.description || "Untitled file",
    table,
    file_path: row.file_path,
  }));
}

// ─── ACTUAL DELETE ────────────────────────────────────────────────────────────

/**
 * Deletes a single record. For images/documents also removes from storage
 * and decrements the user's storage usage.
 */
export async function deleteRecord(
  userId: string,
  record: MatchedRecord
): Promise<{ success: boolean; error?: string }> {
  try {
    // ── File tables: delete from storage first ────────────────────────────
    if (record.table === "images" || record.table === "documents") {
      if (record.file_path) {
        const { error: storageError } = await serverSupabase.storage
          .from(record.table)
          .remove([record.file_path]);

        if (storageError) {
          console.error(`[Delete] Storage error for ${record.table}:`, storageError);
          // Don't abort — still remove DB row
        } else {
          // Best-effort: decrement storage usage
          try {
            await serverSupabase.rpc("decrement_storage", {
              p_user_id: userId,
              p_bytes: 0,
            });
          } catch (rpcErr: unknown) {
            console.warn("[Delete] decrement_storage failed:", rpcErr);
          }
        }
      }
    }

    // ── Delete DB row ─────────────────────────────────────────────────────
    const { error: dbError } = await serverSupabase
      .from(record.table)
      .delete()
      .eq("id", record.id)
      .eq("user_id", userId);

    if (dbError) {
      console.error(`[Delete] DB error for ${record.table}:`, dbError);
      return { success: false, error: dbError.message };
    }

    return { success: true };
  } catch (err) {
    console.error("[Delete] Unexpected error:", err);
    return { success: false, error: "Unexpected error" };
  }
}

// ─── BULK DELETE ──────────────────────────────────────────────────────────────

/**
 * Deletes ALL records for a user in a given table.
 * Used when the user says "delete all my notes", "clear all prices", etc.
 */
async function deleteAllInTable(
  userId: string,
  table: DeletableTable
): Promise<{ deleted: number; error?: string }> {
  try {
    if (table === "images" || table === "documents") {
      // Fetch all file paths first
      const { data: files } = await serverSupabase
        .from(table)
        .select("id, file_path")
        .eq("user_id", userId);

      if (files && files.length > 0) {
        const paths = files.map((f) => f.file_path).filter(Boolean);
        if (paths.length > 0) {
          try {
            await serverSupabase.storage.from(table).remove(paths);
          } catch (storageErr: unknown) {
            console.warn("[Delete] Bulk storage remove failed:", storageErr);
          }
        }
      }
    }

    const { error, count } = await serverSupabase
      .from(table)
      .delete({ count: "exact" })
      .eq("user_id", userId);

    if (error) return { deleted: 0, error: error.message };
    return { deleted: count ?? 0 };
  } catch (err) {
    return { deleted: 0, error: "Unexpected error during bulk delete" };
  }
}

// ─── RESPONSE BUILDERS ────────────────────────────────────────────────────────

function buildDeletedReply(record: MatchedRecord): string {
  const replies = [
    `🗑️ Done! *"${record.label}"* has been deleted.`,
    `✅ Deleted *"${record.label}"* successfully.`,
    `🗑️ Got it — *"${record.label}"* is gone.`,
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

function buildNotFoundReply(subject: string, label: string): string {
  return subject
    ? `I couldn't find any ${label} matching *"${subject}"*.\n\nDouble-check the name or say _"show my ${label}s"_ to see what's saved.`
    : `I couldn't find any ${label}s to delete.`;
}

function buildAmbiguousReply(matches: MatchedRecord[], label: string): string {
  const list = matches
    .slice(0, 5)
    .map((m, i) => `${i + 1}. ${m.label}`)
    .join("\n");

  return (
    `⚠️ I found *${matches.length} ${label}s* matching that. Which one?\n\n${list}\n\n` +
    `Say the number or be more specific, e.g. _"Delete ${matches[0].label}"_`
  );
}

function buildBulkDeletedReply(count: number, label: string): string {
  if (count === 0) return `There were no ${label}s to delete.`;
  return `🗑️ Deleted *${count} ${label}${count !== 1 ? "s" : ""}* successfully.`;
}

// ─── DETECT BULK DELETE INTENT ────────────────────────────────────────────────

function isBulkDeleteIntent(message: string): boolean {
  return /\b(all|every|everything|entire|whole)\b/i.test(message);
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

export async function handleDelete(
  message: string,
  userId: string,
  entities: DeleteEntity[] = []
) {
  if (!userId) {
    return Response.json(
      { type: "system", message: "Please log in to delete items." },
      { status: 401 }
    );
  }

  try {
    const cleanMessage = safeString(message);
    if (!cleanMessage) {
      return Response.json({ type: "system", message: "Missing message." }, { status: 400 });
    }

    const targets = detectDeleteTargets(cleanMessage);
    const subject = extractDeleteSubject(cleanMessage);
    const primaryTarget = targets[0];

    // ── Bulk delete: "delete all my notes" ───────────────────────────────────
    if (isBulkDeleteIntent(cleanMessage)) {
      const { deleted, error } = await deleteAllInTable(userId, primaryTarget.table);
      if (error) {
        return Response.json({
          type: "system",
          message: "Something went wrong during bulk delete. Please try again.",
        }, { status: 500 });
      }
      return Response.json({
        type: "assistant",
        message: buildBulkDeletedReply(deleted, primaryTarget.label),
        deleted_count: deleted,
      });
    }

    // ── Find matches across all detected targets ──────────────────────────────
    // When the user gave an explicit table keyword (e.g. "delete my note about
    // pepper") we stop at the first table that returns results.
    // When NO table keyword was given (e.g. "delete pepper") we search ALL
    // tables so we don't silently delete the wrong thing.
    const hasExplicitTable = /\b(note|notes|price|prices|contact|contacts|image|images|photo|document|documents|file|files)\b/i.test(cleanMessage);
    let matches: MatchedRecord[] = [];

    // Guard: refuse to delete if subject is empty — would wipe random recent items
    if (!subject) {
      return Response.json({
        type: "assistant",
        message: "What would you like to delete? Please be more specific.\n\nExamples:\n_Delete pepper price_\n_Delete John contact_\n_Delete all my notes_",
      });
    }

    for (const target of targets) {
      let found: MatchedRecord[] = [];

      if (target.table === "notes") {
        found = await findMatchingNotes(userId, subject);
      } else if (target.table === "product_prices") {
        found = await findMatchingPrices(userId, subject);
      } else if (target.table === "images" || target.table === "documents") {
        found = await findMatchingFiles(userId, subject, target.table);
      }

      matches = [...matches, ...found];

      // If user was explicit about the table, stop at the first table with results.
      // If no table was specified, keep searching all tables so nothing is missed.
      if (hasExplicitTable && matches.length > 0) break;
    }

    // ── Nothing found ─────────────────────────────────────────────────────────
    if (matches.length === 0) {
      return Response.json({
        type: "assistant",
        message: buildNotFoundReply(subject, primaryTarget.label),
      });
    }

    // ── Exact single match → delete immediately ───────────────────────────────
    if (matches.length === 1) {
      const record = matches[0];
      const { success, error } = await deleteRecord(userId, record);

      if (!success) {
        return Response.json({
          type: "system",
          message: `Failed to delete "${record.label}". Please try again.`,
        }, { status: 500 });
      }

      return Response.json({
        type: "assistant",
        message: buildDeletedReply(record),
        deleted_id: record.id,
        deleted_table: record.table,
      });
    }

    // ── Multiple matches → ask user to confirm which one ──────────────────────
    return Response.json({
      type: "assistant",
      message: buildAmbiguousReply(matches, primaryTarget.label),
      matches: matches.slice(0, 5).map((m) => ({ id: m.id, label: m.label, table: m.table })),
      awaiting_confirmation: true,
    });
  } catch (error) {
    console.error("[Delete Handler] Unexpected error:", error);
    return Response.json(
      { type: "system", message: "Server error. Please try again." },
      { status: 500 }
    );
  }
}