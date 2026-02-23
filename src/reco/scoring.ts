import type { Anime, AnimeTag, FinalScoreBreakdown, ScoredFinalCandidate, SeedPreferenceVector, YearBucket } from "./types";

const FINAL_WEIGHT_SIMILARITY = 0.65;
const FINAL_WEIGHT_QUALITY = 0.2;
const FINAL_WEIGHT_NOVELTY = 0.15;

function clamp(value: number, min = 0, max = 1): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeTagName(name?: string): string {
  return (name ?? "").trim().toLowerCase();
}

function sortedTags(tags?: AnimeTag[]): AnimeTag[] {
  return [...(tags ?? [])].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
}

export function animeDisplayTitle(anime: Anime): string {
  return anime.title.english ?? anime.title.romaji ?? anime.title.native ?? `#${anime.id}`;
}

export function getScoreValue(anime: Anime): number {
  return anime.averageScore ?? anime.meanScore ?? 0;
}

export function normalizeQualityScore(anime: Anime): number {
  const scoreNorm = clamp((getScoreValue(anime) - 50) / 45);
  const popularityNorm = clamp(Math.log10((anime.popularity ?? 0) + 1) / 5.4);
  const favouritesNorm = clamp(Math.log10((anime.favourites ?? 0) + 1) / 4.8);
  const trendingNorm = clamp(Math.log10(Math.max(0, anime.trending ?? 0) + 1) / 5);
  return scoreNorm * 0.52 + popularityNorm * 0.24 + favouritesNorm * 0.16 + trendingNorm * 0.08;
}

function tagWeight(rank?: number): number {
  return Math.max(0.15, Math.min(1, (rank ?? 35) / 100));
}

export function yearBucketFromSeasonYear(seasonYear?: number): YearBucket {
  if (!seasonYear) return "mid";
  if (seasonYear < 2000) return "classic";
  if (seasonYear < 2010) return "mid";
  return "modern";
}

export function buildSeedPreferenceVector(seeds: Anime[]): SeedPreferenceVector {
  const tagWeights = new Map<string, number>();
  const tagFrequency = new Map<string, number>();
  const yearBucketFrequency = new Map<YearBucket, number>();
  const seedYears = seeds.map((seed) => seed.seasonYear).filter((year): year is number => Number.isFinite(year));
  const divisor = Math.max(1, seeds.length - 1);

  seeds.forEach((seed, index) => {
    const recencyWeight = 1 + (index / divisor) * 0.4;
    for (const tag of sortedTags(seed.tags)) {
      const tagKey = normalizeTagName(tag.name);
      if (!tagKey) continue;
      const weighted = tagWeight(tag.rank) * recencyWeight;
      tagWeights.set(tagKey, (tagWeights.get(tagKey) ?? 0) + weighted);
      tagFrequency.set(tagKey, (tagFrequency.get(tagKey) ?? 0) + 1);
    }
    const bucket = yearBucketFromSeasonYear(seed.seasonYear);
    yearBucketFrequency.set(bucket, (yearBucketFrequency.get(bucket) ?? 0) + 1);
  });

  const maxWeight = Math.max(...tagWeights.values(), 1);
  for (const [name, weight] of tagWeights.entries()) {
    tagWeights.set(name, weight / maxWeight);
  }

  return { tagWeights, tagFrequency, yearBucketFrequency, seedYears };
}

export function buildCandidateTagVector(anime: Anime): Map<string, number> {
  const vector = new Map<string, number>();
  for (const tag of sortedTags(anime.tags).slice(0, 16)) {
    const key = normalizeTagName(tag.name);
    if (!key) continue;
    vector.set(key, tagWeight(tag.rank));
  }
  return vector;
}

export function cosineSimilarity(
  left: Map<string, number>,
  right: Map<string, number>,
): number {
  if (!left.size || !right.size) return 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let dot = 0;
  for (const [name, value] of small.entries()) {
    dot += value * (large.get(name) ?? 0);
  }
  const normLeft = Math.sqrt(Array.from(left.values()).reduce((acc, cur) => acc + cur * cur, 0));
  const normRight = Math.sqrt(Array.from(right.values()).reduce((acc, cur) => acc + cur * cur, 0));
  if (!normLeft || !normRight) return 0;
  return clamp(dot / (normLeft * normRight));
}

function computeNovelty(anime: Anime, preference: SeedPreferenceVector): {
  score: number;
  rareTagScore: number;
  yearNoveltyScore: number;
} {
  const candidateTags = sortedTags(anime.tags)
    .map((tag) => normalizeTagName(tag.name))
    .filter(Boolean)
    .slice(0, 12);

  const rareTagScore = candidateTags.length
    ? candidateTags.reduce((acc, tagName) => {
        const freq = preference.tagFrequency.get(tagName) ?? 0;
        return acc + 1 / (1 + freq);
      }, 0) / candidateTags.length
    : 0.2;

  const yearBucket = yearBucketFromSeasonYear(anime.seasonYear);
  const seenInBucket = preference.yearBucketFrequency.get(yearBucket) ?? 0;
  const yearNoveltyScore = 1 / (1 + seenInBucket);

  const score = clamp(rareTagScore * 0.72 + yearNoveltyScore * 0.28);
  return { score, rareTagScore: clamp(rareTagScore), yearNoveltyScore: clamp(yearNoveltyScore) };
}

export function topPreferenceTags(preference: SeedPreferenceVector, limit = 10): string[] {
  return [...preference.tagWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

export function dominantTagNames(anime: Anime, limit = 4): string[] {
  return sortedTags(anime.tags)
    .map((tag) => tag.name?.trim())
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, limit);
}

export function scoreFinalCandidate(
  anime: Anime,
  preference: SeedPreferenceVector,
): {
  breakdown: FinalScoreBreakdown;
  tagVector: Map<string, number>;
} {
  const candidateVector = buildCandidateTagVector(anime);
  const similarity = cosineSimilarity(preference.tagWeights, candidateVector);
  const quality = normalizeQualityScore(anime);
  const noveltyResult = computeNovelty(anime, preference);
  const total =
    FINAL_WEIGHT_SIMILARITY * similarity +
    FINAL_WEIGHT_QUALITY * quality +
    FINAL_WEIGHT_NOVELTY * noveltyResult.score;

  return {
    tagVector: candidateVector,
    breakdown: {
      similarity: clamp(similarity),
      quality: clamp(quality),
      novelty: clamp(noveltyResult.score),
      rareTagScore: noveltyResult.rareTagScore,
      yearNoveltyScore: noveltyResult.yearNoveltyScore,
      total: clamp(total),
    },
  };
}

export function buildFinalReason(candidate: ScoredFinalCandidate): string {
  const tagText = candidate.dominantTags.slice(0, 2).join(", ");
  const profileBonus = candidate.breakdown.profileBonus ?? 0;
  if (profileBonus >= 0.08 && tagText) {
    return `프로필 선호 태그와 시드 유사도(예: ${tagText})가 모두 높아 우선 추천했습니다.`;
  }
  if (profileBonus <= -0.08 && tagText) {
    return `비선호 태그를 피하면서도 ${tagText} 유사도를 유지한 후보를 선택했습니다.`;
  }
  if (candidate.breakdown.similarity >= 0.62 && tagText) {
    return `선택작과의 태그 유사도(예: ${tagText})가 높아 우선 추천했습니다.`;
  }
  if (candidate.breakdown.novelty >= 0.58 && tagText) {
    return `겹침이 적은 태그(${tagText})와 새로운 분위기를 보강하도록 선택했습니다.`;
  }
  if (candidate.breakdown.quality >= 0.68) {
    return "완성도와 대중성 지표가 높아 안정적인 추천으로 반영했습니다.";
  }
  if (tagText) {
    return `시드 취향과 ${tagText} 태그 결이 맞아 추천했습니다.`;
  }
  return "시드 태그 벡터 유사도와 품질/신선도 점수를 종합해 추천했습니다.";
}
