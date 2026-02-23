import type { Anime } from "./types";

export type FeedbackSignal = "like" | "dislike";

export type UserProfile = {
  likedTags: Record<string, number>;
  dislikedTags: Record<string, number>;
  exposureHistory: number[];
  updatedAt: string;
};

export type ProfileScoreResult = {
  bonus: number;
  penalty: number;
  exposurePenalty: number;
  total: number;
  matchedLikedTags: string[];
  matchedDislikedTags: string[];
};

export const PROFILE_EXPOSURE_LIMIT = 300;
export const PROFILE_DECAY = 0.98;
export const PROFILE_TAG_CAP = 24;
export const PROFILE_VALUE_FLOOR = 0.02;
export const PROFILE_LIKED_BONUS_WEIGHT = 0.18;
export const PROFILE_DISLIKED_PENALTY_WEIGHT = 0.22;
export const PROFILE_EXPOSURE_PENALTY = 0.08;

function clamp(value: number, min = 0, max = 1): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeTagName(name?: string): string {
  return (name ?? "").trim().toLowerCase();
}

function profileNow(): string {
  return new Date().toISOString();
}

function sortedTagPairs(
  map: Record<string, number>,
): Array<[string, number]> {
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function topTagNames(map: Record<string, number>, limit = 6): string[] {
  return sortedTagPairs(map)
    .slice(0, limit)
    .map(([name]) => name);
}

function tagWeight(rank?: number): number {
  return Math.max(0.12, Math.min(1, (rank ?? 35) / 100));
}

function toMediaTagWeightMap(media: Anime): Map<string, number> {
  const map = new Map<string, number>();
  [...(media.tags ?? [])]
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, 18)
    .forEach((tag) => {
      const key = normalizeTagName(tag.name);
      if (!key) return;
      map.set(key, tagWeight(tag.rank));
    });
  return map;
}

function decayTagMap(map: Record<string, number>): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [tag, value] of Object.entries(map)) {
    const decayed = value * PROFILE_DECAY;
    if (decayed >= PROFILE_VALUE_FLOOR) next[tag] = decayed;
  }
  return next;
}

function mergeExposureHistory(base: number[], incoming: number[]): number[] {
  const next = [...base];
  for (const id of incoming) {
    if (!Number.isFinite(id)) continue;
    const found = next.indexOf(id);
    if (found >= 0) next.splice(found, 1);
    next.push(id);
  }
  return next.slice(-PROFILE_EXPOSURE_LIMIT);
}

function ensureProfileShape(raw?: Partial<UserProfile> | null): UserProfile {
  return {
    likedTags: raw?.likedTags ?? {},
    dislikedTags: raw?.dislikedTags ?? {},
    exposureHistory: (raw?.exposureHistory ?? []).filter((id): id is number => Number.isFinite(id)).slice(-PROFILE_EXPOSURE_LIMIT),
    updatedAt: raw?.updatedAt ?? profileNow(),
  };
}

export function createEmptyUserProfile(): UserProfile {
  return {
    likedTags: {},
    dislikedTags: {},
    exposureHistory: [],
    updatedAt: profileNow(),
  };
}

export function normalizeUserProfile(raw?: Partial<UserProfile> | null): UserProfile {
  return ensureProfileShape(raw);
}

export function updateExposureHistory(
  profile: UserProfile,
  shownMediaIds: number[],
): UserProfile {
  const next = ensureProfileShape(profile);
  next.exposureHistory = mergeExposureHistory(next.exposureHistory, shownMediaIds);
  next.updatedAt = profileNow();
  return next;
}

export function updateProfileFromFeedback(
  profile: UserProfile,
  media: Anime,
  signal: FeedbackSignal,
): UserProfile {
  const base = ensureProfileShape(profile);
  const liked = decayTagMap(base.likedTags);
  const disliked = decayTagMap(base.dislikedTags);
  const tagWeights = toMediaTagWeightMap(media);

  for (const [tag, weight] of tagWeights.entries()) {
    if (signal === "like") {
      liked[tag] = Math.min(PROFILE_TAG_CAP, (liked[tag] ?? 0) + weight);
      if (disliked[tag]) disliked[tag] = Math.max(0, disliked[tag] - weight * 0.5);
    } else {
      disliked[tag] = Math.min(PROFILE_TAG_CAP, (disliked[tag] ?? 0) + weight);
      if (liked[tag]) liked[tag] = Math.max(0, liked[tag] - weight * 0.35);
    }
  }

  return {
    likedTags: decayTagMap(liked),
    dislikedTags: decayTagMap(disliked),
    exposureHistory: base.exposureHistory.slice(-PROFILE_EXPOSURE_LIMIT),
    updatedAt: profileNow(),
  };
}

export function scoreWithProfile(
  media: Anime,
  profile: UserProfile,
): ProfileScoreResult {
  const safe = ensureProfileShape(profile);
  const mediaTags = toMediaTagWeightMap(media);
  const totalTagWeight = Math.max(
    1,
    Array.from(mediaTags.values()).reduce((acc, cur) => acc + cur, 0),
  );

  let likedOverlap = 0;
  let dislikedOverlap = 0;
  const matchedLikedTags: string[] = [];
  const matchedDislikedTags: string[] = [];

  for (const [tag, weight] of mediaTags.entries()) {
    const likedWeight = clamp((safe.likedTags[tag] ?? 0) / PROFILE_TAG_CAP);
    const dislikedWeight = clamp((safe.dislikedTags[tag] ?? 0) / PROFILE_TAG_CAP);
    if (likedWeight > 0) matchedLikedTags.push(tag);
    if (dislikedWeight > 0) matchedDislikedTags.push(tag);
    likedOverlap += weight * likedWeight;
    dislikedOverlap += weight * dislikedWeight;
  }

  const likedNorm = clamp(likedOverlap / totalTagWeight);
  const dislikedNorm = clamp(dislikedOverlap / totalTagWeight);
  const bonus = likedNorm * PROFILE_LIKED_BONUS_WEIGHT;
  const penalty = dislikedNorm * PROFILE_DISLIKED_PENALTY_WEIGHT;
  const exposurePenalty = safe.exposureHistory.includes(media.id) ? PROFILE_EXPOSURE_PENALTY : 0;
  const total = bonus - penalty - exposurePenalty;

  return {
    bonus,
    penalty,
    exposurePenalty,
    total,
    matchedLikedTags,
    matchedDislikedTags,
  };
}

export function topLikedTags(profile: UserProfile, limit = 8): string[] {
  return topTagNames(profile.likedTags, limit);
}

export function topDislikedTags(profile: UserProfile, limit = 8): string[] {
  return topTagNames(profile.dislikedTags, limit);
}
