import { Anime, EraBucket, ScoredAnime, UserTasteState, getEraBucket } from "./types";
import { SparseVector, cosineSim } from "./scoring";

export interface SelectMMRParams {
  scored: ScoredAnime[];
  featuresById: Record<string, SparseVector>;
  alreadyShownIds: Set<string>;
  state: UserTasteState;
  batchSize: number;
  lambda?: number;
}

interface EraQuota {
  max: Record<EraBucket, number>;
  modernMin: number;
}

function getSoftQuota(batchSize: number, state: UserTasteState): EraQuota {
  const safeBatch = Math.max(1, Math.floor(batchSize));
  const preLikes = state.likedEraCounts.pre2000 ?? 0;
  const preBase = Math.max(1, Math.round(safeBatch * 0.1));
  const preMax = preLikes >= 5 ? Number.POSITIVE_INFINITY : preLikes >= 3 ? preBase + 2 : preLikes >= 1 ? preBase + 1 : preBase;

  return {
    max: {
      pre2000: preMax,
      "2000_2010": Math.max(1, Math.round(safeBatch * 0.3)),
      "2010_now": Number.POSITIVE_INFINITY,
    },
    modernMin: Math.min(safeBatch, Math.ceil(safeBatch * 0.6)),
  };
}

function mmrScore(
  candidate: ScoredAnime,
  selected: ScoredAnime[],
  featuresById: Record<string, SparseVector>,
  lambda: number,
): number {
  if (!selected.length) return candidate.score;
  const candidateVec = featuresById[candidate.anime.id];
  const maxSimToSelected = selected.reduce((max, item) => {
    const sim = cosineSim(candidateVec, featuresById[item.anime.id]);
    return sim > max ? sim : max;
  }, 0);
  return lambda * candidate.score - (1 - lambda) * maxSimToSelected;
}

function canPickEraStrict(
  era: EraBucket,
  counts: Record<EraBucket, number>,
  quota: EraQuota,
  selectedCount: number,
  targetCount: number,
): boolean {
  const nextCount = counts[era] + 1;
  if (nextCount > quota.max[era]) return false;

  const modernCountAfterPick = era === "2010_now" ? counts["2010_now"] + 1 : counts["2010_now"];
  const remainingAfterPick = targetCount - (selectedCount + 1);
  const modernNeededAfterPick = Math.max(0, quota.modernMin - modernCountAfterPick);
  return remainingAfterPick >= modernNeededAfterPick;
}

function tieBreak(a: { mmr: number; item: ScoredAnime }, b: { mmr: number; item: ScoredAnime }): number {
  if (b.mmr !== a.mmr) return b.mmr - a.mmr;
  if (b.item.score !== a.item.score) return b.item.score - a.item.score;
  return a.item.anime.id.localeCompare(b.item.anime.id);
}

export function selectNextBatchMMR(params: SelectMMRParams): ScoredAnime[] {
  const {
    scored,
    featuresById,
    alreadyShownIds,
    state,
    batchSize,
    lambda = 0.75,
  } = params;
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const quota = getSoftQuota(safeBatchSize, state);

  const remaining = scored.filter(
    ({ anime }) => !alreadyShownIds.has(anime.id) && !state.dislikedIds.has(anime.id),
  );

  const selected: ScoredAnime[] = [];
  const counts: Record<EraBucket, number> = { pre2000: 0, "2000_2010": 0, "2010_now": 0 };
  const seen = new Set<string>();

  while (selected.length < safeBatchSize && seen.size < remaining.length) {
    const strictCandidates = remaining.filter((item) => {
      if (seen.has(item.anime.id)) return false;
      const era = getEraBucket(item.anime.year);
      return canPickEraStrict(era, counts, quota, selected.length, safeBatchSize);
    });
    const relaxedCandidates = remaining.filter((item) => !seen.has(item.anime.id));
    const candidates = strictCandidates.length ? strictCandidates : relaxedCandidates;
    if (!candidates.length) break;

    const ranked = candidates
      .map((item) => ({ item, mmr: mmrScore(item, selected, featuresById, lambda) }))
      .sort(tieBreak);
    const picked = ranked[0].item;
    selected.push(picked);
    seen.add(picked.anime.id);
    counts[getEraBucket(picked.anime.year)] += 1;
  }

  return selected;
}

export function hasDiversityByFeature(selected: Anime[]): boolean {
  const seenSignatures = new Set<string>();
  for (const anime of selected) {
    const signature = [...anime.genres].sort().join("|") + "::" + [...anime.tags].sort().join("|");
    seenSignatures.add(signature);
    if (seenSignatures.size > 1) return true;
  }
  return selected.length <= 1;
}
