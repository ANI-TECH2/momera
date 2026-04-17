import { normalizeSimpleText, splitKeywords } from "@/server/handlers/Retrievehelpers";

// ─────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────

export type FuzzyCandidate<T> = {
  item: T;
  score: number;
};

type RankedEntry<T> = FuzzyCandidate<T> & {
  exactTextMatch: boolean;
  exactWordMatch: boolean;
};

const FUZZY_DEBUG = true;

const PRICE_QUERY_REGEX =
  /\b(how much|price|cost|how far price|how much is|how much be|rate|sell for|expensive)\b/i;

const PRICE_SIGNAL_REGEX =
  /(\d+|\₦|\$|price|cost|rate|sell)/i;

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function fuzzyLog(...args: unknown[]) {
  if (FUZZY_DEBUG) console.log("[Fuzzy]", ...args);
}

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

// ─────────────────────────────────────────────
// Core Algorithms
// ─────────────────────────────────────────────

function levenshtein(s: string, t: string): number {
  const n = s.length;
  const m = t.length;

  if (n === 0) return m;
  if (m === 0) return n;

  if (Math.abs(n - m) > 10) return Math.max(n, m);

  const matrix: number[][] = [];
  for (let i = 0; i <= n; i++) matrix[i] = [i];
  for (let j = 0; j <= m; j++) matrix[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );

      if (
        i > 1 &&
        j > 1 &&
        s[i - 1] === t[j - 2] &&
        s[i - 2] === t[j - 1]
      ) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost);
      }
    }
  }

  return matrix[n][m];
}

function similarityRatio(s: string, t: string): number {
  if (!s || !t) return 0;
  if (s === t) return 1;

  const distance = levenshtein(s, t);
  const maxLen = Math.max(s.length, t.length);

  let score = 1 - distance / maxLen;

  let prefix = 0;
  for (let i = 0; i < Math.min(s.length, t.length, 4); i++) {
    if (s[i] === t[i]) prefix++;
    else break;
  }

  score = score + prefix * 0.1 * (1 - score);

  return Math.min(1, score);
}

// ─────────────────────────────────────────────
// Similarity Engine
// ─────────────────────────────────────────────

function containmentBoost(query: string, text: string): number {
  const q = normalizeForFuzzy(query);
  const t = normalizeForFuzzy(text);

  if (t.includes(q)) return 0.2;
  if (q.includes(t)) return 0.15;

  return 0;
}

function bestTextSimilarity(query: string, texts: string[]): number {
  const normalizedQuery = normalizeForFuzzy(query);
  if (!normalizedQuery) return 0;

  let best = 0;

  const queryWords = splitKeywords(normalizedQuery);
  const isPriceIntent = PRICE_QUERY_REGEX.test(normalizedQuery);

  for (const rawText of texts) {
    const text = normalizeForFuzzy(rawText);
    if (!text) continue;

    // 1. Exact phrase match
    if (text === normalizedQuery) return 1;

    // 2. Strong containment match
    if (text.includes(normalizedQuery)) {
      const ratio = normalizedQuery.length / Math.max(text.length, 1);
      best = Math.max(best, 0.85 + ratio * 0.14);
    }

    // 3. Similarity
    best = Math.max(best, similarityRatio(normalizedQuery, text));

    // 4. PRICE BOOST (FIXED)
    if (isPriceIntent && PRICE_SIGNAL_REGEX.test(text)) {
      best = Math.min(1, best + 0.18);
    }

    // 5. Containment boost (IMPORTANT)
    best = Math.min(1, best + containmentBoost(normalizedQuery, text));

    // 6. Word-level matching
    const textWords = splitKeywords(text);

    for (const qw of queryWords) {
      if (qw.length < 3) continue;

      for (const tw of textWords) {
        if (tw.length < 3) continue;

        const wordScore = qw === tw ? 1 : similarityRatio(qw, tw) * 0.75;
        best = Math.max(best, wordScore);
      }
    }
  }

  return best;
}

// ─────────────────────────────────────────────
// Ranking Engine
// ─────────────────────────────────────────────

export function detectPotentialSpellingMistake(query: string): boolean {
  const normalized = normalizeForFuzzy(query);
  if (normalized.length < 3) return false;

  const hasRepeatedLetters = /(.)\1{2,}/.test(normalized);

  const hasNoiseWords = normalized
    .split(/\s+/)
    .some(w => w.length === 1 && !["i", "a"].includes(w));

  return hasRepeatedLetters || hasNoiseWords;
}

export function fuzzyRank<T>(
  query: string,
  items: T[],
  getTexts: (item: T) => string[],
  minScore = 0.65,
  limit = 5
): FuzzyCandidate<T>[] {
  const trimmedQuery = (query ?? "").trim();
  if (!trimmedQuery) return [];

  const normalizedQuery = normalizeForFuzzy(trimmedQuery);
  const queryWords = splitKeywords(normalizedQuery);

  const isMistake = detectPotentialSpellingMistake(trimmedQuery);
  const effectiveMinScore = isMistake ? minScore - 0.1 : minScore;

  const ranked: RankedEntry<T>[] = [];

  for (const item of items) {
    const rawTexts = getTexts(item);
    const normalizedTexts = rawTexts.map(t => normalizeForFuzzy(t));

    const score = bestTextSimilarity(trimmedQuery, rawTexts);

    if (score >= effectiveMinScore) {
      const exactTextMatch = normalizedTexts.some(
        t => t === normalizedQuery
      );

      const exactWordMatch = normalizedTexts.some(t => {
        const words = splitKeywords(t);
        return queryWords.some(qw => words.includes(qw));
      });

      ranked.push({
        item,
        score,
        exactTextMatch,
        exactWordMatch
      });
    }
  }

  return ranked
    .sort((a, b) => {
      if (a.exactTextMatch !== b.exactTextMatch)
        return a.exactTextMatch ? -1 : 1;

      if (a.exactWordMatch !== b.exactWordMatch)
        return a.exactWordMatch ? -1 : 1;

      return b.score - a.score;
    })
    .slice(0, limit)
    .map(({ item, score }) => ({ item, score }));
}