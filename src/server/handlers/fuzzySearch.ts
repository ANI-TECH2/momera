import { normalizeSimpleText, splitKeywords } from "@/server/handlers/Retrievehelpers";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type FuzzyCandidate<T> = {
  item: T;
  score: number;
};

type RankedEntry<T> = FuzzyCandidate<T> & {
  exactTextMatch: boolean;
  exactWordMatch: boolean;
};

// ─────────────────────────────────────────────
// Debug
// ─────────────────────────────────────────────

const FUZZY_DEBUG = true;

function fuzzyLog(...args: unknown[]) {
  if (FUZZY_DEBUG) {
    console.log("[Fuzzy]", ...args);
  }
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

export function safeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function normalizeForFuzzy(text: string): string {
  try {
    return normalizeSimpleText(text || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return (text || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

function normalizeTexts(texts: string[]): string[] {
  return texts
    .map((text) => normalizeForFuzzy(safeText(text)))
    .filter(Boolean);
}

function hasExactTextMatch(query: string, texts: string[]): boolean {
  const normalizedQuery = normalizeForFuzzy(query);
  if (!normalizedQuery) return false;

  return normalizeTexts(texts).some((text) => text === normalizedQuery);
}

function hasExactWordMatch(query: string, texts: string[]): boolean {
  const normalizedQuery = normalizeForFuzzy(query);
  if (!normalizedQuery) return false;

  for (const text of normalizeTexts(texts)) {
    const words = splitKeywords(text);
    if (words.includes(normalizedQuery)) return true;
  }

  return false;
}

// ─────────────────────────────────────────────
// Levenshtein
// ─────────────────────────────────────────────

const MAX_FUZZY_LEN = 128;

function levenshtein(a: string, b: string): number {
  const s = normalizeForFuzzy(a);
  const t = normalizeForFuzzy(b);

  if (!s) return t.length;
  if (!t) return s.length;
  if (s === t) return 0;

  if (s.length > MAX_FUZZY_LEN || t.length > MAX_FUZZY_LEN) {
    return Math.max(s.length, t.length);
  }

  const [short, long] = s.length <= t.length ? [s, t] : [t, s];

  let prev = Array.from({ length: short.length + 1 }, (_, i) => i);
  let curr = new Array<number>(short.length + 1);

  for (let j = 1; j <= long.length; j++) {
    curr[0] = j;

    for (let i = 1; i <= short.length; i++) {
      const cost = short[i - 1] === long[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1,
        curr[i - 1] + 1,
        prev[i - 1] + cost
      );
    }

    [prev, curr] = [curr, prev];
  }

  return prev[short.length];
}

// ─────────────────────────────────────────────
// Similarity
// ─────────────────────────────────────────────

const CONTAINMENT_SCORE = 0.97;

function similarityRatio(a: string, b: string): number {
  const s = normalizeForFuzzy(a);
  const t = normalizeForFuzzy(b);

  if (!s || !t) return 0;
  if (s === t) return 1;

  if (s.includes(t) || t.includes(s)) return CONTAINMENT_SCORE;

  const distance = levenshtein(s, t);
  const maxLen = Math.max(s.length, t.length);

  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

// ─────────────────────────────────────────────
// Best similarity
// ─────────────────────────────────────────────

function bestTextSimilarity(query: string, texts: string[]): number {
  const normalizedQuery = normalizeForFuzzy(query);
  if (!normalizedQuery) return 0;

  let best = 0;
  const queryWords = splitKeywords(normalizedQuery);

  for (const rawText of texts) {
    const text = normalizeForFuzzy(rawText);
    if (!text) continue;

    if (text === normalizedQuery) return 1;

    const textWords = splitKeywords(text);
    if (textWords.includes(normalizedQuery)) {
      best = Math.max(best, 0.995);
    }

    if (text.includes(normalizedQuery) || normalizedQuery.includes(text)) {
      best = Math.max(best, CONTAINMENT_SCORE);
    }

    const fullScore = similarityRatio(normalizedQuery, text);
    best = Math.max(best, fullScore);

    for (const qw of queryWords) {
      if (qw.length < 2) continue;

      for (const tw of textWords) {
        if (tw.length < 2) continue;

        const wordScore = similarityRatio(qw, tw);
        const adjustedWordScore = wordScore * 0.98;
        best = Math.max(best, adjustedWordScore);

        if (best >= 1) return 1;
      }
    }
  }

  return best;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export function fuzzyRank<T>(
  query: string,
  items: T[],
  getTexts: (item: T) => string[],
  minScore = 0.72,
  limit = 5,
  exactOnlyIfFound = true
): FuzzyCandidate<T>[] {
  const trimmedQuery = (query ?? "").trim();
  if (!trimmedQuery) {
    fuzzyLog("empty query");
    return [];
  }

  const safeLimit = Math.max(1, Math.floor(limit));
  const safeMinScore = Math.max(0, Math.min(1, minScore));

  fuzzyLog("query:", trimmedQuery);
  fuzzyLog("normalized query:", normalizeForFuzzy(trimmedQuery));
  fuzzyLog("items count:", items.length);
  fuzzyLog("minScore:", safeMinScore, "limit:", safeLimit);

  const ranked: RankedEntry<T>[] = items
    .map((item, index) => {
      const texts = getTexts(item).map((text) => safeText(text));
      const score = bestTextSimilarity(trimmedQuery, texts);
      const exactTextMatch = hasExactTextMatch(trimmedQuery, texts);
      const exactWordMatch = hasExactWordMatch(trimmedQuery, texts);

      if (FUZZY_DEBUG) {
        fuzzyLog(`item ${index + 1}:`, {
          texts,
          score: Number(score.toFixed(4)),
          exactTextMatch,
          exactWordMatch,
        });
      }

      return {
        item,
        score,
        exactTextMatch,
        exactWordMatch,
      };
    })
    .filter((entry) => entry.score >= safeMinScore);

  fuzzyLog("ranked above minScore:", ranked.length);

  if (exactOnlyIfFound) {
    const exactTextMatches = ranked.filter((entry) => entry.exactTextMatch);

    if (exactTextMatches.length > 0) {
      const finalExact = exactTextMatches
        .sort((a, b) => b.score - a.score)
        .slice(0, safeLimit)
        .map(({ item, score }) => ({ item, score }));

      fuzzyLog(
        "exact text matches found:",
        finalExact.map((entry) => Number(entry.score.toFixed(4)))
      );

      return finalExact;
    }
  }

  const finalResults = ranked
    .sort((a, b) => {
      if (a.exactTextMatch !== b.exactTextMatch) {
        return a.exactTextMatch ? -1 : 1;
      }

      if (a.exactWordMatch !== b.exactWordMatch) {
        return a.exactWordMatch ? -1 : 1;
      }

      return b.score - a.score;
    })
    .slice(0, safeLimit)
    .map(({ item, score }) => ({ item, score }));

  fuzzyLog(
    "final results:",
    finalResults.map((entry) => Number(entry.score.toFixed(4)))
  );

  return finalResults;
}