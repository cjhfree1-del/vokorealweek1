export type AnimeTag = {
  name?: string;
  rank?: number;
};

export type AnimeStudioNode = {
  name?: string;
};

export type Anime = {
  id: number;
  idMal?: number;
  format?: string;
  episodes?: number;
  duration?: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  synonyms?: string[];
  description?: string;
  coverImage?: {
    large?: string;
    medium?: string;
  };
  genres?: string[];
  tags?: AnimeTag[];
  averageScore?: number;
  meanScore?: number;
  popularity?: number;
  favourites?: number;
  trending?: number;
  seasonYear?: number;
  studios?: {
    nodes?: AnimeStudioNode[];
  };
};

export type Category = {
  id: string;
  label: string;
  genres: string[];
  previewImage: string;
  previewFocus?: string;
};

export type FinalRecommendation = {
  anime: Anime;
  score: number;
  reason: string;
};

export type AniMediaSort = "POPULARITY_DESC" | "SCORE_DESC" | "TRENDING_DESC";

export type DiscoverPreset = {
  id: string;
  genreIn: string[];
  tagIn?: string[];
  perPage?: number;
  minAverageScore?: number;
  minPopularity?: number;
};

export type DiscoveryPayload = {
  Page?: {
    media?: Anime[];
  };
};

export type RecommendationPayload = {
  Media?: {
    recommendations?: {
      nodes?: Array<{
        rating?: number;
        mediaRecommendation?: Anime;
      }>;
    };
  };
};

export type YearBucket = "modern" | "mid" | "classic";
export type FormatBucket = "tv" | "other";

export type SeedPreferenceVector = {
  tagWeights: Map<string, number>;
  tagFrequency: Map<string, number>;
  yearBucketFrequency: Map<YearBucket, number>;
  seedYears: number[];
};

export type FinalScoreBreakdown = {
  similarity: number;
  quality: number;
  novelty: number;
  profileBonus?: number;
  rareTagScore: number;
  yearNoveltyScore: number;
  total: number;
};

export type ScoredFinalCandidate = {
  anime: Anime;
  tagVector: Map<string, number>;
  dominantTags: string[];
  breakdown: FinalScoreBreakdown;
  reason: string;
};

export type Step2DebugRow = {
  animeId: number;
  title: string;
  year?: number;
  format?: string;
  yearBucket: YearBucket;
  quality: number;
  redundancyPenalty: number;
  diversityGain: number;
  exposurePenalty: number;
  score: number;
  topTags: string[];
  studios: string[];
};

export type Step2SelectionResult = {
  selected: Anime[];
  debugRows: Step2DebugRow[];
  yearTargets: Record<YearBucket, number>;
  formatTargets: Record<FormatBucket, number>;
  poolSize: number;
};

export type MmrDebugRow = {
  animeId: number;
  title: string;
  year?: number;
  format?: string;
  base: number;
  mmr: number;
  redundancy: number;
  similarity: number;
  quality: number;
  novelty: number;
  profileBonus?: number;
  keyTags: string[];
};

export type MmrSelectionResult = {
  selected: ScoredFinalCandidate[];
  debugRows: MmrDebugRow[];
};
