import type { Anime, AnimeTag } from "./types";

const TOKEN_PATTERN = /[\p{L}\p{N}]{2,}/gu;
const DESCRIPTION_MAX_CHARS = 900;
const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "your",
  "you",
  "are",
  "was",
  "were",
  "have",
  "has",
  "had",
  "its",
  "their",
  "about",
  "after",
  "before",
  "while",
  "where",
  "when",
  "what",
  "which",
  "will",
  "would",
  "could",
  "should",
  "there",
  "here",
  "then",
  "than",
  "series",
  "anime",
]);

function clamp(value: number, min = 0, max = 1): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanText(value?: string): string {
  if (!value) return "";
  return decodeHtml(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
}

function tokenize(value?: string): string[] {
  const cleaned = cleanText(value);
  if (!cleaned) return [];
  const matches = cleaned.match(TOKEN_PATTERN) ?? [];
  return matches.filter((token) => !STOPWORDS.has(token));
}

function toPhraseToken(value?: string): string | null {
  const cleaned = cleanText(value)
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  if (cleaned.length < 2) return null;
  return cleaned;
}

function addWeight(bag: Map<string, number>, token: string, weight: number): void {
  if (!token || weight <= 0) return;
  bag.set(token, (bag.get(token) ?? 0) + weight);
}

function addPhraseAndTokens(bag: Map<string, number>, text: string | undefined, weight: number): void {
  if (!text) return;
  const phrase = toPhraseToken(text);
  if (phrase) addWeight(bag, phrase, weight * 1.15);
  tokenize(text).forEach((token) => addWeight(bag, token, weight));
}

function tagImportance(tag: AnimeTag): number {
  const rank = tag.rank ?? 70;
  return Math.max(0.4, Math.min(1.8, (130 - rank) / 100));
}

function buildWeightedBag(anime: Anime): Map<string, number> {
  const bag = new Map<string, number>();

  addPhraseAndTokens(bag, anime.title.english, 3.2);
  addPhraseAndTokens(bag, anime.title.romaji, 2.8);
  addPhraseAndTokens(bag, anime.title.native, 2.8);

  (anime.synonyms ?? []).slice(0, 4).forEach((synonym) => {
    addPhraseAndTokens(bag, synonym, 1.2);
  });

  (anime.genres ?? []).forEach((genre) => {
    addPhraseAndTokens(bag, genre, 2.2);
  });

  (anime.tags ?? []).slice(0, 20).forEach((tag) => {
    if (!tag.name?.trim()) return;
    addPhraseAndTokens(bag, tag.name, 1.5 * tagImportance(tag));
  });

  const trimmedDescription = anime.description?.slice(0, DESCRIPTION_MAX_CHARS);
  tokenize(trimmedDescription).forEach((token) => addWeight(bag, token, 1.0));

  return bag;
}

function normalizeTfIdf(
  weightedBag: Map<string, number>,
  idfMap: Map<string, number>,
): Map<string, number> {
  const totalWeight = [...weightedBag.values()].reduce((acc, value) => acc + value, 0);
  if (!totalWeight) return new Map();

  const vector = new Map<string, number>();
  for (const [token, weight] of weightedBag.entries()) {
    const tf = weight / totalWeight;
    const idf = idfMap.get(token) ?? 1;
    vector.set(token, tf * idf);
  }

  const norm = Math.sqrt([...vector.values()].reduce((acc, value) => acc + value * value, 0));
  if (!norm) return new Map();

  const normalized = new Map<string, number>();
  for (const [token, value] of vector.entries()) {
    normalized.set(token, value / norm);
  }
  return normalized;
}

function cosine(left: Map<string, number>, right: Map<string, number>): number {
  if (!left.size || !right.size) return 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let dot = 0;
  for (const [token, value] of small.entries()) {
    dot += value * (large.get(token) ?? 0);
  }
  return clamp(dot);
}

function meanVector(vectors: Array<Map<string, number>>): Map<string, number> {
  if (!vectors.length) return new Map();
  const sum = new Map<string, number>();
  vectors.forEach((vector) => {
    vector.forEach((value, token) => {
      sum.set(token, (sum.get(token) ?? 0) + value);
    });
  });

  const averaged = new Map<string, number>();
  for (const [token, value] of sum.entries()) {
    averaged.set(token, value / vectors.length);
  }

  const norm = Math.sqrt([...averaged.values()].reduce((acc, value) => acc + value * value, 0));
  if (!norm) return new Map();

  const normalized = new Map<string, number>();
  for (const [token, value] of averaged.entries()) {
    normalized.set(token, value / norm);
  }
  return normalized;
}

export function buildSemanticSimilarityMap(
  seeds: Anime[],
  candidates: Anime[],
): Map<number, number> {
  const similarityById = new Map<number, number>();
  if (!seeds.length || !candidates.length) return similarityById;

  const corpus = new Map<number, Anime>();
  [...seeds, ...candidates].forEach((anime) => corpus.set(anime.id, anime));

  const bagById = new Map<number, Map<string, number>>();
  const docFreq = new Map<string, number>();

  corpus.forEach((anime, id) => {
    const bag = buildWeightedBag(anime);
    bagById.set(id, bag);
    const uniqueTokens = new Set(bag.keys());
    uniqueTokens.forEach((token) => docFreq.set(token, (docFreq.get(token) ?? 0) + 1));
  });

  const docCount = Math.max(1, corpus.size);
  const idfMap = new Map<string, number>();
  docFreq.forEach((df, token) => {
    const idf = Math.log((1 + docCount) / (1 + df)) + 1;
    idfMap.set(token, idf);
  });

  const vectorById = new Map<number, Map<string, number>>();
  bagById.forEach((bag, id) => {
    vectorById.set(id, normalizeTfIdf(bag, idfMap));
  });

  const seedVectors = seeds
    .map((seed) => vectorById.get(seed.id))
    .filter((vector): vector is Map<string, number> => Boolean(vector?.size));
  if (!seedVectors.length) return similarityById;

  const centroid = meanVector(seedVectors);

  candidates.forEach((candidate) => {
    const candidateVector = vectorById.get(candidate.id);
    if (!candidateVector?.size) {
      similarityById.set(candidate.id, 0);
      return;
    }
    const centroidSim = cosine(candidateVector, centroid);
    let maxSeedSim = 0;
    seedVectors.forEach((seedVector) => {
      maxSeedSim = Math.max(maxSeedSim, cosine(candidateVector, seedVector));
    });
    similarityById.set(candidate.id, clamp(centroidSim * 0.62 + maxSeedSim * 0.38));
  });

  return similarityById;
}
