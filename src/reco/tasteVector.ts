import { Anime, UserTasteState, cloneState, getEraBucket } from "./types";

export type FeedbackSentiment = "like" | "dislike";

const LIKE_DELTAS = { genre: 1.0, tag: 0.7, era: 0.4 } as const;
const DISLIKE_DELTAS = { genre: -0.7, tag: -0.5, era: -0.3 } as const;

function getStepMultiplier(stepIndex: number): number {
  const step = Number.isFinite(stepIndex) ? Math.max(1, Math.floor(stepIndex)) : 1;
  return 1 + (step - 1) * 0.15;
}

function applyWeightDelta(
  target: Record<string, number>,
  keys: string[],
  delta: number,
  multiplier: number,
): void {
  for (const key of keys) {
    target[key] = (target[key] ?? 0) + delta * multiplier;
  }
}

export function updateTasteFromFeedback(
  state: UserTasteState,
  anime: Anime,
  sentiment: FeedbackSentiment,
): UserTasteState {
  const next = cloneState(state);
  const multiplier = getStepMultiplier(state.stepIndex);
  const deltas = sentiment === "like" ? LIKE_DELTAS : DISLIKE_DELTAS;
  const era = getEraBucket(anime.year);

  applyWeightDelta(next.genreWeights, anime.genres, deltas.genre, multiplier);
  applyWeightDelta(next.tagWeights, anime.tags, deltas.tag, multiplier);
  next.eraWeights[era] = (next.eraWeights[era] ?? 0) + deltas.era * multiplier;

  if (sentiment === "like") {
    next.likedIds.add(anime.id);
    next.dislikedIds.delete(anime.id);
    next.likedEraCounts[era] = (next.likedEraCounts[era] ?? 0) + 1;
  } else {
    next.dislikedIds.add(anime.id);
    next.likedIds.delete(anime.id);
  }

  return next;
}
