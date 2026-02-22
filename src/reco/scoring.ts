import {
  Anime,
  BASE_ERA_PRIOR_PENALTIES,
  EraBucket,
  ScoredAnime,
  UserTasteState,
  getEraBucket,
  safeAverage,
} from "./types";

export type SparseVector = Record<string, number>;

export interface ScoreCandidatesParams {
  state: UserTasteState;
  candidatePool: Anime[];
}

export interface ScoreCandidatesResult {
  scored: ScoredAnime[];
  featuresById: Record<string, SparseVector>;
}

export function buildFeatureVector(anime: Anime): SparseVector {
  const vector: SparseVector = {};
  for (const genre of anime.genres) {
    vector[`g:${genre}`] = 1;
  }
  for (const tag of anime.tags) {
    vector[`t:${tag}`] = 1.2;
  }
  return vector;
}

export function cosineSim(a: SparseVector, b: SparseVector): number {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (!keysA.length || !keysB.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const key of keysA) {
    const valueA = a[key];
    normA += valueA * valueA;
    const valueB = b[key];
    if (valueB !== undefined) {
      dot += valueA * valueB;
    }
  }
  for (const key of keysB) {
    const valueB = b[key];
    normB += valueB * valueB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function normalize(values: Array<number | undefined | null>): number[] {
  const present = values.filter((value): value is number => typeof value === "number");
  const min = present.length ? Math.min(...present) : 0;
  const max = present.length ? Math.max(...present) : 0;
  const span = max - min;

  return values.map((value) => {
    if (typeof value !== "number") return 0.5;
    if (span === 0) return 0.5;
    return (value - min) / span;
  });
}

function getWeightAverage(targetWeights: Record<string, number>, keys: string[]): number {
  if (!keys.length) return 0;
  return safeAverage(keys.map((key) => targetWeights[key] ?? 0));
}

function getEraLikeCount(state: UserTasteState, era: EraBucket): number {
  return Math.max(0, state.likedEraCounts?.[era] ?? 0);
}

export function computeEraPriorPenalty(state: UserTasteState, year: number): number {
  const era = getEraBucket(year);
  const basePenalty = BASE_ERA_PRIOR_PENALTIES[era];
  const likes = getEraLikeCount(state, era);
  const decay = 1 / (1 + likes * 0.8);
  return basePenalty * decay;
}

export function scoreCandidates(params: ScoreCandidatesParams): ScoreCandidatesResult {
  const { state, candidatePool } = params;
  const featuresById: Record<string, SparseVector> = {};
  for (const anime of candidatePool) {
    featuresById[anime.id] = buildFeatureVector(anime);
  }

  const normalizedScores = normalize(candidatePool.map((anime) => anime.score));
  const normalizedPopularity = normalize(candidatePool.map((anime) => anime.popularity));
  const dislikedVectors = [...state.dislikedIds]
    .map((id) => featuresById[id])
    .filter((vector): vector is SparseVector => Boolean(vector));

  const scored = candidatePool.map((anime, index) => {
    const genreScore = getWeightAverage(state.genreWeights, anime.genres);
    const tagScore = getWeightAverage(state.tagWeights, anime.tags);
    const eraScore = state.eraWeights[getEraBucket(anime.year)] ?? 0;
    const qScore = normalizedScores[index];
    const pScore = normalizedPopularity[index];

    const feature = featuresById[anime.id];
    const maxDislikedSimilarity = dislikedVectors.reduce((max, dislikedVector) => {
      const sim = cosineSim(feature, dislikedVector);
      return sim > max ? sim : max;
    }, 0);
    const dislikePenalty = -0.8 * maxDislikedSimilarity;
    const eraPriorPenalty = computeEraPriorPenalty(state, anime.year);

    const finalScore =
      0.35 * genreScore +
      0.3 * tagScore +
      0.1 * eraScore +
      0.1 * qScore +
      0.05 * pScore +
      dislikePenalty +
      eraPriorPenalty;

    return {
      anime,
      score: finalScore,
      breakdown: {
        genreScore,
        tagScore,
        eraScore,
        qScore,
        pScore,
        dislikePenalty,
        eraPriorPenalty,
        finalScore,
      },
    };
  });

  scored.sort((a, b) => b.score - a.score || a.anime.id.localeCompare(b.anime.id));
  return { scored, featuresById };
}
