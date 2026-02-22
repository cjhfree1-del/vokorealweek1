import { Anime, ScoreBreakdown, UserTasteState, getEraBucket } from "./types";

function topMatches(values: string[], weights: Record<string, number>, limit: number): string[] {
  return [...values]
    .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0) || a.localeCompare(b))
    .slice(0, limit)
    .filter((item) => (weights[item] ?? 0) > 0);
}

function eraLabel(era: ReturnType<typeof getEraBucket>): string {
  if (era === "pre2000") return "2000년 이전";
  if (era === "2000_2010") return "2000~2010년대";
  return "2010년대 이후";
}

export function generateWhyKorean(
  anime: Anime,
  state: UserTasteState,
  breakdown?: ScoreBreakdown,
): string {
  const topGenres = topMatches(anime.genres, state.genreWeights, 2);
  const topTags = topMatches(anime.tags, state.tagWeights, 2);

  const parts: string[] = [];
  if (topGenres.length) {
    parts.push(`선호 장르: ${topGenres.join(", ")}`);
  }
  if (topTags.length) {
    parts.push(`잘 맞는 태그: ${topTags.join(", ")}`);
  }

  const era = getEraBucket(anime.year);
  const eraContribution = (breakdown?.eraScore ?? 0) * 0.1 + (breakdown?.eraPriorPenalty ?? 0);
  if (eraContribution >= 0.02 || (!parts.length && state.eraWeights[era] > 0)) {
    parts.push(`${eraLabel(era)} 작품 성향을 반영했어요`);
  }

  if (!parts.length) {
    return "입력한 취향 벡터와 전체 점수를 기준으로 균형 있게 추천했어요";
  }
  return parts.join(" / ");
}
