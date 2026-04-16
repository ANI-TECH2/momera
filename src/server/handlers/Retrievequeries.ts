

// ─── RETRIEVE DB QUERIES ──────────────────────────────────────
// All Supabase queries live here. No business logic — just data.
 
import { serverSupabase } from "@/server/supabase";
import {
  NoteRow,
  ScoredNote,
  FileRow,
  ProductPriceRow,
  escapeLike,
  normalizeSimpleText,
  splitKeywords,
  buildFtsQuery,
} from "@/server/handlers/Retrievehelpers";
import { fuzzyRank, safeText, detectPotentialSpellingMistake } from "@/server/handlers/fuzzySearch";
 
// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
 
const RESULT_LIMIT = 50; // final max results returned per section
const RECENT_LIMIT = 10;
const CANDIDATE_POOL_LIMIT = 500; // local pool used for ranking/fuzzy filtering
 
// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────
 
function sortByCreatedAtDesc<T extends { created_at?: string | null }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
}
 
function sortByScoreThenDate(rows: ScoredNote[]): ScoredNote[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (
      new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    );
  });
}
 
function dedupeById<T extends { id?: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
 
  for (const row of rows) {
    const id = String(row.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
 
  return out;
}
 
function clampResults<T>(rows: T[], limit = RESULT_LIMIT): T[] {
  return rows.slice(0, limit);
}
 
// ─── Helper: build a combined haystack string from a note ─────
 
function noteHaystack(note: NoteRow): string {
  return normalizeSimpleText(
    [
      safeText(note.title),
      safeText(note.content),
      safeText(note.category),
      safeText((note as NoteRow & { normalized_content?: string }).normalized_content),
    ].join(" ")
  );
}
 
// ─── NOTES ────────────────────────────────────────────────────
 
export async function searchNotes(
  userId: string,
  keyword: string,
  phoneVariants: string[]
): Promise<NoteRow[]> {
  const scoreMap = new Map<string, ScoredNote>();
 
  const addResults = (notes: NoteRow[] | null, score: number) => {
    if (!notes?.length) return;
 
    for (const note of notes) {
      const id = String(note.id ?? "");
      if (!id) continue;
 
      const existing = scoreMap.get(id);
      if (!existing || score > existing.score) {
        scoreMap.set(id, { ...note, score });
      }
    }
  };
 
  const trimmedKeyword = (keyword ?? "").trim();
  const normalizedKeyword = normalizeSimpleText(trimmedKeyword.toLowerCase());
 
  // Determine if this is a multi-word query
  const words = splitKeywords(trimmedKeyword).filter((w) => w.length >= 2);
  const isMultiWord = words.length > 1;
 
  // Pass 1 — phone variants
  if (phoneVariants.length) {
    const phoneQuery = phoneVariants
      .filter(Boolean)
      .flatMap((p) => {
        const safe = escapeLike(p);
        return [`content.ilike.%${safe}%`, `title.ilike.%${safe}%`];
      })
      .join(",");
 
    if (phoneQuery) {
      const { data, error } = await serverSupabase
        .from("notes")
        .select("*")
        .eq("user_id", userId)
        .or(phoneQuery)
        .order("created_at", { ascending: false })
        .limit(RESULT_LIMIT);
 
      if (error) {
        console.error("[NoteSearch] Phone pass error:", error);
      } else {
        addResults((data ?? []) as NoteRow[], 5);
      }
    }
  }
 
  // Empty keyword -> return recent notes
  if (!trimmedKeyword) {
    const { data, error } = await serverSupabase
      .from("notes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(RESULT_LIMIT);
 
    if (error) {
      console.error("[NoteSearch] Empty keyword fetch error:", error);
      return sortByScoreThenDate(Array.from(scoreMap.values())).slice(0, RESULT_LIMIT);
    }
 
    addResults((data ?? []) as NoteRow[], 0.25);
    return clampResults(sortByScoreThenDate(Array.from(scoreMap.values()))).map(
      ({ score, ...note }) => note as NoteRow
    );
  }
 
  // Candidate pool for local ranking (fetched once, reused in all local passes)
  const { data: strictPool, error: strictPoolError } = await serverSupabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_POOL_LIMIT);
 
  const strictPoolRows = (strictPool ?? []) as NoteRow[];
 
  if (strictPoolError) {
    console.error("[NoteSearch] Strict pool error:", strictPoolError);
  } else {
    // Pass 2 — strict exact normalized match (whole field equals query)
    const strictRows = strictPoolRows.filter((note) => {
      const fields = [
        safeText(note.title),
        safeText(note.content),
        safeText(note.category),
        safeText((note as NoteRow & { normalized_content?: string }).normalized_content),
      ];
 
      return fields.some((field) => normalizeSimpleText(field) === normalizedKeyword);
    });
 
    if (strictRows.length > 0) {
      addResults(strictRows, 4.5);
    }
  }
 
  // Pass 3 — exact phrase ilike on content/title/category
  // For multi-word queries this already requires the full phrase (e.g. "car pin"),
  // so it won't match notes that only contain "pin".
  {
    const safeKeyword = escapeLike(trimmedKeyword);
    const { data: exactData, error: exactError } = await serverSupabase
      .from("notes")
      .select("*")
      .eq("user_id", userId)
      .or(
        `content.ilike.%${safeKeyword}%,title.ilike.%${safeKeyword}%,category.ilike.%${safeKeyword}%`
      )
      .order("created_at", { ascending: false })
      .limit(RESULT_LIMIT);
 
    if (exactError) {
      console.error("[NoteSearch] Exact pass error:", exactError);
    } else {
      addResults((exactData ?? []) as NoteRow[], 4);
    }
  }
 
  // Pass 4 — full-text search
  {
    const ftsQuery = buildFtsQuery(trimmedKeyword);
    if (ftsQuery) {
      const { data: ftsData, error: ftsError } = await serverSupabase
        .from("notes")
        .select("*")
        .eq("user_id", userId)
        .textSearch("fts", ftsQuery, { type: "websearch", config: "english" })
        .order("created_at", { ascending: false })
        .limit(RESULT_LIMIT);
 
      if (ftsError) {
        console.warn("[NoteSearch] FTS pass error:", ftsError.message);
      } else {
        // FTS for multi-word queries: filter locally to ensure ALL words are present.
        // Postgres websearch FTS can return partial matches; we tighten it here.
        const ftsRows = (ftsData ?? []) as NoteRow[];
        const filtered = isMultiWord
          ? ftsRows.filter((note) => {
              const haystack = noteHaystack(note);
              return words.every((w) => haystack.includes(normalizeSimpleText(w)));
            })
          : ftsRows;
 
        addResults(filtered, 3);
      }
    }
  }
 
  // Pass 5 — normalized_content ilike
  // For multi-word queries we skip the DB call and use the local pool instead,
  // requiring ALL words to be present so that a search for "car pin" never
  // returns notes that only contain "pin".
  {
    if (isMultiWord) {
      // Local all-words filter against the already-fetched candidate pool
      const allWordMatches = strictPoolRows.filter((note) => {
        const haystack = noteHaystack(note);
        return words.every((w) => haystack.includes(normalizeSimpleText(w)));
      });
      addResults(allWordMatches, 2);
    } else {
      // Single-word: DB ilike is fine
      const { data: normData, error: normError } = await serverSupabase
        .from("notes")
        .select("*")
        .eq("user_id", userId)
        .ilike("normalized_content", `%${escapeLike(normalizedKeyword)}%`)
        .order("created_at", { ascending: false })
        .limit(RESULT_LIMIT);
 
      if (normError) {
        console.error("[NoteSearch] Normalized pass error:", normError);
      } else {
        addResults((normData ?? []) as NoteRow[], 2);
      }
    }
  }
 
  // Pass 6 — word hits (ALL words must match, not any)
  // FIX: Previously used .or() which matched notes containing ANY single word.
  // Now we filter the local candidate pool requiring every word to be present,
  // so "car pin" no longer pulls in "door pin", "key pin", etc.
  {
    if (words.length > 0) {
      const allWordMatches = strictPoolRows.filter((note) => {
        const haystack = noteHaystack(note);
        return words.every((w) => haystack.includes(normalizeSimpleText(w)));
      });
 
      addResults(allWordMatches, 1);
    }
  }
 
  // Pass 7 — fuzzy search (now more aggressive)
  {
    const current = sortByScoreThenDate(Array.from(scoreMap.values()));
    const hasStrongMatches = current.some((row) => row.score >= 3); // Only very strong matches prevent fuzzy
    const hasAnyMatches = current.length > 0;

    // Use fuzzy search if:
    // 1. No matches at all, OR
    // 2. Only weak matches (score < 3), OR
    // 3. We have room for more results
    if (!hasStrongMatches && strictPoolRows.length > 0 && scoreMap.size < RESULT_LIMIT * 2) {
      const ranked = fuzzyRank<NoteRow>(
        trimmedKeyword,
        strictPoolRows,
        (note) => [
          safeText(note.title),
          safeText(note.content),
          safeText(note.category),
          safeText((note as NoteRow & { normalized_content?: string }).normalized_content),
        ],
        0.65, // Lower threshold for better matching
        RESULT_LIMIT,
        false // Allow fuzzy results even with exact matches
      );

      for (const entry of ranked) {
        // Give fuzzy matches a base score but preserve ranking
        const fuzzyScore = 0.3 + (entry.score * 0.7); // 0.3-1.0 range
        addResults([entry.item], fuzzyScore);
      }
    }
  }
 
  return clampResults(
    sortByScoreThenDate(Array.from(scoreMap.values()))
  ).map(({ score, ...note }) => note as NoteRow);
}
 
export async function fetchRecentNotes(userId: string): Promise<NoteRow[]> {
  const { data, error } = await serverSupabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);
 
  if (error) {
    console.error("[NoteSearch] Recent notes error:", error);
    return [];
  }
 
  return (data ?? []) as NoteRow[];
}
 
// ─── PRICES ───────────────────────────────────────────────────
 
const PRICE_SELECT =
  "id, product_name, price, currency, category, description, normalized_content, created_at";
 
export async function searchProductPrices(
  userId: string,
  keyword: string
): Promise<ProductPriceRow[]> {
  const cleanKw = normalizeSimpleText(keyword);
 
  if (!cleanKw) {
    const { data, error } = await serverSupabase
      .from("product_prices")
      .select(PRICE_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(RESULT_LIMIT);
 
    if (error) {
      console.error("[PriceSearch] recent fetch error:", error);
      return [];
    }
 
    return (data ?? []) as ProductPriceRow[];
  }
 
  const { data: recentRows, error: recentError } = await serverSupabase
    .from("product_prices")
    .select(PRICE_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_POOL_LIMIT);
 
  if (recentError) {
    console.error("[PriceSearch] recent fetch error:", recentError);
    return [];
  }
 
  const rows = (recentRows ?? []) as ProductPriceRow[];
  const resultMap = new Map<string, ProductPriceRow>();
 
  const addRows = (items: ProductPriceRow[]) => {
    for (const row of items) {
      if (!row?.id) continue;
      if (!resultMap.has(row.id)) resultMap.set(row.id, row);
    }
  };
 
  // Tier 1 — exact product name
  addRows(rows.filter((r) => normalizeSimpleText(r.product_name) === cleanKw));
 
  // Tier 2 — exact in category/description/normalized_content
  addRows(
    rows.filter((r) => {
      const fields = [
        safeText(r.product_name),
        safeText(r.category),
        safeText((r as ProductPriceRow & { description?: string }).description),
        safeText((r as ProductPriceRow & { normalized_content?: string }).normalized_content),
      ];
 
      return fields.some((field) => normalizeSimpleText(field) === cleanKw);
    })
  );
 
  // Tier 3 — starts with
  addRows(
    rows.filter((r) => normalizeSimpleText(r.product_name).startsWith(cleanKw))
  );
 
  // Tier 4 — contains full string
  addRows(
    rows.filter((r) => normalizeSimpleText(r.product_name).includes(cleanKw))
  );
 
  // Tier 5 — all words must match
  {
    const words = splitKeywords(cleanKw).filter((w) => w.length >= 2);
    if (words.length > 0) {
      addRows(
        rows.filter((r) => {
          const haystack = normalizeSimpleText(
            [
              r.product_name,
              r.category,
              (r as ProductPriceRow & { description?: string }).description,
              (r as ProductPriceRow & { normalized_content?: string }).normalized_content,
            ]
              .filter(Boolean)
              .join(" ")
          );
 
          return words.every((w) => haystack.includes(w));
        })
      );
    }
  }
 
  // Tier 6 — fuzzy search (more aggressive)
  {
    const currentSize = resultMap.size;
    const needsMore = currentSize < RESULT_LIMIT;

    // Always try fuzzy search if we need more results or if this might be a spelling mistake
    if ((needsMore || detectPotentialSpellingMistake(cleanKw)) && rows.length > 0) {
      const fuzzy = fuzzyRank<ProductPriceRow>(
        cleanKw,
        rows,
        (row) => [
          safeText(row.product_name),
          safeText(row.category),
          safeText((row as ProductPriceRow & { description?: string }).description),
          safeText(
            (row as ProductPriceRow & { normalized_content?: string }).normalized_content
          ),
        ],
        0.65, // Lower threshold
        RESULT_LIMIT,
        false // Allow fuzzy even with exact matches
      );

      addRows(fuzzy.map((entry) => entry.item));
    }
  }
 
  // Tier 7 — DB fallback across more than product_name
  if (resultMap.size < RESULT_LIMIT) {
    const safeKw = escapeLike(cleanKw);
    const { data: fallback, error: fallbackError } = await serverSupabase
      .from("product_prices")
      .select(PRICE_SELECT)
      .eq("user_id", userId)
      .or(
        `product_name.ilike.%${safeKw}%,category.ilike.%${safeKw}%,description.ilike.%${safeKw}%,normalized_content.ilike.%${safeKw}%`
      )
      .order("created_at", { ascending: false })
      .limit(RESULT_LIMIT);
 
    if (fallbackError) {
      console.error("[PriceSearch] fallback error:", fallbackError);
    } else {
      addRows((fallback ?? []) as ProductPriceRow[]);
    }
  }
 
  return clampResults(sortByCreatedAtDesc(Array.from(resultMap.values())));
}
 
export async function fetchRecentPrices(
  userId: string
): Promise<ProductPriceRow[]> {
  const { data, error } = await serverSupabase
    .from("product_prices")
    .select("id, product_name, price, currency, category, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);
 
  if (error) {
    console.error("[PriceSearch] Recent prices error:", error);
    return [];
  }
 
  return (data ?? []) as ProductPriceRow[];
}
 
// ─── FILES ────────────────────────────────────────────────────
 
export async function searchImages(
  userId: string,
  keyword: string
): Promise<FileRow[]> {
  const trimmedKeyword = (keyword ?? "").trim();
 
  if (!trimmedKeyword || trimmedKeyword.length < 2) {
    const { data, error } = await serverSupabase
      .from("images")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(RESULT_LIMIT);
 
    if (error) {
      console.error("[FileSearch] Images error:", error);
      return [];
    }
 
    return (data ?? []) as FileRow[];
  }
 
  const normalizedKeyword = normalizeSimpleText(trimmedKeyword);
  const words = splitKeywords(trimmedKeyword).filter((w) => w.length >= 2);
  const isMultiWord = words.length > 1;
 
  const { data: strictPool, error: strictPoolError } = await serverSupabase
    .from("images")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_POOL_LIMIT);
 
  if (strictPoolError) {
    console.error("[FileSearch] Images strict pool error:", strictPoolError);
    return [];
  }
 
  const pool = (strictPool ?? []) as FileRow[];
  const resultMap = new Map<string, FileRow>();
 
  const addRows = (items: FileRow[]) => {
    for (const row of items) {
      if (!row?.id) continue;
      if (!resultMap.has(row.id)) resultMap.set(row.id, row);
    }
  };
 
  // Exact normalized match
  addRows(
    pool.filter((row) => {
      const fields = [
        safeText(row.file_name),
        safeText(row.description),
        safeText((row as FileRow & { file_type?: string }).file_type),
      ];
 
      return fields.some((field) => normalizeSimpleText(field) === normalizedKeyword);
    })
  );
 
  if (isMultiWord) {
    // Multi-word: require ALL words in local pool (avoid DB OR which matches any word)
    addRows(
      pool.filter((row) => {
        const haystack = normalizeSimpleText(
          [
            safeText(row.file_name),
            safeText(row.description),
            safeText((row as FileRow & { file_type?: string }).file_type),
          ].join(" ")
        );
        return words.every((w) => haystack.includes(normalizeSimpleText(w)));
      })
    );
  } else {
    // Single-word: DB ilike is fine
    const safe = escapeLike(trimmedKeyword);
    const { data, error } = await serverSupabase
      .from("images")
      .select("*")
      .eq("user_id", userId)
      .or(
        `description.ilike.%${safe}%,file_name.ilike.%${safe}%,file_type.ilike.%${safe}%`
      )
      .order("created_at", { ascending: false })
      .limit(RESULT_LIMIT);
 
    if (error) {
      console.error("[FileSearch] Images error:", error);
    } else {
      addRows((data ?? []) as FileRow[]);
    }
  }
 
  if (resultMap.size < RESULT_LIMIT * 2) { // More aggressive - allow up to 2x limit
    const fuzzy = fuzzyRank<FileRow>(
      trimmedKeyword,
      pool,
      (row) => [
        safeText(row.file_name),
        safeText(row.description),
        safeText((row as FileRow & { file_type?: string }).file_type),
      ],
      0.65, // Lower threshold
      RESULT_LIMIT,
      false // Allow fuzzy even with exact matches
    );

    addRows(fuzzy.map((entry) => entry.item));
  }

  return clampResults(sortByCreatedAtDesc(Array.from(resultMap.values())));
}

export async function searchDocuments(
  userId: string,
  keyword: string
): Promise<FileRow[]> {
  const trimmedKeyword = (keyword ?? "").trim();
 
  if (!trimmedKeyword || trimmedKeyword.length < 2) {
    const { data, error } = await serverSupabase
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(RESULT_LIMIT);
 
    if (error) {
      console.error("[FileSearch] Documents error:", error);
      return [];
    }
 
    return (data ?? []) as FileRow[];
  }
 
  const normalizedKeyword = normalizeSimpleText(trimmedKeyword);
  const words = splitKeywords(trimmedKeyword).filter((w) => w.length >= 2);
  const isMultiWord = words.length > 1;
 
  const { data: strictPool, error: strictPoolError } = await serverSupabase
    .from("documents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_POOL_LIMIT);
 
  if (strictPoolError) {
    console.error("[FileSearch] Documents strict pool error:", strictPoolError);
    return [];
  }
 
  const pool = (strictPool ?? []) as FileRow[];
  const resultMap = new Map<string, FileRow>();
 
  const addRows = (items: FileRow[]) => {
    for (const row of items) {
      if (!row?.id) continue;
      if (!resultMap.has(row.id)) resultMap.set(row.id, row);
    }
  };
 
  // Exact normalized match
  addRows(
    pool.filter((row) => {
      const fields = [
        safeText(row.file_name),
        safeText(row.description),
        safeText((row as FileRow & { file_type?: string }).file_type),
      ];
 
      return fields.some((field) => normalizeSimpleText(field) === normalizedKeyword);
    })
  );
 
  if (isMultiWord) {
    // Multi-word: require ALL words in local pool
    addRows(
      pool.filter((row) => {
        const haystack = normalizeSimpleText(
          [
            safeText(row.file_name),
            safeText(row.description),
            safeText((row as FileRow & { file_type?: string }).file_type),
          ].join(" ")
        );
        return words.every((w) => haystack.includes(normalizeSimpleText(w)));
      })
    );
  } else {
    // Single-word: DB ilike is fine
    const safe = escapeLike(trimmedKeyword);
    const { data, error } = await serverSupabase
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .or(
        `description.ilike.%${safe}%,file_name.ilike.%${safe}%,file_type.ilike.%${safe}%`
      )
      .order("created_at", { ascending: false })
      .limit(RESULT_LIMIT);
 
    if (error) {
      console.error("[FileSearch] Documents error:", error);
    } else {
      addRows((data ?? []) as FileRow[]);
    }
  }
 
  if (resultMap.size < RESULT_LIMIT * 2) { // More aggressive - allow up to 2x limit
    const fuzzy = fuzzyRank<FileRow>(
      trimmedKeyword,
      pool,
      (row) => [
        safeText(row.file_name),
        safeText(row.description),
        safeText((row as FileRow & { file_type?: string }).file_type),
      ],
      0.65, // Lower threshold
      RESULT_LIMIT,
      false // Allow fuzzy even with exact matches
    );

    addRows(fuzzy.map((entry) => entry.item));
  }

  return clampResults(sortByCreatedAtDesc(Array.from(resultMap.values())));
}

export async function createSignedUrl(
  bucket: string,
  filePath: string
): Promise<string | null> {
  const { data, error } = await serverSupabase.storage
    .from(bucket)
    .createSignedUrl(filePath, 3600);
 
  if (error) {
    console.error(`[FileSearch] Signed URL error ${bucket}/${filePath}:`, error);
    return null;
  }
 
  return data?.signedUrl ?? null;
}
 
// ─── SEARCH ALL ───────────────────────────────────────────────
 
export interface SearchAllResult {
  notes: NoteRow[];
  prices: ProductPriceRow[];
  images: FileRow[];
  documents: FileRow[];
  hasResults: boolean;
}
 
export async function searchAllData(
  userId: string,
  keyword: string,
  phoneVariants: string[] = []
): Promise<SearchAllResult> {
  const [notes, prices, images, documents] = await Promise.all([
    searchNotes(userId, keyword, phoneVariants),
    searchProductPrices(userId, keyword),
    searchImages(userId, keyword),
    searchDocuments(userId, keyword),
  ]);
 
  const finalNotes = clampResults(dedupeById(notes));
  const finalPrices = clampResults(dedupeById(prices));
  const finalImages = clampResults(dedupeById(images));
  const finalDocuments = clampResults(dedupeById(documents));
 
  const hasResults =
    finalNotes.length > 0 ||
    finalPrices.length > 0 ||
    finalImages.length > 0 ||
    finalDocuments.length > 0;
 
  return {
    notes: finalNotes,
    prices: finalPrices,
    images: finalImages,
    documents: finalDocuments,
    hasResults,
  };
}
 