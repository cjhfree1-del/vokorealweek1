import { Timestamp } from "firebase-admin/firestore";

export type MatchStatus = "matched" | "partial" | "fallback" | "failed";
export type MatchProvider = "tmdb" | "wikipedia_ko" | "translation_placeholder" | "none";

export type AnimeTitlesInput = {
  english?: string;
  romaji?: string;
  native?: string;
};

export type LocalizeAnimeInput = {
  mal_id: number;
  titles: AnimeTitlesInput;
  year?: number;
  type?: string;
  synopsis?: string;
  genres?: string[];
};

export type LocalizationKoData = {
  title: string;
  synopsis: string;
  genres: string[];
};

export type LocalizationMatchData = {
  status: MatchStatus;
  best_provider: MatchProvider;
  confidence: number;
  evidence: Record<string, unknown>;
};

export type AnimeLocalizationDoc = {
  source: {
    mal_id: number;
    titles: AnimeTitlesInput;
    year?: number;
    type?: string;
  };
  ko: LocalizationKoData;
  match: LocalizationMatchData;
  cache: {
    expires_at: Timestamp;
  };
  updated_at: FirebaseFirestore.FieldValue;
};

export type LocalizeAnimeResponse = {
  title_ko: string;
  synopsis_ko: string;
  confidence: number;
  provider: MatchProvider;
  cached: boolean;
};

export type TmdbSearchResult = {
  id: number;
  media_type?: string;
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
  first_air_date?: string;
  release_date?: string;
  overview?: string;
  popularity?: number;
  vote_average?: number;
  genre_ids?: number[];
};
