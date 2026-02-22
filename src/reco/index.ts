import { generateWhyKorean } from "./explain";
import { selectNextBatchMMR } from "./mmrSelect";
import { scoreCandidates } from "./scoring";
import { RecommendParams, RecommendResult } from "./types";

export * from "./types";
export { updateTasteFromFeedback } from "./tasteVector";
export { scoreCandidates, buildFeatureVector, cosineSim, normalize } from "./scoring";
export { selectNextBatchMMR } from "./mmrSelect";
export { generateWhyKorean } from "./explain";

export function recommendNextBatch(params: RecommendParams): RecommendResult {
  const { state, candidatePool, alreadyShownIds, batchSize = 10 } = params;
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const { scored, featuresById } = scoreCandidates({ state, candidatePool });
  const selected = selectNextBatchMMR({
    scored,
    featuresById,
    alreadyShownIds,
    state,
    batchSize: safeBatchSize,
    lambda: 0.75,
  });

  const batch = selected.map((item) => ({
    anime: item.anime,
    score: item.score,
    why: generateWhyKorean(item.anime, state, item.breakdown),
  }));
  const excludedCount = candidatePool.length - selected.length;

  return {
    batch,
    debug: {
      scoredCount: scored.length,
      excludedCount,
      lambda: 0.75,
    },
  };
}
