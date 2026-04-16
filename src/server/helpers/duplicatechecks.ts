import { serverSupabase } from "../supabase";

// ─── SIMILARITY HELPERS ──────────────────────────────────────────────────────

function collapseForCompare(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function isSimilarName(a: string, b: string): boolean {
  const ca = collapseForCompare(a);
  const cb = collapseForCompare(b);
  if (ca === cb) return true;

  const maxLen = Math.max(ca.length, cb.length);
  if (maxLen === 0) return true;

  // Allow at most ~20% edit distance
  const threshold = Math.max(1, Math.floor(maxLen * 0.2));
  return levenshtein(ca, cb) <= threshold;
}

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type ExistingPrice = {
  id: string;
  product_name: string;
  price: number;
};

export type ExistingNote = {
  id: string;
  title: string;
  content: string;
};

export type PriceDuplicateResult = {
  exact: ExistingPrice | null;
  similar: ExistingPrice | null;
};

export type NoteDuplicateResult = {
  exact: ExistingNote | null;
  similar: ExistingNote | null;
};

// ─── DUPLICATE CHECKS ────────────────────────────────────────────────────────

/**
 * Checks for an existing price record that has the same product name
 * (exact OR fuzzy) regardless of price value, so the user gets a clear
 * "already exists — do you want to update?" prompt.
 *
 * Priority:
 *  1. Exact name + exact price  → hard duplicate
 *  2. Exact name + diff price   → offer to update
 *  3. Fuzzy name match          → possible typo, warn user
 */
export async function findExistingPrice(
  userId: string,
  productName: string,
  price: number
): Promise<PriceDuplicateResult> {
  // 1. Exact name + exact price
  const { data: exactMatch } = await serverSupabase
    .from("product_prices")
    .select("id, product_name, price")
    .eq("user_id", userId)
    .eq("currency", "NGN")
    .ilike("product_name", productName)
    .eq("price", price)
    .maybeSingle();

  if (exactMatch) return { exact: exactMatch, similar: null };

  // 2. Same name, different price
  const { data: sameName } = await serverSupabase
    .from("product_prices")
    .select("id, product_name, price")
    .eq("user_id", userId)
    .eq("currency", "NGN")
    .ilike("product_name", productName)
    .maybeSingle();

  if (sameName) return { exact: null, similar: sameName };

  // 3. Fuzzy name match — compare in-memory against recent 200 records
  const { data: recentPrices } = await serverSupabase
    .from("product_prices")
    .select("id, product_name, price")
    .eq("user_id", userId)
    .eq("currency", "NGN")
    .order("created_at", { ascending: false })
    .limit(200);

  const fuzzy = (recentPrices ?? []).find((row) =>
    isSimilarName(row.product_name, productName)
  );

  return { exact: null, similar: fuzzy ?? null };
}

/**
 * Checks for an existing note that matches by:
 *  1. Exact content hash  → byte-for-byte duplicate
 *  2. Fuzzy title match   → possible duplicate or typo
 */
export async function findExistingNote(
  userId: string,
  contentHash: string,
  title: string
): Promise<NoteDuplicateResult> {
  // 1. Exact hash
  const { data: exactHash } = await serverSupabase
    .from("notes")
    .select("id, title, content")
    .eq("user_id", userId)
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (exactHash) return { exact: exactHash, similar: null };

  // 2. Fuzzy title — compare in-memory against recent 300 notes
  const { data: recentNotes } = await serverSupabase
    .from("notes")
    .select("id, title, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(300);

  const fuzzy = (recentNotes ?? []).find((row) =>
    isSimilarName(row.title ?? "", title)
  );

  return { exact: null, similar: fuzzy ?? null };
}