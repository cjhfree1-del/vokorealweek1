export type EraBucket = "pre2000" | "2000_2010" | "2010_now";

export type AnimeFormat = "TV" | "MOVIE" | "OVA" | "ONA" | "SPECIAL" | "UNKNOWN";

export interface Anime {
  id: string;
  title: { kr?: string; en?: string; jp?: string };
  genres: string[];
  tags: string[];
  year: number;
  format?: AnimeFormat;
  score?: number;
  popularity?: number;
}

export interface UserTasteState {
  selectedCategory: string;
  stepIndex: number;
  likedIds: Set<string>;
  dislikedIds: Set<string>;
  genreWeights: Record<string, number>;
  tagWeights: Record<string, number>;
  eraWeights: Record<EraBucket, number>;
  likedEraCounts: Record<EraBucket, number>;
}

export interface RecommendParams {
  state: UserTasteState;
  candidatePool: Anime[];
  alreadyShownIds: Set<string>;
  batchSize?: number;
}

export interface BatchItem {
  anime: Anime;
  score: number;
  why: string;
}

export interface RecommendResult {
  batch: BatchItem[];
  debug: {
    scoredCount: number;
    excludedCount: number;
    lambda: number;
  };
}

export interface ScoreBreakdown {
  genreScore: number;
  tagScore: number;
  eraScore: number;
  qScore: number;
  pScore: number;
  dislikePenalty: number;
  eraPriorPenalty: number;
  finalScore: number;
}

export interface ScoredAnime {
  anime: Anime;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface EraTargetCounts {
  pre2000: number;
  "2000_2010": number;
  "2010_now": number;
}

export const DEFAULT_ERA_WEIGHTS: Record<EraBucket, number> = {
  pre2000: -0.1,
  "2000_2010": 0,
  "2010_now": 0.1,
};

export const BASE_ERA_PRIOR_PENALTIES: Record<EraBucket, number> = {
  pre2000: -0.15,
  "2000_2010": -0.05,
  "2010_now": 0,
};

const CATEGORY_PRESETS: Record<
  string,
  {
    genreWeights: Record<string, number>;
    tagWeights: Record<string, number>;
  }
> = {
  thriller: {
    genreWeights: { Thriller: 1, Mystery: 0.8, Psychological: 0.7, Drama: 0.6 },
    tagWeights: { MindGame: 0.7, Suspense: 0.6, Revenge: 0.4, Detective: 0.5 },
  },
  romance: {
    genreWeights: { Romance: 1, Drama: 0.8, Comedy: 0.6, SliceOfLife: 0.6 },
    tagWeights: { SlowBurn: 0.6, LoveTriangle: 0.4, SchoolLife: 0.5, Healing: 0.4 },
  },
  action: {
    genreWeights: { Action: 1, Adventure: 0.8, Fantasy: 0.7, SciFi: 0.6 },
    tagWeights: { Battle: 0.7, SuperPower: 0.6, Military: 0.5, Tournament: 0.4 },
  },
  fantasy: {
    genreWeights: { Fantasy: 1, Adventure: 0.8, Action: 0.7, Drama: 0.6 },
    tagWeights: { Magic: 0.7, WorldBuilding: 0.6, Isekai: 0.5, Myth: 0.4 },
  },
};

const SUB_THEME_PRESETS: Record<
  string,
  {
    genreWeights?: Record<string, number>;
    tagWeights?: Record<string, number>;
  }
> = {
  dark: {
    genreWeights: { Psychological: 0.6, Thriller: 0.6 },
    tagWeights: { Tragedy: 0.5, Violent: 0.4 },
  },
  healing: {
    genreWeights: { SliceOfLife: 0.6, Drama: 0.4 },
    tagWeights: { Healing: 0.6, Warm: 0.5 },
  },
  classic: {
    genreWeights: { Drama: 0.4 },
    tagWeights: { Retro: 0.5, OldSchool: 0.4 },
  },
};

export function getEraBucket(year: number): EraBucket {
  if (year < 2000) return "pre2000";
  if (year <= 2010) return "2000_2010";
  return "2010_now";
}

export function safeAverage(values: number[]): number {
  if (!values.length) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

export function cloneState(state: UserTasteState): UserTasteState {
  return {
    ...state,
    likedIds: new Set(state.likedIds),
    dislikedIds: new Set(state.dislikedIds),
    genreWeights: { ...state.genreWeights },
    tagWeights: { ...state.tagWeights },
    eraWeights: { ...state.eraWeights },
    likedEraCounts: { ...state.likedEraCounts },
  };
}

export function initTasteState(category: string, subTheme?: string): UserTasteState {
  const normalizedCategory = category.trim().toLowerCase();
  const normalizedSubTheme = subTheme?.trim().toLowerCase();
  const basePreset = CATEGORY_PRESETS[normalizedCategory];
  const subPreset = normalizedSubTheme ? SUB_THEME_PRESETS[normalizedSubTheme] : undefined;

  return {
    selectedCategory: category,
    stepIndex: 1,
    likedIds: new Set<string>(),
    dislikedIds: new Set<string>(),
    genreWeights: { ...(basePreset?.genreWeights ?? {}), ...(subPreset?.genreWeights ?? {}) },
    tagWeights: { ...(basePreset?.tagWeights ?? {}), ...(subPreset?.tagWeights ?? {}) },
    eraWeights: { ...DEFAULT_ERA_WEIGHTS },
    likedEraCounts: { pre2000: 0, "2000_2010": 0, "2010_now": 0 },
  };
}

export function suggestedEraTargetCounts(total: number, state: UserTasteState): EraTargetCounts {
  const safeTotal = Math.max(1, Math.floor(total));
  const base = { pre2000: 0.1, "2000_2010": 0.3, "2010_now": 0.6 } as const;
  const eraBoost = {
    pre2000: state.eraWeights.pre2000 + state.likedEraCounts.pre2000 * 0.15,
    "2000_2010": state.eraWeights["2000_2010"] + state.likedEraCounts["2000_2010"] * 0.12,
    "2010_now": state.eraWeights["2010_now"] + state.likedEraCounts["2010_now"] * 0.1,
  };

  const softmaxInput = {
    pre2000: Math.max(0.02, base.pre2000 + eraBoost.pre2000 * 0.08),
    "2000_2010": Math.max(0.02, base["2000_2010"] + eraBoost["2000_2010"] * 0.08),
    "2010_now": Math.max(0.02, base["2010_now"] + eraBoost["2010_now"] * 0.08),
  };
  const norm = softmaxInput.pre2000 + softmaxInput["2000_2010"] + softmaxInput["2010_now"];

  const pre2000 = Math.floor((softmaxInput.pre2000 / norm) * safeTotal);
  const era2000 = Math.floor((softmaxInput["2000_2010"] / norm) * safeTotal);
  const modern = Math.max(0, safeTotal - pre2000 - era2000);

  return {
    pre2000,
    "2000_2010": era2000,
    "2010_now": modern,
  };
}
