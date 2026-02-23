import { animeDisplayTitle, buildCandidateTagVector, cosineSimilarity } from "./scoring";
import type {
  AniMediaSort,
  Anime,
  DiscoverPreset,
  FormatBucket,
  MmrDebugRow,
  MmrSelectionResult,
  ScoredFinalCandidate,
  Step2DebugRow,
  Step2SelectionResult,
  YearBucket,
} from "./types";

const ACTION_THEME_TAG_REGEX =
  /(battle|fight|war|military|martial|super power|mecha|assassin|weapon|revenge|survival|monster)/i;
const ROMANCE_THEME_TAG_REGEX =
  /(romance|love|relationship|dating|kiss|marriage|newlyweds|romantic|romcom|shoujo|josei|love triangle)/i;
const HEALING_THEME_TAG_REGEX =
  /(iyashikei|healing|wholesome|daily life|slow life|friendship|family life|cute girls doing cute things|food|cooking|gourmet|slice of life)/i;
const PSYCHOLOGICAL_THEME_TAG_REGEX =
  /(mind game|psychological|manipulation|suspense|mystery|detective|crime|strategy|trauma|existential|philosophy|thriller|gambling)/i;
const INTENSE_THEME_TAG_REGEX = /(gore|slasher|death game|revenge|assassin|war|military|battle royale|survival)/i;

export const STEP2_TARGET_COUNT = 50;
export const STEP2_POOL_MIN = 250;
export const STEP2_POOL_MAX = 400;
export const STEP2_MIN_AVERAGE_SCORE = 65;
export const STEP2_MIN_POPULARITY = 5000;
export const STEP2_RELAXED_MIN_AVERAGE_SCORE = 58;
export const STEP2_RELAXED_MIN_POPULARITY = 1200;
export const STEP2_EXPOSURE_LIMIT = 300;

export const STEP2_YEAR_RATIOS: Record<YearBucket, number> = {
  modern: 0.6,
  mid: 0.3,
  classic: 0.1,
};

export const STEP2_FORMAT_RATIOS: Record<FormatBucket, number> = {
  tv: 0.7,
  other: 0.3,
};

export const STEP2_DISCOVERY_SORTS: AniMediaSort[] = [
  "POPULARITY_DESC",
  "SCORE_DESC",
  "TRENDING_DESC",
];

export const STEP2_TAG_OVERLAP_PENALTY = 0.1;
export const STEP2_EXPOSURE_PENALTY = 0.12;
export const FINAL_MMR_LAMBDA = 0.72;
export const FINAL_MMR_TOP_N = 10;

export const CATEGORY_DISCOVERY_PRESETS: Record<string, DiscoverPreset[]> = {
  action: [
    { id: "action_core", genreIn: ["Action", "Adventure"], tagIn: ["Martial Arts", "Swordplay"] },
    { id: "action_military", genreIn: ["Action", "Adventure"], tagIn: ["Military", "War"] },
    { id: "action_superpower", genreIn: ["Action", "Adventure"], tagIn: ["Super Power", "Shounen"] },
    { id: "action_mecha", genreIn: ["Action", "Sci-Fi"], tagIn: ["Mecha", "Space"] },
    { id: "action_survival", genreIn: ["Action", "Thriller"], tagIn: ["Survival", "Revenge"] },
    { id: "action_sports", genreIn: ["Action", "Sports"], tagIn: ["Competition", "Athletics"] },
  ],
  romance: [
    { id: "romance_school", genreIn: ["Romance", "Drama"], tagIn: ["School", "Coming of Age"] },
    { id: "romance_romcom", genreIn: ["Romance", "Comedy"], tagIn: ["Romantic Comedy", "Love Triangle"] },
    { id: "romance_adult", genreIn: ["Romance", "Drama"], tagIn: ["Adult Cast", "Work"] },
    { id: "romance_shoujo", genreIn: ["Romance", "Drama"], tagIn: ["Shoujo", "Josei"] },
    { id: "romance_fantasy", genreIn: ["Romance", "Fantasy"], tagIn: ["Fantasy", "Isekai"] },
    { id: "romance_music", genreIn: ["Romance", "Music"], tagIn: ["Band", "Music"] },
  ],
  healing: [
    { id: "healing_daily", genreIn: ["Slice of Life", "Comedy"], tagIn: ["Iyashikei", "Wholesome"] },
    { id: "healing_school", genreIn: ["Slice of Life", "Comedy"], tagIn: ["School Club", "Friendship"] },
    { id: "healing_food", genreIn: ["Slice of Life", "Comedy"], tagIn: ["Food", "Cooking"] },
    { id: "healing_family", genreIn: ["Slice of Life", "Drama"], tagIn: ["Family Life", "Childcare"] },
    { id: "healing_work", genreIn: ["Slice of Life", "Comedy"], tagIn: ["Work", "Cafe"] },
    { id: "healing_music", genreIn: ["Slice of Life", "Music"], tagIn: ["Band", "Music"] },
  ],
  psychological: [
    { id: "psy_mindgame", genreIn: ["Psychological", "Thriller"], tagIn: ["Mind Game", "Strategy"] },
    { id: "psy_mystery", genreIn: ["Psychological", "Mystery"], tagIn: ["Detective", "Crime"] },
    { id: "psy_dark", genreIn: ["Psychological", "Drama"], tagIn: ["Trauma", "Depression"] },
    { id: "psy_philosophy", genreIn: ["Psychological", "Drama"], tagIn: ["Philosophy", "Existential"] },
    { id: "psy_gambling", genreIn: ["Psychological", "Thriller"], tagIn: ["Gambling", "Game"] },
    { id: "psy_scifi", genreIn: ["Psychological", "Sci-Fi"], tagIn: ["Time Manipulation", "Conspiracy"] },
  ],
  special: [
    { id: "special_music", genreIn: ["Music", "Slice of Life"], tagIn: ["Band", "Concert"] },
    { id: "special_idol", genreIn: ["Music", "Drama"], tagIn: ["Idol", "Showbiz"] },
    { id: "special_sports", genreIn: ["Sports", "Drama"], tagIn: ["Competition", "Team Sports"] },
    { id: "special_cooking", genreIn: ["Slice of Life", "Comedy"], tagIn: ["Food", "Cooking"] },
    { id: "special_work", genreIn: ["Slice of Life", "Drama"], tagIn: ["Work", "Profession"] },
    { id: "special_hobby", genreIn: ["Slice of Life", "Comedy"], tagIn: ["Hobbies", "Club"] },
  ],
};

export function normalizeTagName(name?: string): string {
  return (name ?? "").trim().toLowerCase();
}

export function normalizeStudioName(name?: string): string {
  return (name ?? "").trim().toLowerCase();
}

function clamp(value: number, min = 0, max = 1): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function toYearBucket(seasonYear?: number): YearBucket {
  if (!seasonYear) return "mid";
  if (seasonYear < 2000) return "classic";
  if (seasonYear < 2010) return "mid";
  return "modern";
}

function toFormatBucket(format?: string): FormatBucket {
  return format === "TV" ? "tv" : "other";
}

function tagWeight(rank?: number): number {
  return Math.max(0.1, Math.min(1, (rank ?? 35) / 100));
}

function getTagWeightMap(media: Anime): Map<string, number> {
  const map = new Map<string, number>();
  [...(media.tags ?? [])]
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, 16)
    .forEach((tag) => {
      const tagName = normalizeTagName(tag.name);
      if (!tagName) return;
      map.set(tagName, tagWeight(tag.rank));
    });
  return map;
}

function getTopTags(media: Anime): string[] {
  return [...(media.tags ?? [])]
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .map((tag) => tag.name?.trim())
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 4);
}

function getStudioNames(media: Anime): string[] {
  return (media.studios?.nodes ?? [])
    .map((node) => node.name?.trim())
    .filter((name): name is string => Boolean(name))
    .slice(0, 3);
}

export function weightedJaccardTags(a: Anime, b: Anime): number {
  const left = getTagWeightMap(a);
  const right = getTagWeightMap(b);
  if (!left.size || !right.size) return 0;

  const keys = new Set([...left.keys(), ...right.keys()]);
  let numerator = 0;
  let denominator = 0;
  for (const key of keys) {
    const l = left.get(key) ?? 0;
    const r = right.get(key) ?? 0;
    numerator += Math.min(l, r);
    denominator += Math.max(l, r);
  }
  if (!denominator) return 0;
  return clamp(numerator / denominator);
}

export function computeQualityScore(media: Anime): number {
  const averageScore = media.averageScore ?? media.meanScore ?? 0;
  const scoreNorm = clamp((averageScore - 50) / 45);
  const popularityNorm = clamp(Math.log10((media.popularity ?? 0) + 1) / 5.4);
  const favouritesNorm = clamp(Math.log10((media.favourites ?? 0) + 1) / 4.8);
  const trendingNorm = clamp(Math.log10(Math.max(0, media.trending ?? 0) + 1) / 5);
  return scoreNorm * 0.52 + popularityNorm * 0.24 + favouritesNorm * 0.16 + trendingNorm * 0.08;
}

function studioOverlapRatio(a: Anime, b: Anime): number {
  const left = new Set(getStudioNames(a).map(normalizeStudioName).filter(Boolean));
  const right = new Set(getStudioNames(b).map(normalizeStudioName).filter(Boolean));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach((studio) => {
    if (right.has(studio)) overlap += 1;
  });
  return overlap / Math.max(left.size, right.size);
}

function formatOverlapPenalty(a: Anime, b: Anime): number {
  if (!a.format || !b.format) return 0;
  return a.format === b.format ? 0.08 : 0;
}

function yearOverlapPenalty(a: Anime, b: Anime): number {
  if (!a.seasonYear || !b.seasonYear) return 0;
  const diff = Math.abs(a.seasonYear - b.seasonYear);
  if (diff <= 1) return 0.08;
  if (diff <= 3) return 0.04;
  return 0;
}

function averageTagOverlapPenalty(candidate: Anime, selectedList: Anime[], tagFreq: Map<string, number>): number {
  if (!selectedList.length) return 0;
  const tags = getTopTags(candidate).map(normalizeTagName).filter(Boolean);
  if (!tags.length) return 0;
  const overlap = tags.reduce((acc, tag) => acc + (tagFreq.get(tag) ?? 0), 0) / tags.length;
  return overlap * STEP2_TAG_OVERLAP_PENALTY;
}

export function computeRedundancyPenalty(candidate: Anime, selectedList: Anime[]): number {
  if (!selectedList.length) return 0;
  let maxPenalty = 0;
  for (const selected of selectedList) {
    const tagSimilarity = weightedJaccardTags(candidate, selected);
    const studioPenalty = studioOverlapRatio(candidate, selected) * 0.16;
    const yearPenalty = yearOverlapPenalty(candidate, selected);
    const formatPenalty = formatOverlapPenalty(candidate, selected);
    const total = tagSimilarity * 0.62 + studioPenalty + yearPenalty + formatPenalty;
    if (total > maxPenalty) maxPenalty = total;
  }
  return clamp(maxPenalty);
}

export function computeDiversityGain(candidate: Anime, selectedList: Anime[]): number {
  if (!selectedList.length) return 0.32;
  const redundancy = computeRedundancyPenalty(candidate, selectedList);
  const studioNames = getStudioNames(candidate).map(normalizeStudioName).filter(Boolean);
  const seenStudios = new Set(
    selectedList.flatMap((media) => getStudioNames(media).map(normalizeStudioName).filter(Boolean)),
  );
  const freshStudioBonus = studioNames.some((studio) => !seenStudios.has(studio)) ? 0.12 : 0;

  const candidateYearBucket = toYearBucket(candidate.seasonYear);
  const sameBucketCount = selectedList.filter((media) => toYearBucket(media.seasonYear) === candidateYearBucket).length;
  const yearNoveltyBonus = 0.1 / (1 + sameBucketCount);
  return clamp((1 - redundancy) * 0.68 + freshStudioBonus + yearNoveltyBonus);
}

function hasGenre(genres: Set<string>, target: string): boolean {
  return genres.has(target.toLowerCase());
}

function hasTag(tags: string[], regex: RegExp): boolean {
  return tags.some((tag) => regex.test(tag));
}

function isSpecialThemeAnime(media: Anime): boolean {
  const genres = new Set((media.genres ?? []).map((genre) => genre.toLowerCase()));
  const tags = (media.tags ?? []).map((tag) => normalizeTagName(tag.name)).filter(Boolean);
  const themeTagRegex =
    /(idol|music|band|singer|concert|showbiz|cooking|food|gourmet|restaurant|cafe|chef|workplace|office|job|profession|career|teacher|doctor|nurse|bartender|maid|sports|basketball|baseball|soccer|volleyball|swimming|athlete)/i;

  const strongThemeTagHits = tags.filter((tag) => themeTagRegex.test(tag)).length;
  const themeGenreHit = genres.has("music") || genres.has("sports");
  const actionGenreHits = Number(genres.has("action")) + Number(genres.has("adventure")) + Number(genres.has("fantasy"));
  const actionTagHits = tags.filter((tag) => ACTION_THEME_TAG_REGEX.test(tag)).length;
  const themeStrength = strongThemeTagHits * 2 + (themeGenreHit ? 2 : 0);
  const actionStrength = actionGenreHits + actionTagHits * 1.6;
  if (themeStrength <= 0) return false;
  if (actionStrength >= 3.4 && themeStrength < actionStrength) return false;
  return true;
}

export function isCategoryAligned(categoryId: string, media: Anime): boolean {
  const genres = new Set((media.genres ?? []).map((genre) => genre.toLowerCase()));
  const tags = (media.tags ?? []).map((tag) => normalizeTagName(tag.name)).filter(Boolean);

  switch (categoryId) {
    case "action":
      return hasGenre(genres, "action") || hasGenre(genres, "adventure") || hasTag(tags, ACTION_THEME_TAG_REGEX);
    case "romance": {
      const romanceCore = hasGenre(genres, "romance") || hasTag(tags, ROMANCE_THEME_TAG_REGEX);
      if (!romanceCore) return false;
      const actionHeavy =
        hasGenre(genres, "action") ||
        hasGenre(genres, "adventure") ||
        hasGenre(genres, "mecha") ||
        hasTag(tags, ACTION_THEME_TAG_REGEX);
      const romanceStrength =
        Number(hasGenre(genres, "romance")) * 2 +
        Number(hasTag(tags, ROMANCE_THEME_TAG_REGEX)) * 2 +
        Number(hasGenre(genres, "comedy")) +
        Number(hasGenre(genres, "drama"));
      return !(actionHeavy && romanceStrength < 4);
    }
    case "healing": {
      const healingCore = hasGenre(genres, "slice of life") || hasTag(tags, HEALING_THEME_TAG_REGEX);
      if (!healingCore) return false;
      const intenseTheme =
        hasGenre(genres, "action") ||
        hasGenre(genres, "adventure") ||
        hasGenre(genres, "horror") ||
        hasGenre(genres, "thriller") ||
        hasTag(tags, ACTION_THEME_TAG_REGEX) ||
        hasTag(tags, INTENSE_THEME_TAG_REGEX);
      const strongHealingSignal =
        hasGenre(genres, "slice of life") || hasTag(tags, /(iyashikei|healing|wholesome|slow life)/i);
      return !(intenseTheme && !strongHealingSignal);
    }
    case "psychological": {
      const psychologicalCore =
        hasGenre(genres, "psychological") ||
        hasGenre(genres, "mystery") ||
        hasGenre(genres, "thriller") ||
        hasTag(tags, PSYCHOLOGICAL_THEME_TAG_REGEX);
      if (!psychologicalCore) return false;
      const pureActionFantasy =
        (hasGenre(genres, "action") || hasGenre(genres, "adventure") || hasGenre(genres, "fantasy")) &&
        !hasGenre(genres, "psychological") &&
        !hasGenre(genres, "mystery") &&
        !hasTag(tags, PSYCHOLOGICAL_THEME_TAG_REGEX);
      return !pureActionFantasy;
    }
    case "special":
      return isSpecialThemeAnime(media);
    default:
      return true;
  }
}

export function filterByCategory(categoryId: string, medias: Anime[]): Anime[] {
  return medias.filter((media) => isCategoryAligned(categoryId, media));
}

export function getCategoryDiscoveryPresets(categoryId: string, fallbackGenres: string[]): DiscoverPreset[] {
  const presets = CATEGORY_DISCOVERY_PRESETS[categoryId];
  if (presets?.length) return presets;
  return [{ id: `${categoryId}_base`, genreIn: fallbackGenres }];
}

function computeQuotaTargets<T extends string>(total: number, ratios: Record<T, number>): Record<T, number> {
  const keys = Object.keys(ratios) as T[];
  const targets = {} as Record<T, number>;
  const remains: Array<{ key: T; frac: number }> = [];
  let assigned = 0;
  keys.forEach((key) => {
    const raw = total * ratios[key];
    const floored = Math.floor(raw);
    targets[key] = floored;
    assigned += floored;
    remains.push({ key, frac: raw - floored });
  });
  remains.sort((a, b) => b.frac - a.frac);
  let cursor = 0;
  while (assigned < total && remains.length) {
    targets[remains[cursor % remains.length].key] += 1;
    assigned += 1;
    cursor += 1;
  }
  return targets;
}

type DiversePickOptions = {
  getFranchiseKey?: (media: Anime) => string;
  exposureHistorySet?: Set<number>;
};

export function selectDiverseSet(
  candidates: Anime[],
  targetCount: number,
  quotasByYearBucket: Record<YearBucket, number>,
  options?: DiversePickOptions,
): Step2SelectionResult {
  const exposureHistorySet = options?.exposureHistorySet ?? new Set<number>();
  const getFranchiseKey = options?.getFranchiseKey;
  const seenIds = new Set<number>();
  const seenFranchises = new Set<string>();
  const selected: Anime[] = [];
  const debugRows: Step2DebugRow[] = [];
  const selectedTagFreq = new Map<string, number>();
  const yearCount: Record<YearBucket, number> = { modern: 0, mid: 0, classic: 0 };
  const formatTargets = computeQuotaTargets(targetCount, STEP2_FORMAT_RATIOS);
  const formatCount: Record<FormatBucket, number> = { tv: 0, other: 0 };

  const sortedBase = [...candidates].sort((a, b) => computeQualityScore(b) - computeQualityScore(a));
  const total = Math.min(targetCount, sortedBase.length);

  function canUse(media: Anime, phase: 1 | 2 | 3): boolean {
    if (seenIds.has(media.id)) return false;
    if (getFranchiseKey) {
      const key = getFranchiseKey(media);
      if (seenFranchises.has(key)) return false;
    }
    const bucket = toYearBucket(media.seasonYear);
    const formatBucket = toFormatBucket(media.format);
    if (phase === 1 && yearCount[bucket] >= quotasByYearBucket[bucket]) return false;
    if (phase <= 2 && formatCount[formatBucket] >= formatTargets[formatBucket] + (phase === 1 ? 0 : 2)) return false;
    return true;
  }

  for (const phase of [1, 2, 3] as const) {
    while (selected.length < total) {
      let picked: Anime | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;
      let bestQuality = 0;
      let bestRedundancy = 0;
      let bestDiversity = 0;
      let bestExposurePenalty = 0;

      for (const candidate of sortedBase) {
        if (!canUse(candidate, phase)) continue;

        const yearBucket = toYearBucket(candidate.seasonYear);
        const formatBucket = toFormatBucket(candidate.format);
        const quality = computeQualityScore(candidate);
        const redundancy = computeRedundancyPenalty(candidate, selected);
        const diversityGain = computeDiversityGain(candidate, selected);
        const exposurePenalty = exposureHistorySet.has(candidate.id) ? STEP2_EXPOSURE_PENALTY : 0;
        const tagPenalty = averageTagOverlapPenalty(candidate, selected, selectedTagFreq);

        const yearNeed =
          Math.max(0, quotasByYearBucket[yearBucket] - yearCount[yearBucket]) /
          Math.max(1, quotasByYearBucket[yearBucket]);
        const formatNeed =
          Math.max(0, formatTargets[formatBucket] - formatCount[formatBucket]) /
          Math.max(1, formatTargets[formatBucket]);

        const finalScore =
          quality * 0.62 +
          diversityGain * 0.28 +
          yearNeed * 0.12 +
          formatNeed * 0.06 -
          redundancy * 0.25 -
          tagPenalty -
          exposurePenalty;

        if (finalScore > bestScore) {
          picked = candidate;
          bestScore = finalScore;
          bestQuality = quality;
          bestRedundancy = redundancy;
          bestDiversity = diversityGain;
          bestExposurePenalty = exposurePenalty;
        }
      }

      if (!picked) break;

      selected.push(picked);
      seenIds.add(picked.id);
      if (getFranchiseKey) seenFranchises.add(getFranchiseKey(picked));
      const yearBucket = toYearBucket(picked.seasonYear);
      const formatBucket = toFormatBucket(picked.format);
      yearCount[yearBucket] += 1;
      formatCount[formatBucket] += 1;
      getTopTags(picked)
        .map(normalizeTagName)
        .filter(Boolean)
        .forEach((tag) => selectedTagFreq.set(tag, (selectedTagFreq.get(tag) ?? 0) + 1));

      debugRows.push({
        animeId: picked.id,
        title: animeDisplayTitle(picked),
        year: picked.seasonYear,
        format: picked.format,
        yearBucket,
        quality: bestQuality,
        redundancyPenalty: bestRedundancy,
        diversityGain: bestDiversity,
        exposurePenalty: bestExposurePenalty,
        score: bestScore,
        topTags: getTopTags(picked),
        studios: getStudioNames(picked),
      });
    }

    if (selected.length >= total) break;
  }

  if (selected.length < total) {
    for (const media of sortedBase) {
      if (selected.length >= total) break;
      if (seenIds.has(media.id)) continue;
      if (getFranchiseKey) {
        const key = getFranchiseKey(media);
        if (seenFranchises.has(key)) continue;
        seenFranchises.add(key);
      }
      selected.push(media);
      seenIds.add(media.id);
    }
  }

  return {
    selected,
    debugRows,
    yearTargets: quotasByYearBucket,
    formatTargets,
    poolSize: candidates.length,
  };
}

export function selectStep2DiverseCandidates(
  candidates: Anime[],
  options: {
    total?: number;
    getFranchiseKey: (media: Anime) => string;
    exposureHistory?: number[];
  },
): Step2SelectionResult {
  const total = options.total ?? STEP2_TARGET_COUNT;
  const yearTargets = computeQuotaTargets(total, STEP2_YEAR_RATIOS);
  return selectDiverseSet(candidates, total, yearTargets, {
    getFranchiseKey: options.getFranchiseKey,
    exposureHistorySet: new Set((options.exposureHistory ?? []).slice(-STEP2_EXPOSURE_LIMIT)),
  });
}

function jaccardGenreSimilarity(left: Anime, right: Anime): number {
  const leftGenres = new Set((left.genres ?? []).map((genre) => genre.toLowerCase()));
  const rightGenres = new Set((right.genres ?? []).map((genre) => genre.toLowerCase()));
  if (!leftGenres.size || !rightGenres.size) return 0;
  let overlap = 0;
  leftGenres.forEach((genre) => {
    if (rightGenres.has(genre)) overlap += 1;
  });
  return overlap / (leftGenres.size + rightGenres.size - overlap);
}

function pairwiseCandidateSimilarity(left: ScoredFinalCandidate, right: ScoredFinalCandidate): number {
  const tagVectorSim = cosineSimilarity(left.tagVector, right.tagVector);
  const genreSim = jaccardGenreSimilarity(left.anime, right.anime);
  const tagJaccard = weightedJaccardTags(left.anime, right.anime);
  return clamp(tagVectorSim * 0.5 + tagJaccard * 0.28 + genreSim * 0.22);
}

export function selectFinalWithMMR(
  candidates: ScoredFinalCandidate[],
  options: {
    getFranchiseKey: (anime: Anime) => string;
    lambda?: number;
    topN?: number;
  },
): MmrSelectionResult {
  const lambda = options.lambda ?? FINAL_MMR_LAMBDA;
  const topN = options.topN ?? FINAL_MMR_TOP_N;
  const pool = [...candidates].sort((a, b) => b.breakdown.total - a.breakdown.total);
  const selected: ScoredFinalCandidate[] = [];
  const debugRows: MmrDebugRow[] = [];
  const selectedFranchises = new Set<string>();

  while (selected.length < topN && pool.length) {
    let bestIndex = -1;
    let bestMMR = Number.NEGATIVE_INFINITY;
    let bestRedundancy = 0;

    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[i];
      const franchise = options.getFranchiseKey(candidate.anime);
      if (selectedFranchises.has(franchise)) continue;

      const redundancy = selected.length
        ? selected.reduce((max, picked) => Math.max(max, pairwiseCandidateSimilarity(candidate, picked)), 0)
        : 0;
      const mmrScore = lambda * candidate.breakdown.total - (1 - lambda) * redundancy;
      if (mmrScore > bestMMR) {
        bestMMR = mmrScore;
        bestIndex = i;
        bestRedundancy = redundancy;
      }
    }

    if (bestIndex < 0) break;
    const [picked] = pool.splice(bestIndex, 1);
    selected.push(picked);
    selectedFranchises.add(options.getFranchiseKey(picked.anime));
    debugRows.push({
      animeId: picked.anime.id,
      title: animeDisplayTitle(picked.anime),
      year: picked.anime.seasonYear,
      format: picked.anime.format,
      base: picked.breakdown.total,
      mmr: bestMMR,
      redundancy: bestRedundancy,
      similarity: picked.breakdown.similarity,
      quality: picked.breakdown.quality,
      novelty: picked.breakdown.novelty,
      profileBonus: picked.breakdown.profileBonus,
      keyTags: picked.dominantTags.slice(0, 4),
    });
  }

  return { selected, debugRows };
}

export function buildCandidateTagVectorForDebug(media: Anime): Map<string, number> {
  return buildCandidateTagVector(media);
}
