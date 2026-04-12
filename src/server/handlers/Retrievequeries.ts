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
import { fuzzyRank, safeText } from "@/server/handlers/fuzzySearch";

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

  // Empty keyword -> return recent notes, not just 5
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

  // Candidate pool for local ranking
  const { data: strictPool, error: strictPoolError } = await serverSupabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_POOL_LIMIT);

  const strictPoolRows = ((strictPool ?? []) as NoteRow[]);

  if (strictPoolError) {
    console.error("[NoteSearch] Strict pool error:", strictPoolError);
  } else {
    // Pass 2 — strict exact normalized match
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

  // Pass 3 — exact ilike on content/title/category
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
        addResults((ftsData ?? []) as NoteRow[], 3);
      }
    }
  }

  // Pass 5 — normalized_content ilike
  {
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

  // Pass 6 — individual word hits
  {
    const words = splitKeywords(trimmedKeyword).filter((w) => w.length >= 2);

    if (words.length) {
      const wordQuery = words
        .flatMap((w) => {
          const safe = escapeLike(w);
          return [
            `content.ilike.%${safe}%`,
            `title.ilike.%${safe}%`,
            `category.ilike.%${safe}%`,
          ];
        })
        .join(",");

      if (wordQuery) {
        const { data: wordData, error: wordError } = await serverSupabase
          .from("notes")
          .select("*")
          .eq("user_id", userId)
          .or(wordQuery)
          .order("created_at", { ascending: false })
          .limit(RESULT_LIMIT);

        if (wordError) {
          console.error("[NoteSearch] Word pass error:", wordError);
        } else {
          addResults((wordData ?? []) as NoteRow[], 1);
        }
      }
    }
  }

  // Pass 7 — fuzzy fallback
  {
    const current = sortByScoreThenDate(Array.from(scoreMap.values()));
    const hasGoodNonFuzzy = current.some((row) => row.score >= 2);

    if (!hasGoodNonFuzzy && strictPoolRows.length > 0) {
      const ranked = fuzzyRank<NoteRow>(
        trimmedKeyword,
        strictPoolRows,
        (note) => [
          safeText(note.title),
          safeText(note.content),
          safeText(note.category),
          safeText((note as NoteRow & { normalized_content?: string }).normalized_content),
        ],
        0.74,
        RESULT_LIMIT,
        true
      );

      for (const entry of ranked) {
        addResults([entry.item], 0.5 + entry.score);
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

  // Tier 6 — fuzzy fallback
  if (resultMap.size < RESULT_LIMIT) {
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
      0.76,
      RESULT_LIMIT,
      true
    );

    addRows(fuzzy.map((entry) => entry.item));
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

  if (resultMap.size < RESULT_LIMIT) {
    const fuzzy = fuzzyRank<FileRow>(
      trimmedKeyword,
      pool,
      (row) => [
        safeText(row.file_name),
        safeText(row.description),
        safeText((row as FileRow & { file_type?: string }).file_type),
      ],
      0.73,
      RESULT_LIMIT,
      true
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

  if (resultMap.size < RESULT_LIMIT) {
    const fuzzy = fuzzyRank<FileRow>(
      trimmedKeyword,
      pool,
      (row) => [
        safeText(row.file_name),
        safeText(row.description),
        safeText((row as FileRow & { file_type?: string }).file_type),
      ],
      0.73,
      RESULT_LIMIT,
      true
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