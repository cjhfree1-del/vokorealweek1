import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { buildKoFallbackIndexes, normalizeKoFallbackKey } from "./data/koTitleFallbackRepo";
import { localizeAnimeFromApi } from "./api/localizeAnimeClient";

type Anime = {
  id: number;
  idMal?: number;
  format?: string;
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
  tags?: Array<{ name?: string; rank?: number }>;
  meanScore?: number;
  popularity?: number;
  seasonYear?: number;
};

type Category = {
  id: string;
  label: string;
  genres: string[];
  previewImage: string;
  previewFocus?: string;
};

type SubcategoryRule = {
  id: string;
  match: (anime: Anime) => boolean;
};

type FinalRecommendation = {
  anime: Anime;
  score: number;
  reason: string;
};

type CategoryBucketPayload = {
  trending?: { media?: Anime[] };
  popular?: { media?: Anime[] };
  topRated?: { media?: Anime[] };
};

type RecommendationPayload = {
  Media?: {
    recommendations?: {
      nodes?: Array<{
        rating?: number;
        mediaRecommendation?: Anime;
      }>;
    };
  };
};

type CandidateExplorePayload = {
  trending?: { media?: Anime[] };
  highScore?: { media?: Anime[] };
};

type SeedProfile = {
  weightedGenre: Map<string, number>;
  weightedTag: Map<string, number>;
  strongGenres: Set<string>;
  strongTags: Set<string>;
  recentGenres: Set<string>;
  recentTags: Set<string>;
};

type CandidateScoreDetail = {
  total: number;
  genreScore: number;
  tagScore: number;
  strongBoost: number;
  recencyBoost: number;
  graphBoost: number;
  qualityBoost: number;
  popularityBoost: number;
  matchedGenres: string[];
  matchedStrongGenres: string[];
  matchedStrongTags: string[];
};

const CATEGORIES: Category[] = [
  {
    id: "action",
    label: "액션",
    genres: ["Action", "Adventure"],
    previewImage: "/category-previews/action-samurai-champloo.jpg",
    previewFocus: "50% 22%",
  },
  {
    id: "romance",
    label: "로맨스",
    genres: ["Romance", "Drama"],
    previewImage: "/category-previews/romance-bokuyaba.jpg",
    previewFocus: "50% 20%",
  },
  {
    id: "healing",
    label: "일상/힐링",
    genres: ["Slice of Life", "Comedy", "Drama"],
    previewImage: "/category-previews/healing-blend-s.jpg",
    previewFocus: "50% 18%",
  },
  {
    id: "psychological",
    label: "두뇌/심리",
    genres: ["Psychological", "Mystery", "Drama"],
    previewImage: "/category-previews/psychological-steins-gate.jpg",
    previewFocus: "50% 22%",
  },
  {
    id: "special",
    label: "특수테마",
    genres: ["Music", "Sports", "Slice of Life", "Comedy", "Drama"],
    previewImage: "/category-previews/special-slam-dunk.jpg",
    previewFocus: "50% 26%",
  },
];

const SUBCATEGORY_RULES: Record<string, SubcategoryRule[]> = {
  action: [
    { id: "battle", match: (a) => (a.tags ?? []).some((t) => /battle|fight|war/i.test(t.name ?? "")) },
    { id: "adventure", match: (a) => (a.genres ?? []).includes("Adventure") || (a.tags ?? []).some((t) => /journey|travel/i.test(t.name ?? "")) },
    { id: "superpower", match: (a) => (a.tags ?? []).some((t) => /super power|hero|martial/i.test(t.name ?? "")) },
    { id: "military", match: (a) => (a.tags ?? []).some((t) => /military|army|weapon/i.test(t.name ?? "")) },
    { id: "mecha", match: (a) => (a.tags ?? []).some((t) => /mecha|robot/i.test(t.name ?? "")) },
    { id: "sports_action", match: (a) => (a.genres ?? []).includes("Sports") },
  ],
  romance: [
    { id: "school", match: (a) => (a.tags ?? []).some((t) => /school|teen|coming of age/i.test(t.name ?? "")) },
    { id: "adult", match: (a) => (a.tags ?? []).some((t) => /adult cast|office|workplace/i.test(t.name ?? "")) },
    { id: "melodrama", match: (a) => (a.tags ?? []).some((t) => /tragedy|love triangle|drama/i.test(t.name ?? "")) },
    { id: "romcom", match: (a) => (a.genres ?? []).includes("Comedy") && (a.genres ?? []).includes("Romance") },
    { id: "music_romance", match: (a) => (a.genres ?? []).includes("Music") },
    { id: "fantasy_romance", match: (a) => (a.tags ?? []).some((t) => /isekai|fantasy/i.test(t.name ?? "")) },
  ],
  healing: [
    { id: "daily", match: (a) => (a.genres ?? []).includes("Slice of Life") },
    { id: "comfy", match: (a) => (a.tags ?? []).some((t) => /iyashikei|healing|wholesome/i.test(t.name ?? "")) },
    { id: "comedy", match: (a) => (a.genres ?? []).includes("Comedy") },
    { id: "food", match: (a) => (a.tags ?? []).some((t) => /food|cooking|gourmet/i.test(t.name ?? "")) },
    { id: "family", match: (a) => (a.tags ?? []).some((t) => /family|childcare|friendship/i.test(t.name ?? "")) },
    { id: "school_daily", match: (a) => (a.tags ?? []).some((t) => /school|club/i.test(t.name ?? "")) },
  ],
  psychological: [
    { id: "mind", match: (a) => (a.tags ?? []).some((t) => /mind game|psychological|manipulation/i.test(t.name ?? "")) },
    { id: "mystery", match: (a) => (a.genres ?? []).includes("Mystery") },
    { id: "dark", match: (a) => (a.tags ?? []).some((t) => /trauma|depression|existential/i.test(t.name ?? "")) },
    { id: "philosophy", match: (a) => (a.tags ?? []).some((t) => /philosophy|existential/i.test(t.name ?? "")) },
    { id: "thriller_psy", match: (a) => (a.genres ?? []).includes("Thriller") },
    { id: "court_game", match: (a) => (a.tags ?? []).some((t) => /gambling|strategy|game/i.test(t.name ?? "")) },
  ],
  special: [
    { id: "music", match: (a) => (a.genres ?? []).includes("Music") || (a.tags ?? []).some((t) => /band|idol|music|singer|concert/i.test(t.name ?? "")) },
    { id: "idol", match: (a) => (a.tags ?? []).some((t) => /idol/i.test(t.name ?? "")) },
    { id: "cooking", match: (a) => (a.tags ?? []).some((t) => /food|cooking|gourmet|restaurant|cafe|chef/i.test(t.name ?? "")) },
    { id: "work", match: (a) => (a.tags ?? []).some((t) => /workplace|office|job|profession|career|teacher|doctor|nurse|bartender|maid/i.test(t.name ?? "")) },
    { id: "sports", match: (a) => (a.genres ?? []).includes("Sports") || (a.tags ?? []).some((t) => /basketball|baseball|soccer|volleyball|swimming|athlete/i.test(t.name ?? "")) },
  ],
};

const CATEGORY_BUCKET_QUERY = `
query ($genreIn: [String], $excludeIds: [Int], $minScore: Int, $minPopularity: Int) {
  trending: Page(page: 1, perPage: 20) {
    media(
      type: ANIME
      status_not_in: [NOT_YET_RELEASED]
      isAdult: false
      genre_in: $genreIn
      id_not_in: $excludeIds
      format_in: [TV, OVA, ONA, TV_SHORT]
      averageScore_greater: $minScore
      popularity_greater: $minPopularity
      sort: [TRENDING_DESC, POPULARITY_DESC]
    ) {
      id
      idMal
      format
      title { romaji english native }
      synonyms
      description(asHtml: false)
      coverImage { medium large }
      genres
      tags { name rank }
      meanScore
      popularity
      seasonYear
    }
  }
  popular: Page(page: 1, perPage: 20) {
    media(
      type: ANIME
      status_not_in: [NOT_YET_RELEASED]
      isAdult: false
      genre_in: $genreIn
      id_not_in: $excludeIds
      format_in: [TV, OVA, ONA, TV_SHORT]
      averageScore_greater: $minScore
      popularity_greater: $minPopularity
      sort: [POPULARITY_DESC, SCORE_DESC]
    ) {
      id
      idMal
      format
      title { romaji english native }
      synonyms
      description(asHtml: false)
      coverImage { medium large }
      genres
      tags { name rank }
      meanScore
      popularity
      seasonYear
    }
  }
  topRated: Page(page: 1, perPage: 20) {
    media(
      type: ANIME
      status_not_in: [NOT_YET_RELEASED]
      isAdult: false
      genre_in: $genreIn
      id_not_in: $excludeIds
      format_in: [TV, OVA, ONA, TV_SHORT]
      averageScore_greater: $minScore
      popularity_greater: $minPopularity
      sort: [SCORE_DESC, POPULARITY_DESC]
    ) {
      id
      idMal
      format
      title { romaji english native }
      synonyms
      description(asHtml: false)
      coverImage { medium large }
      genres
      tags { name rank }
      meanScore
      popularity
      seasonYear
    }
  }
}
`;

const FINAL_CANDIDATE_QUERY = `
query ($genreIn: [String], $tagIn: [String], $excludeIds: [Int], $page: Int, $perPage: Int, $minimumTagRank: Int) {
  Page(page: $page, perPage: $perPage) {
    media(
      type: ANIME
      status_not_in: [NOT_YET_RELEASED]
      isAdult: false
      genre_in: $genreIn
      tag_in: $tagIn
      minimumTagRank: $minimumTagRank
      id_not_in: $excludeIds
      format_in: [TV, OVA, ONA, TV_SHORT]
      sort: [POPULARITY_DESC, SCORE_DESC]
    ) {
      id
      idMal
      format
      title { romaji english native }
      synonyms
      description(asHtml: false)
      coverImage { medium large }
      genres
      tags { name rank }
      meanScore
      popularity
      seasonYear
    }
  }
}
`;

const FINAL_CANDIDATE_EXPLORE_QUERY = `
query ($genreIn: [String], $excludeIds: [Int], $page: Int, $perPage: Int) {
  trending: Page(page: $page, perPage: $perPage) {
    media(
      type: ANIME
      status_not_in: [NOT_YET_RELEASED]
      isAdult: false
      genre_in: $genreIn
      id_not_in: $excludeIds
      format_in: [TV, OVA, ONA, TV_SHORT]
      averageScore_greater: 58
      popularity_greater: 1500
      sort: [TRENDING_DESC, POPULARITY_DESC]
    ) {
      id
      idMal
      format
      title { romaji english native }
      synonyms
      description(asHtml: false)
      coverImage { medium large }
      genres
      tags { name rank }
      meanScore
      popularity
      seasonYear
    }
  }
  highScore: Page(page: $page, perPage: $perPage) {
    media(
      type: ANIME
      status_not_in: [NOT_YET_RELEASED]
      isAdult: false
      genre_in: $genreIn
      id_not_in: $excludeIds
      format_in: [TV, OVA, ONA, TV_SHORT]
      averageScore_greater: 72
      popularity_greater: 1200
      sort: [SCORE_DESC, POPULARITY_DESC]
    ) {
      id
      idMal
      format
      title { romaji english native }
      synonyms
      description(asHtml: false)
      coverImage { medium large }
      genres
      tags { name rank }
      meanScore
      popularity
      seasonYear
    }
  }
}
`;

const RECOMMENDATION_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    recommendations(sort: [RATING_DESC], perPage: 25) {
      nodes {
        rating
        mediaRecommendation {
          id
          idMal
          format
          title { romaji english native }
          synonyms
          description(asHtml: false)
          coverImage { medium large }
          genres
          tags { name rank }
          meanScore
          popularity
          seasonYear
        }
      }
    }
  }
}
`;

const ANILIST_ENDPOINT = "https://graphql.anilist.co";
const ANILIST_MAX_RETRIES = 3;
const ANILIST_BASE_RETRY_MS = 700;
const ANILIST_REQUEST_GAP_MS = 120;
const ANILIST_MAX_CONCURRENT = 3;
const CATEGORY_MIN_SCORE = 62;
const CATEGORY_MIN_POPULARITY = 8000;
const STEP2_MAX_PICKS = 12;
const STEP2_MIN_PICKS_FOR_FINAL = 3;

const { byMalId: KOREAN_TITLE_BY_MAL_ID, byAlias: KOREAN_TITLE_BY_KEY } = buildKoFallbackIndexes();

const KO_TITLE_CACHE_KEY = "voko_ko_title_cache_v1";
const KO_TITLE_MISS_KEY = "voko_ko_title_miss_v1";
const TMDB_API_KEY = (import.meta.env.VITE_TMDB_API_KEY as string | undefined)?.trim();
const HAS_LOCALIZE_API = Boolean((import.meta.env.VITE_LOCALIZE_ANIME_ENDPOINT as string | undefined)?.trim());
const TITLE_LOOKUP_MAX_CONCURRENT = 4;

type MissingTitleRecord = {
  id: number;
  idMal?: number;
  english?: string;
  romaji?: string;
  native?: string;
  seasonYear?: number;
  updatedAt: string;
};

function normalizeTitle(value: string): string {
  return normalizeKoFallbackKey(value);
}

function stripSequelMarkers(value: string): string {
  const sequelKeywordRegex =
    /(season|시즌|part|파트|pt\.?|cour|chapter|arc|hen|편|장|movie|극장판|special|스페셜|final|완결|ova|ona|episode|ep|tv)/i;

  let next = value
    .replace(/\b(s(?:eason)?|part|pt\.?|cour|chapter|episode|ep)\s*[-.:]?\s*(\d+|[ivx]+)\b/gi, " ")
    .replace(/\b(\d+|[ivx]+)\s*(st|nd|rd|th)?\s*(season|part|cour|chapter)\b/gi, " ")
    .replace(/\b(2nd|3rd|4th|5th|6th|final)\s*season\b/gi, " ")
    .replace(/\b(final season|the movie|movie|ova|ona|special)\b/gi, " ")
    .replace(/\b(pt\.?\s*\d+)\b/gi, " ")
    .replace(/(?:\s|^)제?\s*\d+\s*기(?=\s|$)/gi, " ")
    .replace(/(?:\s|^)시즌\s*\d+(?=\s|$)/gi, " ")
    .replace(/(?:\s|^)파트\s*\d+(?=\s|$)/gi, " ")
    .replace(/\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b/gi, " ");

  // Drop sequel subtitles like "제목: 도공 마을편", but keep base titles like "Re:Zero".
  const subtitleMatch = next.match(/^(.*?)[\s]*[:：\-|]\s*(.+)$/);
  if (subtitleMatch && sequelKeywordRegex.test(subtitleMatch[2])) {
    next = subtitleMatch[1];
  }

  next = next
    .replace(/\s+\d{1,2}\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return next;
}

function normalizeSeriesTitle(value: string): string {
  return normalizeTitle(stripSequelMarkers(value));
}

function normalizeDisplayTitle(value: string): string {
  const stripped = stripSequelMarkers(value)
    .replace(/\s+\((tv|movie|ova|ona)\)\s*$/i, "")
    .trim();
  return stripped || value;
}

const FRANCHISE_ALIAS_PATTERNS: Array<{ pattern: RegExp; canonical: string }> = [
  {
    pattern: /(re zero|rezero|re:zero|re\uff1azero|kara hajimeru isekai seikatsu|リゼロ|리제로|제로부터 시작하는 이세계 생활)/i,
    canonical: "re zero",
  },
  {
    pattern: /(boku no kokoro no yabai yatsu|bokuyaba|the dangers in my heart|내 마음의 위험한 녀석)/i,
    canonical: "the dangers in my heart",
  },
  {
    pattern: /(shingeki no kyojin|attack on titan|진격의 거인)/i,
    canonical: "attack on titan",
  },
  {
    pattern: /(kimetsu no yaiba|鬼滅の刃|demon slayer|귀멸의 칼날)/i,
    canonical: "demon slayer",
  },
  {
    pattern: /(my hero academia|boku no hero academia|bokunoheroacademia|僕のヒーローアカデミア|나의 히어로 아카데미아)/i,
    canonical: "my hero academia",
  },
];

const CANONICAL_DISPLAY_TITLE: Record<string, string> = {
  "demon slayer": "귀멸의 칼날",
  "re zero": "Re:제로부터 시작하는 이세계 생활",
  "attack on titan": "진격의 거인",
  "the dangers in my heart": "내 마음의 위험한 녀석",
  "my hero academia": "나의 히어로 아카데미아",
};

function canonicalizeFranchiseKey(value: string): string {
  for (const row of FRANCHISE_ALIAS_PATTERNS) {
    if (row.pattern.test(value)) return row.canonical;
  }
  return value;
}

function canonicalDisplayTitleFromAnime(anime: Anime): string | undefined {
  const key = franchiseKey(anime);
  return CANONICAL_DISPLAY_TITLE[key];
}

function hasHangul(value?: string): value is string {
  return !!value && /[가-힣]/.test(value);
}

function cacheKey(anime: Anime): string {
  return anime.idMal ? `mal:${anime.idMal}` : `ani:${anime.id}`;
}

function createMissingTitleRecord(anime: Anime): MissingTitleRecord {
  return {
    id: anime.id,
    idMal: anime.idMal,
    english: anime.title.english,
    romaji: anime.title.romaji,
    native: anime.title.native,
    seasonYear: anime.seasonYear,
    updatedAt: new Date().toISOString(),
  };
}

function titleFromStaticMap(anime: Anime): string | undefined {
  if (anime.idMal && KOREAN_TITLE_BY_MAL_ID[anime.idMal]) {
    return KOREAN_TITLE_BY_MAL_ID[anime.idMal];
  }
  const candidates = [anime.title.english, anime.title.romaji, anime.title.native].filter(
    (v): v is string => !!v,
  );
  for (const raw of candidates) {
    const key = normalizeTitle(raw);
    if (KOREAN_TITLE_BY_KEY[key]) return KOREAN_TITLE_BY_KEY[key];
  }
  return undefined;
}

function titleFromSynonyms(anime: Anime): string | undefined {
  const fromSynonym = (anime.synonyms ?? []).find((syn) => hasHangul(syn));
  if (fromSynonym) return normalizeDisplayTitle(fromSynonym.trim());
  if (hasHangul(anime.title.native)) return normalizeDisplayTitle(anime.title.native.trim());
  return undefined;
}

async function fetchKoreanTitleFromWikipediaByTitle(rawTitle: string): Promise<string | null> {
  const title = rawTitle.trim();
  if (!title) return null;

  const sources = ["en", "ja"] as const;
  for (const sourceLang of sources) {
    const endpoint =
      `https://${sourceLang}.wikipedia.org/w/api.php?action=query&format=json&prop=langlinks` +
      `&lllang=ko&lllimit=1&redirects=1&origin=*&titles=${encodeURIComponent(title)}`;
    const res = await fetch(endpoint);
    if (!res.ok) continue;

    const json = (await res.json()) as {
      query?: { pages?: Record<string, { langlinks?: Array<{ "*": string }> }> };
    };
    const page = json.query?.pages
      ? Object.values(json.query.pages).find((p) => Array.isArray(p.langlinks) && p.langlinks.length > 0)
      : undefined;
    const koTitle = page?.langlinks?.[0]?.["*"]?.trim();
    if (koTitle && hasHangul(koTitle)) return koTitle;
  }

  return null;
}

async function fetchKoreanTitleFromWikidata(idMal: number): Promise<string | null> {
  const query = `
SELECT ?label WHERE {
  ?item wdt:P4086 "${idMal}".
  ?item rdfs:label ?label.
  FILTER(LANG(?label) = "ko")
}
LIMIT 1
`;
  const endpoint = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const res = await fetch(endpoint, { headers: { Accept: "application/sparql-results+json" } });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    results?: { bindings?: Array<{ label?: { value?: string } }> };
  };
  return json.results?.bindings?.[0]?.label?.value?.trim() || null;
}

async function fetchKoreanTitleFromTMDB(anime: Anime): Promise<string | null> {
  if (!TMDB_API_KEY) return null;
  const query = anime.title.english || anime.title.romaji || anime.title.native;
  if (!query) return null;

  const endpoint =
    `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(TMDB_API_KEY)}` +
    `&language=ko-KR&query=${encodeURIComponent(query)}&page=1&include_adult=false`;

  const res = await fetch(endpoint);
  if (!res.ok) return null;

  const json = (await res.json()) as {
    results?: Array<{
      media_type?: string;
      name?: string;
      title?: string;
      first_air_date?: string;
      release_date?: string;
    }>;
  };

  const expectedYear = anime.seasonYear;
  const candidates = (json.results ?? []).filter((item) => item.media_type === "tv" || item.media_type === "movie");
  for (const item of candidates) {
    const ko = item.name?.trim() || item.title?.trim();
    const date = item.first_air_date || item.release_date || "";
    const year = Number.parseInt(date.slice(0, 4), 10);
    if (!ko || !hasHangul(ko)) continue;
    if (expectedYear && Number.isFinite(year) && Math.abs(expectedYear - year) > 2) continue;
    return ko;
  }
  return null;
}

async function resolveKoreanTitleFromApi(anime: Anime): Promise<string | null> {
  if (!HAS_LOCALIZE_API || !anime.idMal) return null;
  try {
    const response = await localizeAnimeFromApi({
      mal_id: anime.idMal,
      titles: {
        english: anime.title.english,
        romaji: anime.title.romaji,
        native: anime.title.native,
      },
      year: anime.seasonYear,
      type: anime.format,
      synopsis: anime.description,
      genres: anime.genres ?? [],
    });
    if (!response.title_ko || !hasHangul(response.title_ko)) return null;
    return normalizeDisplayTitle(response.title_ko);
  } catch {
    return null;
  }
}

async function resolveKoreanTitleByExternalFallbacks(anime: Anime): Promise<string | null> {
  const lookups: Array<Promise<string | null>> = [];

  if (anime.idMal) {
    lookups.push(fetchKoreanTitleFromWikidata(anime.idMal));
  }

  for (const titleCandidate of [anime.title.english, anime.title.romaji].filter((v): v is string => !!v).slice(0, 2)) {
    lookups.push(fetchKoreanTitleFromWikipediaByTitle(titleCandidate));
  }

  lookups.push(fetchKoreanTitleFromTMDB(anime));
  const settled = await Promise.allSettled(lookups);
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    const title = result.value?.trim();
    if (title && hasHangul(title)) return normalizeDisplayTitle(title);
  }
  return null;
}

function franchiseKey(anime: Anime): string {
  if (anime.idMal && KOREAN_TITLE_BY_MAL_ID[anime.idMal]) {
    return canonicalizeFranchiseKey(normalizeSeriesTitle(KOREAN_TITLE_BY_MAL_ID[anime.idMal]));
  }

  const candidates = [
    anime.title.english,
    anime.title.romaji,
    anime.title.native,
    ...(anime.synonyms ?? []).slice(0, 3),
  ].filter((value): value is string => Boolean(value));

  const keys = candidates
    .map((candidate) => canonicalizeFranchiseKey(normalizeSeriesTitle(candidate)))
    .filter((key) => key.length >= 3);
  if (keys.length) {
    const uniq = Array.from(new Set(keys));
    uniq.sort(
      (a, b) =>
        a.split(" ").filter(Boolean).length - b.split(" ").filter(Boolean).length || a.length - b.length,
    );
    return uniq[0];
  }

  return canonicalizeFranchiseKey(normalizeSeriesTitle(String(anime.id)));
}

function dedupeByFranchise(animes: Anime[]): Anime[] {
  const map = new Map<string, Anime>();
  for (const anime of animes) {
    const key = franchiseKey(anime);
    const current = map.get(key);
    if (!current) {
      map.set(key, anime);
      continue;
    }
    const currentScore = (current.popularity ?? 0) + (current.meanScore ?? 0) * 100;
    const nextScore = (anime.popularity ?? 0) + (anime.meanScore ?? 0) * 100;
    if (nextScore > currentScore) map.set(key, anime);
  }
  return Array.from(map.values());
}

function shuffleArray<T>(items: T[]): T[] {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

function getTitle(anime: Anime, koTitleCache: Record<string, string>): string {
  const canonicalDisplay = canonicalDisplayTitleFromAnime(anime);
  if (canonicalDisplay) return canonicalDisplay;

  const cached = koTitleCache[cacheKey(anime)];
  if (cached) return normalizeDisplayTitle(cached);

  const staticMapped = titleFromStaticMap(anime);
  if (staticMapped) return normalizeDisplayTitle(staticMapped);

  const fromSynonyms = titleFromSynonyms(anime);
  if (fromSynonyms) return fromSynonyms;

  const english = anime.title.english?.trim();
  const romaji = anime.title.romaji?.trim();
  if (english) return normalizeDisplayTitle(english);
  if (romaji) return normalizeDisplayTitle(romaji);
  return `한글 제목 준비중 (#${anime.id})`;
}

function toKoreanGenre(genre: string): string {
  const map: Record<string, string> = {
    Action: "액션",
    Adventure: "모험",
    Comedy: "코미디",
    Romance: "로맨스",
    Fantasy: "판타지",
    Thriller: "스릴러",
    Mystery: "미스터리",
    Drama: "드라마",
    SciFi: "SF",
    "Sci-Fi": "SF",
    Psychological: "심리",
    Sports: "스포츠",
    Music: "음악",
    "Slice of Life": "일상",
    Supernatural: "초자연",
    Horror: "호러",
  };
  return map[genre] ?? genre;
}

function buildKoreanSummary(anime: Anime): string {
  const genres = (anime.genres ?? []).slice(0, 3).map(toKoreanGenre);
  const score = anime.meanScore ?? "-";
  const year = anime.seasonYear ? `${anime.seasonYear}년작` : "연도 정보 없음";
  if (!genres.length) return `평균 평점 ${score} · ${year}`;
  return `장르: ${genres.join(", ")} · 평균 평점 ${score} · ${year}`;
}

function collectCategoryBuckets(payload: CategoryBucketPayload): Anime[] {
  const merged = [
    ...(payload.trending?.media ?? []),
    ...(payload.popular?.media ?? []),
    ...(payload.topRated?.media ?? []),
  ];
  return dedupeByFranchise(merged);
}

function isSpecialThemeAnime(anime: Anime): boolean {
  const genres = new Set((anime.genres ?? []).map((g) => g.toLowerCase()));
  const tags = (anime.tags ?? []).map((t) => (t.name ?? "").toLowerCase()).filter(Boolean);

  const themeTagRegex =
    /(idol|music|band|singer|concert|showbiz|cooking|food|gourmet|restaurant|cafe|chef|workplace|office|job|profession|career|teacher|doctor|nurse|bartender|maid|sports|basketball|baseball|soccer|volleyball|swimming|athlete)/i;
  const actionHeavyTagRegex =
    /(battle|war|military|super power|martial|mecha|assassin|revenge|survival|gore|weapon|gun|monster)/i;

  const strongThemeTagHits = tags.filter((tag) => themeTagRegex.test(tag)).length;
  const themeGenreHit = genres.has("music") || genres.has("sports");
  const actionGenreHits = Number(genres.has("action")) + Number(genres.has("adventure")) + Number(genres.has("fantasy"));
  const actionTagHits = tags.filter((tag) => actionHeavyTagRegex.test(tag)).length;

  const themeStrength = strongThemeTagHits * 2 + (themeGenreHit ? 2 : 0);
  const actionStrength = actionGenreHits + actionTagHits * 1.6;

  if (themeStrength <= 0) return false;
  if (actionStrength >= 3.4 && themeStrength < actionStrength) return false;
  return true;
}

function getSubcategoryIdForAnime(categoryId: string, anime: Anime): string {
  const rules = SUBCATEGORY_RULES[categoryId] ?? [];
  for (const rule of rules) {
    if (rule.match(anime)) return rule.id;
  }
  return "other";
}

function distributeBySubcategory(categoryId: string, pool: Anime[], total = 20): Anime[] {
  const isSpecialCategory = categoryId === "special";
  const grouped = new Map<string, Anime[]>();

  for (const anime of pool) {
    const subId = getSubcategoryIdForAnime(categoryId, anime);
    if (!grouped.has(subId)) {
      grouped.set(subId, []);
    }
    grouped.get(subId)!.push(anime);
  }

  const groups = Array.from(grouped.entries())
    .map(([subId, items]) => ({
      subId,
      items: [...items].sort(
        (a, b) =>
          (b.popularity ?? 0) + (b.meanScore ?? 0) * 200 - ((a.popularity ?? 0) + (a.meanScore ?? 0) * 200),
      ),
      groupPopularity: items.reduce((acc, cur) => acc + (cur.popularity ?? 0), 0),
    }))
    .sort((a, b) => {
      if (isSpecialCategory && a.subId === "other" && b.subId !== "other") return 1;
      if (isSpecialCategory && b.subId === "other" && a.subId !== "other") return -1;
      return b.groupPopularity - a.groupPopularity || b.items.length - a.items.length;
    });

  const popularGroups = groups.slice(0, Math.min(5, groups.length));
  const lessPopularGroups = groups.slice(popularGroups.length);
  const selected: Anime[] = [];

  // Popular subcategories: prioritize 4 each (up to 5 groups => about 20 cards).
  for (const group of popularGroups) {
    const pickLimit = isSpecialCategory && group.subId === "other" ? 1 : 4;
    selected.push(...group.items.slice(0, pickLimit));
  }

  // Less-popular subcategories: keep 1 each if space remains.
  if (selected.length < total) {
    for (const group of lessPopularGroups) {
      if (!group.items.length) continue;
      if (isSpecialCategory && group.subId === "other") continue;
      selected.push(group.items[0]);
      if (selected.length >= total) break;
    }
  }

  if (selected.length < total) {
    const selectedIds = new Set(selected.map((item) => item.id));
    for (const group of popularGroups) {
      for (const item of group.items.slice(4)) {
        if (selectedIds.has(item.id)) continue;
        selected.push(item);
        selectedIds.add(item.id);
        if (selected.length >= total) break;
      }
      if (selected.length >= total) break;
    }
  }

  return selected.slice(0, total);
}

function extractTopTags(seeds: Anime[], limit = 8): string[] {
  const tagMap = new Map<string, number>();
  seeds.forEach((seed) => {
    (seed.tags ?? []).forEach((tag) => {
      if (!tag.name) return;
      const weight = Math.max(10, tag.rank ?? 30);
      tagMap.set(tag.name, (tagMap.get(tag.name) ?? 0) + weight);
    });
  });
  return Array.from(tagMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

let lastAniRequestAt = 0;
let activeAniRequests = 0;
const aniRequestWaiters: Array<() => void> = [];

async function acquireAniRequestSlot(): Promise<void> {
  if (activeAniRequests < ANILIST_MAX_CONCURRENT) {
    activeAniRequests += 1;
    return;
  }
  await new Promise<void>((resolve) => aniRequestWaiters.push(resolve));
  activeAniRequests += 1;
}

function releaseAniRequestSlot(): void {
  activeAniRequests = Math.max(0, activeAniRequests - 1);
  const next = aniRequestWaiters.shift();
  if (next) next();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

async function aniFetch<T>(
  query: string,
  variables: Record<string, unknown>,
  options?: { retries?: number },
): Promise<T> {
  await acquireAniRequestSlot();
  try {
    const maxRetries = options?.retries ?? ANILIST_MAX_RETRIES;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const waitGap = Math.max(0, ANILIST_REQUEST_GAP_MS - (Date.now() - lastAniRequestAt));
      if (waitGap > 0) await sleep(waitGap);
      lastAniRequestAt = Date.now();

      const res = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });

      if (res.ok) {
        const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
        if (json.errors?.length) {
          const message = json.errors[0]?.message || "AniList GraphQL 오류";
          if (attempt < maxRetries && /rate|too many|timeout|temporarily/i.test(message)) {
            await sleep(ANILIST_BASE_RETRY_MS * 2 ** attempt);
            continue;
          }
          throw new Error(message);
        }
        if (!json.data) throw new Error("AniList 응답 데이터 없음");
        return json.data;
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < maxRetries) {
        const headerDelay = parseRetryAfterMs(res.headers.get("Retry-After"));
        const fallbackDelay = ANILIST_BASE_RETRY_MS * 2 ** attempt;
        await sleep(Math.min(8000, headerDelay ?? fallbackDelay));
        continue;
      }

      throw new Error(`AniList 요청 실패 (${res.status})`);
    }

    throw new Error("AniList 요청 재시도 한도를 초과했습니다.");
  } finally {
    releaseAniRequestSlot();
  }
}

function buildSeedProfile(seeds: Anime[]): SeedProfile {
  const weightedGenre = new Map<string, number>();
  const weightedTag = new Map<string, number>();
  const genreCount = new Map<string, number>();
  const tagCount = new Map<string, number>();
  const recentGenres = new Set<string>();
  const recentTags = new Set<string>();
  const total = Math.max(1, seeds.length - 1);

  seeds.forEach((seed, index) => {
    // Later selections receive stronger signal because they are usually more refined.
    const recencyWeight = 1 + (index / total) * 0.75;
    for (const genre of seed.genres ?? []) {
      weightedGenre.set(genre, (weightedGenre.get(genre) ?? 0) + recencyWeight);
      genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
    }
    for (const tag of seed.tags ?? []) {
      if (!tag.name) continue;
      const baseTagWeight = Math.max(0.25, (tag.rank ?? 40) / 100);
      weightedTag.set(tag.name, (weightedTag.get(tag.name) ?? 0) + baseTagWeight * recencyWeight * 1.2);
      tagCount.set(tag.name, (tagCount.get(tag.name) ?? 0) + 1);
    }
  });

  for (const seed of seeds.slice(-4)) {
    for (const genre of seed.genres ?? []) recentGenres.add(genre);
    for (const tag of seed.tags ?? []) {
      if (tag.name) recentTags.add(tag.name);
    }
  }

  const strongGenres = new Set(
    [...genreCount.entries()]
      .filter(([genre, count]) => count >= 2 || (weightedGenre.get(genre) ?? 0) >= 2.4)
      .map(([genre]) => genre),
  );
  const strongTags = new Set(
    [...tagCount.entries()]
      .filter(([tag, count]) => count >= 2 || (weightedTag.get(tag) ?? 0) >= 2.1)
      .map(([tag]) => tag),
  );

  return { weightedGenre, weightedTag, strongGenres, strongTags, recentGenres, recentTags };
}

function scoreCandidateDetailed(
  candidate: Anime,
  profile: SeedProfile,
  graphSignal = 0,
): CandidateScoreDetail {
  const matchedGenres = (candidate.genres ?? []).filter((genre) => profile.weightedGenre.has(genre));
  const matchedStrongGenres = (candidate.genres ?? []).filter((genre) => profile.strongGenres.has(genre));
  const matchedStrongTags = (candidate.tags ?? [])
    .map((tag) => tag.name)
    .filter((tag): tag is string => typeof tag === "string" && profile.strongTags.has(tag));

  const genreScore = (candidate.genres ?? []).reduce(
    (acc, genre) => acc + (profile.weightedGenre.get(genre) ?? 0) * 7.2,
    0,
  );
  const tagScore = (candidate.tags ?? []).reduce((acc, tag) => {
    if (!tag.name) return acc;
    return acc + (profile.weightedTag.get(tag.name) ?? 0) * 5.8;
  }, 0);

  const strongBoost = matchedStrongGenres.length * 3.6 + matchedStrongTags.length * 2.7;
  const recencyBoost =
    (candidate.genres ?? []).reduce((acc, genre) => acc + (profile.recentGenres.has(genre) ? 2.2 : 0), 0) +
    (candidate.tags ?? []).reduce((acc, tag) => acc + (tag.name && profile.recentTags.has(tag.name) ? 1.2 : 0), 0);
  const graphBoost = graphSignal;
  const qualityBoost = ((candidate.meanScore ?? 65) - 60) * 0.5;
  const popularityBoost = Math.min(14, Math.log10((candidate.popularity ?? 1) + 1) * 4.5);

  const total =
    genreScore + tagScore + strongBoost + recencyBoost + graphBoost + qualityBoost + popularityBoost;

  return {
    total,
    genreScore,
    tagScore,
    strongBoost,
    recencyBoost,
    graphBoost,
    qualityBoost,
    popularityBoost,
    matchedGenres,
    matchedStrongGenres,
    matchedStrongTags,
  };
}

function buildReasonFromDetail(detail: CandidateScoreDetail): string {
  if (detail.strongBoost >= 6 && detail.matchedStrongGenres.length) {
    return `선택 빈도가 높았던 선호 장르(${detail.matchedStrongGenres
      .slice(0, 2)
      .map(toKoreanGenre)
      .join(", ")})를 강하게 반영했습니다.`;
  }
  if (detail.recencyBoost >= 5) {
    return "최근에 선택한 작품들과 결이 가장 가까운 흐름을 우선 반영했습니다.";
  }
  if (detail.graphBoost >= 8) {
    return "선택작과 함께 추천되는 사용자 흐름 신호가 강해 우선 배치했습니다.";
  }
  if (detail.matchedGenres.length >= 2) {
    return `선택작과 공통 장르(${detail.matchedGenres.slice(0, 2).map(toKoreanGenre).join(", ")}) 일치도가 높습니다.`;
  }
  if (detail.tagScore >= 6) {
    return "반복 선택된 태그 성향과 유사도가 높아 추천했습니다.";
  }
  if (detail.qualityBoost + detail.popularityBoost >= 10) {
    return "완성도와 대중성 지표가 안정적으로 높아 추천했습니다.";
  }
  return "선택한 작품군과의 장르·태그 유사도를 종합해 추천했습니다.";
}

function reasonBucket(detail: CandidateScoreDetail): string {
  if (detail.strongBoost >= 6 && detail.matchedStrongGenres.length) return "strong";
  if (detail.recencyBoost >= 5) return "recency";
  if (detail.graphBoost >= 8) return "graph";
  if (detail.matchedGenres.length >= 2) return "genre";
  if (detail.tagScore >= 6) return "tag";
  if (detail.qualityBoost + detail.popularityBoost >= 10) return "quality";
  return "general";
}

export default function App() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(CATEGORIES[0].id);
  const [activeStep, setActiveStep] = useState<1 | 2>(1);
  const [seenCategoryIds, setSeenCategoryIds] = useState<number[]>([]);

  const [categoryAnimes, setCategoryAnimes] = useState<Anime[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState("");

  const [pickedBaseAnimes, setPickedBaseAnimes] = useState<Anime[]>([]);

  const [finalRecs, setFinalRecs] = useState<FinalRecommendation[]>([]);
  const [finalLoading, setFinalLoading] = useState(false);
  const [finalError, setFinalError] = useState("");

  const [koTitleCache, setKoTitleCache] = useState<Record<string, string>>({});
  const lookupInFlight = useRef<Set<string>>(new Set());
  const lookupFailed = useRef<Set<string>>(new Set());
  const missingTitleMapRef = useRef<Record<string, MissingTitleRecord>>({});

  const selectedCategory = useMemo(
    () => CATEGORIES.find((c) => c.id === selectedCategoryId) ?? CATEGORIES[0],
    [selectedCategoryId],
  );

  function rememberMissingTitle(anime: Anime): void {
    const key = cacheKey(anime);
    const next = {
      ...missingTitleMapRef.current,
      [key]: createMissingTitleRecord(anime),
    };
    missingTitleMapRef.current = next;
    try {
      localStorage.setItem(KO_TITLE_MISS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function clearMissingTitle(key: string): void {
    if (!missingTitleMapRef.current[key]) return;
    const next = { ...missingTitleMapRef.current };
    delete next[key];
    missingTitleMapRef.current = next;
    try {
      localStorage.setItem(KO_TITLE_MISS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KO_TITLE_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      setKoTitleCache(parsed);
    } catch {
      // ignore
    }

    try {
      const rawMissing = localStorage.getItem(KO_TITLE_MISS_KEY);
      if (!rawMissing) return;
      missingTitleMapRef.current = JSON.parse(rawMissing) as Record<string, MissingTitleRecord>;
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KO_TITLE_CACHE_KEY, JSON.stringify(koTitleCache));
    } catch {
      // ignore
    }
  }, [koTitleCache]);

  async function fetchCategoryAnimes(category: Category, mode: "reset" | "refresh" = "reset") {
    setCategoryLoading(true);
    setCategoryError("");
    if (mode === "reset") {
      setCategoryAnimes([]);
      setPickedBaseAnimes([]);
      setFinalRecs([]);
      setFinalError("");
      setSeenCategoryIds([]);
    }

    const baseSeen = mode === "reset" ? [] : seenCategoryIds;
    const excludeIds = baseSeen.slice(-350);
    const isSpecialCategory = category.id === "special";
    const strictMinScore = isSpecialCategory ? 52 : CATEGORY_MIN_SCORE;
    const strictMinPopularity = isSpecialCategory ? 1200 : CATEGORY_MIN_POPULARITY;

    try {
      const strictPayload = await aniFetch<CategoryBucketPayload>(CATEGORY_BUCKET_QUERY, {
        genreIn: category.genres,
        excludeIds,
        minScore: strictMinScore,
        minPopularity: strictMinPopularity,
      });
      const strictCandidates = isSpecialCategory
        ? collectCategoryBuckets(strictPayload).filter(isSpecialThemeAnime)
        : collectCategoryBuckets(strictPayload);

      let nextList = distributeBySubcategory(
        category.id,
        shuffleArray(strictCandidates),
        20,
      );

      if (nextList.length < 18) {
        const relaxedExclude = Array.from(new Set([...excludeIds, ...nextList.map((item) => item.id)])).slice(-350);
        const relaxedPayload = await aniFetch<CategoryBucketPayload>(CATEGORY_BUCKET_QUERY, {
          genreIn: category.genres,
          excludeIds: relaxedExclude,
          minScore: 0,
          minPopularity: 0,
        });
        const relaxedCandidates = isSpecialCategory
          ? collectCategoryBuckets(relaxedPayload).filter(isSpecialThemeAnime)
          : collectCategoryBuckets(relaxedPayload);
        nextList = distributeBySubcategory(
          category.id,
          shuffleArray(dedupeByFranchise([...nextList, ...relaxedCandidates])),
          20,
        );
      }

      if (isSpecialCategory && nextList.length < 18) {
        const specialExploreVariables: Record<string, unknown> = {
          genreIn: category.genres,
          page: 1,
          perPage: 90,
          excludeIds: Array.from(new Set([...excludeIds, ...nextList.map((item) => item.id)])).slice(-350),
        };
        const explorePayload = await aniFetch<CandidateExplorePayload>(
          FINAL_CANDIDATE_EXPLORE_QUERY,
          specialExploreVariables,
          { retries: 2 },
        );
        const exploreCandidates = dedupeByFranchise([
          ...(explorePayload.trending?.media ?? []),
          ...(explorePayload.highScore?.media ?? []),
        ]).filter(isSpecialThemeAnime);
        nextList = distributeBySubcategory(
          category.id,
          shuffleArray(dedupeByFranchise([...nextList, ...exploreCandidates])),
          20,
        );
      }

      if (!nextList.length) setCategoryError("새로 보여줄 작품이 부족합니다. 카테고리를 바꿔보세요.");

      setCategoryAnimes(nextList);
      setSeenCategoryIds((prev) => {
        const base = mode === "reset" ? [] : prev;
        return Array.from(new Set([...base, ...nextList.map((a) => a.id)]));
      });
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : "목록을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setCategoryLoading(false);
    }
  }

  function toggleBasePick(anime: Anime) {
    setPickedBaseAnimes((prev) => {
      const exists = prev.some((item) => item.id === anime.id);
      if (exists) {
        return prev.filter((item) => item.id !== anime.id);
      }
      if (prev.length >= STEP2_MAX_PICKS) return prev;
      return [...prev, anime];
    });
    setFinalRecs([]);
  }

  async function makeFinalRecommendations() {
    if (pickedBaseAnimes.length < STEP2_MIN_PICKS_FOR_FINAL) {
      setFinalError(`최소 ${STEP2_MIN_PICKS_FOR_FINAL}개 이상 선택해 주세요.`);
      return;
    }

    setFinalLoading(true);
    setFinalError("");

    try {
      const allowedFormats = new Set(["TV", "OVA", "ONA", "TV_SHORT"]);
      const seedProfile = buildSeedProfile(pickedBaseAnimes);
      const topGenres = [...seedProfile.weightedGenre.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre]) => genre);
      const topTags = [...seedProfile.weightedTag.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag]) => tag);
      const seedSet = new Set(pickedBaseAnimes.map((item) => item.id));
      const seedIds = Array.from(seedSet);

      const graphScoreById = new Map<number, number>();
      const graphCandidates = new Map<number, Anime>();

      const graphResponses = await Promise.all(
        seedIds.slice(0, 6).map((id) =>
          aniFetch<RecommendationPayload>(RECOMMENDATION_QUERY, { id }, { retries: 2 }),
        ),
      );

      graphResponses.forEach((response) => {
        (response.Media?.recommendations?.nodes ?? []).forEach((node) => {
          const candidate = node.mediaRecommendation;
          if (!candidate || seedSet.has(candidate.id)) return;
          if (candidate.format && !allowedFormats.has(candidate.format)) return;

          const rawSignal = Math.max(0, node.rating ?? 0);
          const normalizedGraphSignal = Math.log10(rawSignal + 1) * 12;

          graphScoreById.set(candidate.id, (graphScoreById.get(candidate.id) ?? 0) + normalizedGraphSignal);
          if (!graphCandidates.has(candidate.id)) graphCandidates.set(candidate.id, candidate);
        });
      });

      const finalVariables: Record<string, unknown> = {
        genreIn: topGenres.length ? topGenres : selectedCategory.genres,
        page: 1,
        perPage: 80,
        excludeIds: seedIds,
      };
      if (topTags.length) {
        finalVariables.tagIn = topTags;
        finalVariables.minimumTagRank = 35;
      }

      const exploreVariables: Record<string, unknown> = {
        genreIn: topGenres.length ? topGenres : selectedCategory.genres,
        page: 1,
        perPage: 60,
        excludeIds: seedIds,
      };

      const [fallbackData, exploreData] = await Promise.all([
        aniFetch<{ Page: { media: Anime[] } }>(FINAL_CANDIDATE_QUERY, finalVariables),
        aniFetch<CandidateExplorePayload>(FINAL_CANDIDATE_EXPLORE_QUERY, exploreVariables, { retries: 2 }),
      ]);
      const mergedCandidates = new Map<number, Anime>();
      graphCandidates.forEach((anime) => mergedCandidates.set(anime.id, anime));
      dedupeByFranchise(fallbackData.Page.media ?? [])
        .filter((anime) => !seedSet.has(anime.id))
        .forEach((anime) => {
          if (!mergedCandidates.has(anime.id)) mergedCandidates.set(anime.id, anime);
        });
      dedupeByFranchise([
        ...(exploreData.trending?.media ?? []),
        ...(exploreData.highScore?.media ?? []),
      ])
        .filter((anime) => !seedSet.has(anime.id))
        .forEach((anime) => {
          if (!mergedCandidates.has(anime.id)) mergedCandidates.set(anime.id, anime);
        });

      const ranked = dedupeByFranchise(Array.from(mergedCandidates.values()))
        .filter((anime) => !seedSet.has(anime.id))
        .map((anime) => {
          const detail = scoreCandidateDetailed(anime, seedProfile, graphScoreById.get(anime.id) ?? 0);
          return {
            anime,
            score: detail.total,
            reason: buildReasonFromDetail(detail),
            reasonType: reasonBucket(detail),
          };
        })
        .sort((a, b) => b.score - a.score);

      const selected: Array<{ anime: Anime; score: number; reason: string; reasonType: string }> = [];
      const usedReasonTypes = new Set<string>();

      for (const item of ranked) {
        if (selected.length >= 4) break;
        if (usedReasonTypes.has(item.reasonType)) continue;
        selected.push(item);
        usedReasonTypes.add(item.reasonType);
      }
      for (const item of ranked) {
        if (selected.length >= 4) break;
        if (selected.some((picked) => picked.anime.id === item.anime.id)) continue;
        selected.push(item);
      }

      setFinalRecs(selected.slice(0, 4).map(({ anime, score, reason }) => ({ anime, score, reason })));
    } catch (error) {
      setFinalError(error instanceof Error ? error.message : "추천 결과를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setFinalLoading(false);
    }
  }

  const visibleAnimesForKoLookup = useMemo(
    () =>
      Array.from(
        new Map(
          [...categoryAnimes, ...pickedBaseAnimes, ...finalRecs.map((item) => item.anime)].map((anime) => [anime.id, anime]),
        ).values(),
      ),
    [categoryAnimes, pickedBaseAnimes, finalRecs],
  );

  useEffect(() => {
    async function resolveKoreanTitles() {
      const unresolved = visibleAnimesForKoLookup.filter((anime) => {
        const key = cacheKey(anime);
        return !koTitleCache[key] && !lookupInFlight.current.has(key) && !lookupFailed.current.has(key);
      });
      if (!unresolved.length) return;

      for (const anime of unresolved) {
        lookupInFlight.current.add(cacheKey(anime));
      }

      const resolvedMap: Record<string, string> = {};
      await mapWithConcurrency(unresolved, TITLE_LOOKUP_MAX_CONCURRENT, async (anime) => {
        const key = cacheKey(anime);
        try {
          const staticMapped = titleFromStaticMap(anime);
          if (staticMapped) {
            clearMissingTitle(key);
            resolvedMap[key] = normalizeDisplayTitle(staticMapped);
            return;
          }

          const synonymMapped = titleFromSynonyms(anime);
          if (synonymMapped) {
            clearMissingTitle(key);
            resolvedMap[key] = normalizeDisplayTitle(synonymMapped);
            return;
          }

          let resolvedTitle = await resolveKoreanTitleFromApi(anime);
          if (!resolvedTitle) {
            resolvedTitle = await resolveKoreanTitleByExternalFallbacks(anime);
          }

          if (resolvedTitle) {
            clearMissingTitle(key);
            resolvedMap[key] = normalizeDisplayTitle(resolvedTitle);
          } else {
            lookupFailed.current.add(key);
            rememberMissingTitle(anime);
          }
        } catch {
          lookupFailed.current.add(key);
          rememberMissingTitle(anime);
        } finally {
          lookupInFlight.current.delete(key);
        }
      });

      if (Object.keys(resolvedMap).length) {
        setKoTitleCache((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [key, value] of Object.entries(resolvedMap)) {
            if (!next[key]) {
              next[key] = value;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    }

    void resolveKoreanTitles();
  }, [visibleAnimesForKoLookup, koTitleCache]);

  return (
    <div className={`page ${activeStep === 1 ? "landing" : ""}`}>
      <header className="hero">
        <button
          type="button"
          className="kicker logo-button"
          onClick={() => window.location.reload()}
          title="밍크애니 새로고침"
        >
          MINK ANI
        </button>
        <h1>취향 고르면, 딱 맞는 다음 애니를 추천해줄게</h1>
        <p>카테고리 선택 → 재밌게 본 애니 선택 → 최종 추천(4작품)</p>
      </header>

      {activeStep === 1 && (
      <section className="flow-panel step1-panel">
        <h2>STEP 1. 카테고리 선택</h2>
        <div className="chip-group">
          {CATEGORIES.map((category) => {
            const preview = category.previewImage;
            return (
              <button
                key={category.id}
                className={`chip-btn ${selectedCategoryId === category.id ? "active" : ""}`}
                style={
                  {
                    "--chip-image": `url(${preview})`,
                    "--chip-focus": category.previewFocus ?? "50% 24%",
                  } as CSSProperties
                }
                onClick={() => {
                  setSelectedCategoryId(category.id);
                  setActiveStep(2);
                  void fetchCategoryAnimes(category, "reset");
                }}
              >
                <span className="chip-label">{category.label}</span>
              </button>
            );
          })}
        </div>
        {categoryLoading && <p className="loading-text">카테고리 애니 불러오는 중...</p>}
        {categoryError && <p className="error-text">{categoryError}</p>}
      </section>
      )}

      {activeStep === 2 && (
        <section className="panel step2-panel">
          <h2>STEP 2. 취향에 맞는 작품 선택 (최대 {STEP2_MAX_PICKS}개)</h2>
          <p className="source-note">마음에 드는 작품을 여러 개 고를수록 최종 추천 정확도가 올라갑니다.</p>
          {categoryLoading && <p className="loading-text">추천 후보를 불러오는 중입니다...</p>}
          {!categoryLoading && !!categoryError && <p className="error-text">{categoryError}</p>}
          {!categoryLoading && !categoryError && !categoryAnimes.length && (
            <p className="loading-text">표시할 작품을 준비 중입니다. 잠시만 기다려주세요.</p>
          )}

          {!!categoryAnimes.length && (
          <>
          <div className="step2-topbar">
            <div className="step2-status">
              <p className="picked-count">선택 현황</p>
              <p className="picked-count-badge">
                {pickedBaseAnimes.length}/{STEP2_MAX_PICKS}
              </p>
            </div>
            <button
              className="primary-btn"
              onClick={() => void fetchCategoryAnimes(selectedCategory, "refresh")}
              disabled={categoryLoading}
            >
              {categoryLoading ? "목록 갱신 중..." : "목록 새로 받기"}
            </button>
          </div>
          <p className="step2-helper">카드를 클릭하면 선택/해제가 가능합니다.</p>

          {!!pickedBaseAnimes.length && (
            <div className="picked-strip">
              {pickedBaseAnimes.map((anime) => (
                <button
                  key={anime.id}
                  className="picked-pill"
                  onClick={() => toggleBasePick(anime)}
                  title="선택 해제"
                >
                  {getTitle(anime, koTitleCache)}
                </button>
              ))}
            </div>
          )}

          <div className="grid cards step2-cards">
            {categoryAnimes.map((anime, index) => {
              const selected = pickedBaseAnimes.some((item) => item.id === anime.id);
              return (
                <article
                  key={anime.id}
                  className={`anime-card readable ${selected ? "selected" : ""}`}
                  onClick={() => toggleBasePick(anime)}
                >
                  <img
                    src={anime.coverImage?.medium || anime.coverImage?.large || ""}
                    alt={getTitle(anime, koTitleCache)}
                    loading={index < 4 ? "eager" : "lazy"}
                    fetchPriority={index < 4 ? "high" : "low"}
                    decoding="async"
                  />
                  <div className="card-body">
                    <h4>{getTitle(anime, koTitleCache)}</h4>
                    <p>{buildKoreanSummary(anime)}</p>
                    <div className="meta-row">
                      <span>★ {anime.meanScore ?? "-"}</span>
                      <span>{anime.seasonYear ?? "-"}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="step2-bottombar">
            <button
              className="primary-btn"
              onClick={() => void fetchCategoryAnimes(selectedCategory, "refresh")}
              disabled={categoryLoading}
            >
              {categoryLoading ? "목록 갱신 중..." : "목록 새로 받기"}
            </button>
            <button className="primary-btn strong" onClick={() => void makeFinalRecommendations()} disabled={finalLoading}>
              {finalLoading ? "추천 계산 중..." : "추천 결과 보기"}
            </button>
          </div>
          </>
          )}
          {finalError && <p className="error-text">{finalError}</p>}
        </section>
      )}

      {!!finalRecs.length && (
        <section className="panel result-panel motion-in">
          <h2>최종 추천 4작품</h2>
          <p className="source-note">선택 패턴과 장르/태그 유사도를 종합해 우선순위로 정렬했습니다.</p>
          <div className="grid cards result-grid">
            {finalRecs.map((item, index) => {
              const koreanTags = (item.anime.genres ?? [])
                .map((g) => toKoreanGenre(g))
                .filter((label) => hasHangul(label))
                .slice(0, 4);

              return (
                <article key={item.anime.id} className="anime-card result large">
                  <img
                    src={item.anime.coverImage?.medium || item.anime.coverImage?.large || ""}
                    alt={getTitle(item.anime, koTitleCache)}
                    loading={index === 0 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : "low"}
                    decoding="async"
                  />
                  <div className="result-content">
                    <p className="result-rank">추천 #{index + 1}</p>
                    <h4>{getTitle(item.anime, koTitleCache)}</h4>
                    <p className="reason">선택 근거: {item.reason}</p>
                    <div className="meta-row result-meta">
                      <span>평점 {item.anime.meanScore ?? "-"}</span>
                      <span>추천점수 {Math.round(item.score)}</span>
                    </div>
                    {!!koreanTags.length && (
                      <div className="tag-row">
                        {koreanTags.map((label) => (
                          <span key={label}>#{label}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}
