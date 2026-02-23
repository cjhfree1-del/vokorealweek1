import { useEffect, useMemo, useRef, useState } from "react";
import CategoryStrip from "./components/CategoryStrip";
import { buildKoFallbackIndexes, normalizeKoFallbackKey } from "./data/koTitleFallbackRepo";
import { localizeAnimeFromApi } from "./api/localizeAnimeClient";
import { ANILIST_ENDPOINT, DISCOVERY_MEDIA_QUERY, RECOMMENDATION_QUERY } from "./reco/anilistQueries";
import {
  filterByCategory,
  FINAL_MMR_TOP_N,
  getCategoryDiscoveryPresets,
  isCategoryAligned,
  selectFinalWithMMR,
  selectStep2DiverseCandidates,
  STEP2_DISCOVERY_SORTS,
  STEP2_MIN_AVERAGE_SCORE,
  STEP2_MIN_POPULARITY,
  STEP2_POOL_MAX,
  STEP2_POOL_MIN,
  STEP2_RELAXED_MIN_AVERAGE_SCORE,
  STEP2_RELAXED_MIN_POPULARITY,
  STEP2_TARGET_COUNT,
} from "./reco/diversity";
import {
  appendSessionStep,
  createSessionId,
  ensureUserSession,
  getOrCreateAnonUserId,
  readUserProfile,
  writeUserProfile,
} from "./reco/storage";
import {
  buildFinalReason,
  buildSeedPreferenceVector,
  dominantTagNames,
  getScoreValue,
  scoreFinalCandidate,
  topPreferenceTags,
} from "./reco/scoring";
import { buildSemanticSimilarityMap } from "./reco/semantic";
import {
  createEmptyUserProfile,
  PROFILE_EXPOSURE_LIMIT,
  scoreWithProfile,
  topDislikedTags,
  topLikedTags,
  updateExposureHistory,
  updateProfileFromFeedback,
  type FeedbackSignal,
  type UserProfile,
} from "./reco/userProfile";
import type { Anime, Category, DiscoverPreset, DiscoveryPayload, FinalRecommendation, RecommendationPayload } from "./reco/types";

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

const ANILIST_MAX_RETRIES = 3;
const ANILIST_BASE_RETRY_MS = 700;
const ANILIST_REQUEST_GAP_MS = 120;
const ANILIST_MAX_CONCURRENT = 3;
const STEP2_MAX_PICKS = 12;
const STEP2_MIN_PICKS_FOR_FINAL = 3;
const STEP2_PRESET_LIMIT = 4;
const STEP2_DISCOVERY_PAGE_SIZE = 20;
const STEP2_DISCOVERY_BATCH_SIZE = 6;
const STEP2_DISCOVERY_EARLY_STOP_BUFFER = 40;
const STEP2_CATEGORY_CACHE_TTL_MS = 3 * 60 * 1000;
const STEP2_FALLBACK_PAGE_SIZE = 42;
const STEP2_FALLBACK_MIN_AVERAGE_SCORE = 52;
const STEP2_FALLBACK_MIN_POPULARITY = 500;

const { byMalId: KOREAN_TITLE_BY_MAL_ID, byAlias: KOREAN_TITLE_BY_KEY } = buildKoFallbackIndexes();

const KO_TITLE_CACHE_KEY = "voko_ko_title_cache_v1";
const KO_TITLE_MISS_KEY = "voko_ko_title_miss_v1";
const TMDB_API_KEY = (import.meta.env.VITE_TMDB_API_KEY as string | undefined)?.trim();
const HAS_LOCALIZE_API = Boolean((import.meta.env.VITE_LOCALIZE_ANIME_ENDPOINT as string | undefined)?.trim());
const TITLE_LOOKUP_MAX_CONCURRENT = 4;
const TITLE_LOOKUP_BATCH_SIZE = 12;

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
    const currentScore = (current.popularity ?? 0) + getScoreValue(current) * 100;
    const nextScore = (anime.popularity ?? 0) + getScoreValue(anime) * 100;
    if (nextScore > currentScore) map.set(key, anime);
  }
  return Array.from(map.values());
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
  const score = getScoreValue(anime) || "-";
  const year = anime.seasonYear ? `${anime.seasonYear}년작` : "연도 정보 없음";
  if (!genres.length) return `평균 평점 ${score} · ${year}`;
  return `장르: ${genres.join(", ")} · 평균 평점 ${score} · ${year}`;
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

function toUserFacingAniError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message || "";
  if (/failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(message.toLowerCase())) {
    return "네트워크 연결 문제로 AniList 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (/too many|rate|429/i.test(message.toLowerCase())) {
    return "요청이 몰려 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.";
  }
  return message || fallback;
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
      let res: Response;
      try {
        res = await fetch(ANILIST_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ query, variables }),
        });
      } catch (error) {
        if (attempt < maxRetries) {
          await sleep(ANILIST_BASE_RETRY_MS * 2 ** attempt);
          continue;
        }
        throw error instanceof Error ? error : new Error("AniList 네트워크 요청 실패");
      }

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

export default function App() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(CATEGORIES[0].id);
  const [activeStep, setActiveStep] = useState<1 | 2>(1);
  const [seenCategoryIds, setSeenCategoryIds] = useState<number[]>([]);
  const [shownStep2MediaIds, setShownStep2MediaIds] = useState<number[]>([]);

  const [categoryAnimes, setCategoryAnimes] = useState<Anime[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState("");

  const [pickedBaseAnimes, setPickedBaseAnimes] = useState<Anime[]>([]);
  const [dislikedBaseAnimeIds, setDislikedBaseAnimeIds] = useState<number[]>([]);

  const [finalRecs, setFinalRecs] = useState<FinalRecommendation[]>([]);
  const [finalLoading, setFinalLoading] = useState(false);
  const [finalError, setFinalError] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile>(createEmptyUserProfile());

  const [koTitleCache, setKoTitleCache] = useState<Record<string, string>>({});
  const lookupInFlight = useRef<Set<string>>(new Set());
  const lookupFailed = useRef<Set<string>>(new Set());
  const missingTitleMapRef = useRef<Record<string, MissingTitleRecord>>({});
  const shownStep2MediaIdsRef = useRef<number[]>([]);
  const userProfileRef = useRef<UserProfile>(createEmptyUserProfile());
  const anonUserIdRef = useRef<string>("");
  const sessionIdRef = useRef<string>("");
  const categoryCacheRef = useRef<Map<string, { cachedAt: number; items: Anime[] }>>(new Map());

  const selectedCategory = useMemo(
    () => CATEGORIES.find((c) => c.id === selectedCategoryId) ?? CATEGORIES[0],
    [selectedCategoryId],
  );
  const categoryStripItems = useMemo(
    () => CATEGORIES.map((category) => ({ id: category.id, label: category.label, imageUrl: category.previewImage })),
    [],
  );

  useEffect(() => {
    shownStep2MediaIdsRef.current = shownStep2MediaIds;
  }, [shownStep2MediaIds]);

  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  useEffect(() => {
    const anonUserId = getOrCreateAnonUserId();
    const sessionId = createSessionId();
    anonUserIdRef.current = anonUserId;
    sessionIdRef.current = sessionId;

    void ensureUserSession(anonUserId, sessionId, CATEGORIES[0].id).catch(() => {
      // ignore firestore optional failure
    });

    void readUserProfile(anonUserId)
      .then((profile) => {
        const safe = profile ?? createEmptyUserProfile();
        userProfileRef.current = safe;
        setUserProfile(safe);
      })
      .catch(() => {
        // ignore firestore optional failure
      });
  }, []);

  useEffect(() => {
    const anonUserId = anonUserIdRef.current;
    const sessionId = sessionIdRef.current;
    if (!anonUserId || !sessionId) return;
    void ensureUserSession(anonUserId, sessionId, selectedCategory.id).catch(() => {
      // ignore firestore optional failure
    });
  }, [selectedCategory.id]);

  function persistUserProfile(nextProfile: UserProfile): void {
    userProfileRef.current = nextProfile;
    setUserProfile(nextProfile);
    const anonUserId = anonUserIdRef.current;
    if (!anonUserId) return;
    void writeUserProfile(anonUserId, nextProfile).catch(() => {
      // ignore firestore optional failure
    });
  }

  function appendStepSnapshot(
    shownMediaIds: number[],
    likedMediaIds: number[],
    dislikedMediaIds: number[],
  ): void {
    const anonUserId = anonUserIdRef.current;
    const sessionId = sessionIdRef.current;
    if (!anonUserId || !sessionId) return;
    void appendSessionStep(anonUserId, sessionId, selectedCategory.id, {
      stepIndex: 2,
      shownMediaIds,
      likedMediaIds,
      dislikedMediaIds,
      timestamp: new Date().toISOString(),
    }).catch(() => {
      // ignore firestore optional failure
    });
  }

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

  function recoDebugEnabled(): boolean {
    const envDebug = ((import.meta.env.VITE_RECO_DEBUG as string | undefined) ?? "").trim().toLowerCase();
    if (envDebug === "1" || envDebug === "true" || envDebug === "on") return true;
    try {
      return localStorage.getItem("voko_reco_debug") === "1";
    } catch {
      return false;
    }
  }

  async function fetchCategoryAnimes(category: Category, mode: "reset" | "refresh" = "reset") {
    setCategoryLoading(true);
    setCategoryError("");
    if (mode === "reset") {
      setCategoryAnimes([]);
      setPickedBaseAnimes([]);
      setDislikedBaseAnimeIds([]);
      setFinalRecs([]);
      setFinalError("");
      setSeenCategoryIds([]);
      setShownStep2MediaIds([]);
    }

    const baseSeen = mode === "reset" ? [] : seenCategoryIds;
    const excludeIds = baseSeen.slice(-500);
    const excludeSet = new Set(excludeIds);
    const debug = recoDebugEnabled();

    function applyStep2List(nextList: Anime[]): void {
      const nextShownIds = nextList.slice(0, STEP2_TARGET_COUNT).map((anime) => anime.id);
      const nextLikedIds = mode === "reset" ? [] : pickedBaseAnimes.map((anime) => anime.id);
      const nextDislikedIds = mode === "reset" ? [] : dislikedBaseAnimeIds;

      setCategoryAnimes(nextList.slice(0, STEP2_TARGET_COUNT));
      setShownStep2MediaIds(nextShownIds);
      setSeenCategoryIds((prev) => {
        const base = mode === "reset" ? [] : prev;
        return Array.from(new Set([...base, ...nextList.map((a) => a.id)])).slice(-500);
      });

      const profileAfterExposure = updateExposureHistory(userProfileRef.current, nextShownIds);
      persistUserProfile(profileAfterExposure);
      appendStepSnapshot(nextShownIds, nextLikedIds, nextDislikedIds);
    }

    try {
      if (mode === "reset") {
        const cached = categoryCacheRef.current.get(category.id);
        if (cached && Date.now() - cached.cachedAt <= STEP2_CATEGORY_CACHE_TTL_MS) {
          if (debug) {
            console.info(`[RECO][STEP2] cache hit category=${category.id} items=${cached.items.length}`);
          }
          applyStep2List(cached.items);
          return;
        }
      }

      const presets = getCategoryDiscoveryPresets(category.id, category.genres).slice(0, STEP2_PRESET_LIMIT);
      const fallbackPresets: DiscoverPreset[] = [
        ...presets,
        {
          id: `${category.id}_fallback_all`,
          genreIn: category.genres,
          perPage: STEP2_FALLBACK_PAGE_SIZE,
        },
        ...category.genres.slice(0, 3).map((genre, index) => ({
          id: `${category.id}_fallback_genre_${index}`,
          genreIn: [genre],
          perPage: STEP2_FALLBACK_PAGE_SIZE,
        })),
      ];
      const uniqueFallbackPresets = Array.from(
        new Map(
          fallbackPresets.map((preset) => [
            `${preset.genreIn.join("|")}::${(preset.tagIn ?? []).join("|")}`,
            preset,
          ]),
        ).values(),
      ).slice(0, 8);
      const candidateById = new Map<number, Anime>();

      type DiscoveryPassOptions = {
        presetRows?: DiscoverPreset[];
        alignmentMode?: "strict" | "loose";
        allowSeenExclude?: boolean;
      };

      async function runDiscoveryPass(
        minAverageScore: number,
        minPopularity: number,
        page: number,
        perPage: number,
        sorts: Array<(typeof STEP2_DISCOVERY_SORTS)[number]>,
        options?: DiscoveryPassOptions,
      ): Promise<void> {
        const passPresets = options?.presetRows?.length ? options.presetRows : presets;
        const alignmentMode = options?.alignmentMode ?? "strict";
        const withExclude = options?.allowSeenExclude !== false;
        const plans = passPresets.flatMap((preset) =>
          sorts.map((sort) => ({
            genreIn: preset.genreIn.length ? preset.genreIn : category.genres,
            tagIn: preset.tagIn && preset.tagIn.length ? preset.tagIn : undefined,
            sort,
            perPage: preset.perPage ?? perPage,
            minAverageScore: preset.minAverageScore ?? minAverageScore,
            minPopularity: preset.minPopularity ?? minPopularity,
          })),
        );

        let successCount = 0;
        let failureCount = 0;
        let lastFailure: unknown = null;
        const queue = [...plans];

        while (queue.length) {
          if (candidateById.size >= STEP2_POOL_MAX + STEP2_DISCOVERY_EARLY_STOP_BUFFER) break;
          const batch = queue.splice(0, STEP2_DISCOVERY_BATCH_SIZE);
          const settled = await Promise.allSettled(
            batch.map((plan) =>
              aniFetch<DiscoveryPayload>(
                DISCOVERY_MEDIA_QUERY,
                {
                  genreIn: plan.genreIn,
                  tagIn: plan.tagIn,
                  sort: [plan.sort],
                  page,
                  perPage: plan.perPage,
                  excludeIds: withExclude ? excludeIds : undefined,
                  minAverageScore: plan.minAverageScore,
                  minPopularity: plan.minPopularity,
                },
                { retries: 2 },
              ),
            ),
          );

          settled.forEach((result, index) => {
            const plan = batch[index];
            if (result.status !== "fulfilled") {
              failureCount += 1;
              lastFailure = result.reason;
              return;
            }
            successCount += 1;
            const media = filterByCategory(category.id, result.value.Page?.media ?? [], alignmentMode);
            media.forEach((anime) => {
              if (withExclude && excludeSet.has(anime.id)) return;
              if ((anime.popularity ?? 0) < plan.minPopularity) return;
              if (getScoreValue(anime) < plan.minAverageScore) return;

              const prev = candidateById.get(anime.id);
              if (!prev) {
                candidateById.set(anime.id, anime);
              } else {
                const prevComposite = (prev.popularity ?? 0) + getScoreValue(prev) * 100;
                const nextComposite = (anime.popularity ?? 0) + getScoreValue(anime) * 100;
                if (nextComposite > prevComposite) candidateById.set(anime.id, anime);
              }
            });
          });
        }

        if (debug && failureCount > 0) {
          console.warn(`[RECO][STEP2] AniList partial failure ${failureCount}/${plans.length}`);
        }
        if (successCount === 0 && lastFailure) {
          throw lastFailure instanceof Error ? lastFailure : new Error("AniList 요청 실패");
        }
      }

      await runDiscoveryPass(
        STEP2_MIN_AVERAGE_SCORE,
        STEP2_MIN_POPULARITY,
        1,
        STEP2_DISCOVERY_PAGE_SIZE,
        STEP2_DISCOVERY_SORTS.slice(0, 2),
      );
      let candidatePool = dedupeByFranchise(Array.from(candidateById.values()));

      if (candidatePool.length < STEP2_POOL_MIN) {
        await runDiscoveryPass(
          STEP2_RELAXED_MIN_AVERAGE_SCORE,
          STEP2_RELAXED_MIN_POPULARITY,
          2,
          STEP2_DISCOVERY_PAGE_SIZE,
          STEP2_DISCOVERY_SORTS,
        );
        candidatePool = dedupeByFranchise(Array.from(candidateById.values()));
      }

      if (candidatePool.length < STEP2_TARGET_COUNT) {
        await runDiscoveryPass(
          STEP2_FALLBACK_MIN_AVERAGE_SCORE,
          STEP2_FALLBACK_MIN_POPULARITY,
          1,
          STEP2_FALLBACK_PAGE_SIZE,
          STEP2_DISCOVERY_SORTS,
          {
            presetRows: uniqueFallbackPresets,
            alignmentMode: "loose",
          },
        );

        if (candidateById.size < STEP2_TARGET_COUNT && excludeIds.length) {
          await runDiscoveryPass(
            STEP2_FALLBACK_MIN_AVERAGE_SCORE,
            STEP2_FALLBACK_MIN_POPULARITY,
            2,
            STEP2_FALLBACK_PAGE_SIZE,
            STEP2_DISCOVERY_SORTS.slice(0, 2),
            {
              presetRows: uniqueFallbackPresets,
              alignmentMode: "loose",
              allowSeenExclude: false,
            },
          );
        }

        candidatePool = dedupeByFranchise(Array.from(candidateById.values()));
      }

      candidatePool = candidatePool
        .sort((a, b) => {
          const bScore = (b.popularity ?? 0) + getScoreValue(b) * 120 + Math.max(0, b.trending ?? 0) * 0.1;
          const aScore = (a.popularity ?? 0) + getScoreValue(a) * 120 + Math.max(0, a.trending ?? 0) * 0.1;
          return bScore - aScore;
        })
        .slice(0, STEP2_POOL_MAX);

      candidatePool = filterByCategory(category.id, candidatePool, "strict");

      if (!candidatePool.length) {
        setCategoryError("새로 보여줄 작품이 부족합니다. 카테고리를 바꿔보세요.");
        setCategoryAnimes([]);
        return;
      }

      const selection = selectStep2DiverseCandidates(candidatePool, {
        total: STEP2_TARGET_COUNT,
        getFranchiseKey: franchiseKey,
        exposureHistory: userProfileRef.current.exposureHistory,
      });
      const nextList = filterByCategory(category.id, selection.selected, "strict");

      if (debug) {
        console.groupCollapsed(`[RECO][STEP2] ${category.id} selected=${nextList.length} pool=${selection.poolSize}`);
        console.log("yearTargets", selection.yearTargets, "formatTargets", selection.formatTargets);
        console.table(
          selection.debugRows.slice(0, 50).map((row, index) => ({
            rank: index + 1,
            id: row.animeId,
            title: row.title,
            score: Number(row.score.toFixed(3)),
            quality: Number(row.quality.toFixed(3)),
            diversityGain: Number(row.diversityGain.toFixed(3)),
            redundancy: Number(row.redundancyPenalty.toFixed(3)),
            exposurePenalty: Number(row.exposurePenalty.toFixed(3)),
            year: row.year ?? "-",
            format: row.format ?? "-",
            yearBucket: row.yearBucket,
            topTags: row.topTags.join(", "),
            studios: row.studios.join(", "),
          })),
        );
        console.groupEnd();
      }

      const step2List = nextList.slice(0, STEP2_TARGET_COUNT);
      categoryCacheRef.current.set(category.id, {
        cachedAt: Date.now(),
        items: step2List,
      });
      applyStep2List(step2List);
    } catch (error) {
      setCategoryError(toUserFacingAniError(error, "목록을 가져오지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setCategoryLoading(false);
    }
  }

  function toggleBasePick(anime: Anime) {
    const exists = pickedBaseAnimes.some((item) => item.id === anime.id);
    let nextPicked = pickedBaseAnimes;
    let nextDisliked = dislikedBaseAnimeIds;
    let feedback: FeedbackSignal;

    if (exists) {
      nextPicked = pickedBaseAnimes.filter((item) => item.id !== anime.id);
      nextDisliked = Array.from(new Set([...dislikedBaseAnimeIds, anime.id])).slice(-PROFILE_EXPOSURE_LIMIT);
      feedback = "dislike";
    } else {
      if (pickedBaseAnimes.length >= STEP2_MAX_PICKS) return;
      nextPicked = [...pickedBaseAnimes, anime];
      nextDisliked = dislikedBaseAnimeIds.filter((id) => id !== anime.id);
      feedback = "like";
    }

    setPickedBaseAnimes(nextPicked);
    setDislikedBaseAnimeIds(nextDisliked);
    setFinalRecs([]);
    setFinalError("");

    const nextProfile = updateProfileFromFeedback(userProfileRef.current, anime, feedback);
    persistUserProfile(nextProfile);
    appendStepSnapshot(shownStep2MediaIdsRef.current, nextPicked.map((item) => item.id), nextDisliked);

    if (recoDebugEnabled()) {
      console.debug("[RECO][PROFILE][FEEDBACK]", {
        mediaId: anime.id,
        feedback,
        likedTopTags: topLikedTags(nextProfile, 6),
        dislikedTopTags: topDislikedTags(nextProfile, 6),
      });
    }
  }

  async function makeFinalRecommendations() {
    if (pickedBaseAnimes.length < STEP2_MIN_PICKS_FOR_FINAL) {
      setFinalError(`최소 ${STEP2_MIN_PICKS_FOR_FINAL}개 이상 선택해 주세요.`);
      return;
    }

    setFinalLoading(true);
    setFinalError("");

    try {
      const debug = recoDebugEnabled();
      const allowedFormats = new Set(["TV", "OVA", "ONA", "TV_SHORT"]);
      const seedPreference = buildSeedPreferenceVector(pickedBaseAnimes);
      const seedSet = new Set(pickedBaseAnimes.map((item) => item.id));
      const seedIds = Array.from(seedSet);
      const rawQueryTagWeight = new Map<string, number>();
      pickedBaseAnimes.forEach((seed, index) => {
        const recencyWeight = 1 + index / Math.max(1, pickedBaseAnimes.length - 1);
        (seed.tags ?? []).forEach((tag) => {
          const tagName = tag.name?.trim();
          if (!tagName) return;
          const weighted = Math.max(1, (tag.rank ?? 30) / 10) * recencyWeight;
          rawQueryTagWeight.set(tagName, (rawQueryTagWeight.get(tagName) ?? 0) + weighted);
        });
      });
      const topTagsForQuery = [...rawQueryTagWeight.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([name]) => name);

      const graphCandidates = new Map<number, Anime>();

      const graphSettled = await Promise.allSettled(
        seedIds.slice(0, 8).map((id) =>
          aniFetch<RecommendationPayload>(RECOMMENDATION_QUERY, { id }, { retries: 2 }),
        ),
      );
      const graphResponses = graphSettled
        .filter((result): result is PromiseFulfilledResult<RecommendationPayload> => result.status === "fulfilled")
        .map((result) => result.value);
      if (!graphResponses.length) {
        const firstFailure = graphSettled.find((result) => result.status === "rejected");
        throw firstFailure?.reason instanceof Error ? firstFailure.reason : new Error("추천 그래프 요청 실패");
      }
      if (debug) {
        const failureCount = graphSettled.filter((result) => result.status === "rejected").length;
        if (failureCount > 0) console.warn(`[RECO][FINAL] graph partial failure ${failureCount}/${graphSettled.length}`);
      }

      graphResponses.forEach((response) => {
        (response.Media?.recommendations?.nodes ?? []).forEach((node) => {
          const candidate = node.mediaRecommendation;
          if (!candidate || seedSet.has(candidate.id)) return;
          if (candidate.format && !allowedFormats.has(candidate.format)) return;
          if (!isCategoryAligned(selectedCategory.id, candidate)) return;
          if (!graphCandidates.has(candidate.id)) graphCandidates.set(candidate.id, candidate);
        });
      });

      const presets = getCategoryDiscoveryPresets(selectedCategory.id, selectedCategory.genres).slice(0, 3);
      const discoverPlans = [
        ...STEP2_DISCOVERY_SORTS.map((sort) => ({
          genreIn: selectedCategory.genres,
          tagIn: topTagsForQuery.slice(0, 10),
          sort,
          page: 1,
          perPage: 80,
          minAverageScore: STEP2_RELAXED_MIN_AVERAGE_SCORE,
          minPopularity: STEP2_RELAXED_MIN_POPULARITY,
        })),
        ...presets.map((preset) => ({
          genreIn: preset.genreIn.length ? preset.genreIn : selectedCategory.genres,
          tagIn: preset.tagIn?.length ? preset.tagIn : topTagsForQuery.slice(0, 6),
          sort: "POPULARITY_DESC" as const,
          page: 1,
          perPage: 48,
          minAverageScore: STEP2_RELAXED_MIN_AVERAGE_SCORE,
          minPopularity: STEP2_RELAXED_MIN_POPULARITY,
        })),
        {
          genreIn: selectedCategory.genres,
          tagIn: topTagsForQuery.slice(0, 8),
          sort: "TRENDING_DESC" as const,
          page: 2,
          perPage: 60,
          minAverageScore: STEP2_RELAXED_MIN_AVERAGE_SCORE,
          minPopularity: STEP2_RELAXED_MIN_POPULARITY,
        },
      ];

      const discoverSettled = await Promise.allSettled(
        discoverPlans.map((plan) =>
          aniFetch<DiscoveryPayload>(
            DISCOVERY_MEDIA_QUERY,
            {
              genreIn: plan.genreIn,
              tagIn: plan.tagIn.length ? plan.tagIn : undefined,
              sort: [plan.sort],
              page: plan.page,
              perPage: plan.perPage,
              excludeIds: seedIds,
              minAverageScore: plan.minAverageScore,
              minPopularity: plan.minPopularity,
            },
            { retries: 2 },
          ),
        ),
      );
      const discoverResponses = discoverSettled
        .filter((result): result is PromiseFulfilledResult<DiscoveryPayload> => result.status === "fulfilled")
        .map((result) => result.value);
      if (!discoverResponses.length) {
        const firstFailure = discoverSettled.find((result) => result.status === "rejected");
        throw firstFailure?.reason instanceof Error ? firstFailure.reason : new Error("추천 탐색 요청 실패");
      }
      if (debug) {
        const failureCount = discoverSettled.filter((result) => result.status === "rejected").length;
        if (failureCount > 0) {
          console.warn(`[RECO][FINAL] discovery partial failure ${failureCount}/${discoverSettled.length}`);
        }
      }

      const mergedCandidates = new Map<number, Anime>();
      graphCandidates.forEach((anime) => mergedCandidates.set(anime.id, anime));
      discoverResponses.forEach((response) => {
        (response.Page?.media ?? []).forEach((anime) => {
          if (seedSet.has(anime.id)) return;
          if (anime.format && !allowedFormats.has(anime.format)) return;
          if (!isCategoryAligned(selectedCategory.id, anime)) return;
          if ((anime.popularity ?? 0) < STEP2_RELAXED_MIN_POPULARITY) return;
          if (getScoreValue(anime) < STEP2_RELAXED_MIN_AVERAGE_SCORE) return;

          const prev = mergedCandidates.get(anime.id);
          if (!prev) {
            mergedCandidates.set(anime.id, anime);
          } else {
            const prevComposite = (prev.popularity ?? 0) + getScoreValue(prev) * 100;
            const nextComposite = (anime.popularity ?? 0) + getScoreValue(anime) * 100;
            if (nextComposite > prevComposite) mergedCandidates.set(anime.id, anime);
          }
        });
      });

      const candidatePool = dedupeByFranchise(Array.from(mergedCandidates.values()))
        .filter((anime) => !seedSet.has(anime.id))
        .filter((anime) => isCategoryAligned(selectedCategory.id, anime))
        .slice(0, STEP2_POOL_MAX);

      const semanticSimilarityById = buildSemanticSimilarityMap(pickedBaseAnimes, candidatePool);
      const profileForScore = userProfileRef.current;
      const scored = candidatePool
        .map((anime) => {
          const semanticSimilarity = semanticSimilarityById.get(anime.id);
          const { breakdown, tagVector } = scoreFinalCandidate(anime, seedPreference, {
            semanticSimilarity,
          });
          const profileScore = scoreWithProfile(anime, profileForScore);
          const total = Math.max(0, Math.min(1, breakdown.total + profileScore.total));
          const candidate = {
            anime,
            tagVector,
            dominantTags: dominantTagNames(anime, 4),
            breakdown: {
              ...breakdown,
              profileBonus: profileScore.total,
              total,
            },
            reason: "",
          };
          candidate.reason = buildFinalReason(candidate);
          if (profileScore.total >= 0.05 && profileScore.matchedLikedTags.length) {
            candidate.reason = `${candidate.reason} 프로필 선호 태그(${profileScore.matchedLikedTags.slice(0, 2).join(", ")})도 반영했습니다.`;
          } else if (profileScore.total <= -0.05 && profileScore.matchedDislikedTags.length) {
            candidate.reason = `${candidate.reason} 비선호 태그(${profileScore.matchedDislikedTags.slice(0, 2).join(", ")}) 중복을 낮췄습니다.`;
          }
          return candidate;
        })
        .sort((a, b) => b.breakdown.total - a.breakdown.total);

      if (!scored.length) {
        setFinalError("추천 후보를 충분히 찾지 못했습니다. 다른 작품 조합으로 다시 시도해 주세요.");
        setFinalRecs([]);
        return;
      }

      const mmrResult = selectFinalWithMMR(scored, {
        getFranchiseKey: franchiseKey,
        topN: FINAL_MMR_TOP_N,
      });

      const selected = [...mmrResult.selected.slice(0, 4)];
      if (selected.length < 4) {
        const usedIds = new Set(selected.map((item) => item.anime.id));
        const usedFranchises = new Set(selected.map((item) => franchiseKey(item.anime)));
        for (const candidate of scored) {
          const franchise = franchiseKey(candidate.anime);
          if (usedIds.has(candidate.anime.id) || usedFranchises.has(franchise)) continue;
          selected.push(candidate);
          usedIds.add(candidate.anime.id);
          usedFranchises.add(franchise);
          if (selected.length >= 4) break;
        }
      }

      if (debug) {
        console.groupCollapsed(`[RECO][FINAL] seeds=${pickedBaseAnimes.length} candidates=${scored.length}`);
        console.log("queryTopTags", topTagsForQuery.slice(0, 12));
        console.log("preferenceTopTags", topPreferenceTags(seedPreference, 10));
        console.log("semanticAvg", Number((scored.reduce((acc, row) => acc + row.breakdown.semantic, 0) / Math.max(1, scored.length)).toFixed(3)));
        console.log("profileLikedTop", topLikedTags(profileForScore, 8));
        console.log("profileDislikedTop", topDislikedTags(profileForScore, 8));
        console.log("profileExposureCount", profileForScore.exposureHistory.length);
        console.table(
          mmrResult.debugRows.map((row, index) => ({
            rank: index + 1,
            id: row.animeId,
            title: row.title,
            base: Number((row.base * 100).toFixed(1)),
            mmr: Number((row.mmr * 100).toFixed(1)),
            sim: Number((row.similarity * 100).toFixed(1)),
            quality: Number((row.quality * 100).toFixed(1)),
            novelty: Number((row.novelty * 100).toFixed(1)),
            profile: Number(((row.profileBonus ?? 0) * 100).toFixed(1)),
            redundancy: Number((row.redundancy * 100).toFixed(1)),
            year: row.year ?? "-",
            format: row.format ?? "-",
            tags: row.keyTags.join(", "),
          })),
        );
        console.groupEnd();
      }

      setFinalRecs(
        selected.map((item) => ({
          anime: item.anime,
          score: item.breakdown.total * 100,
          reason: item.reason,
        })),
      );
    } catch (error) {
      setFinalError(toUserFacingAniError(error, "추천 결과를 만들지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setFinalLoading(false);
    }
  }

  function handleCategoryPick(categoryId: string): void {
    const category = CATEGORIES.find((row) => row.id === categoryId);
    if (!category) return;
    setSelectedCategoryId(category.id);
    setActiveStep(2);
    void fetchCategoryAnimes(category, "reset");
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
      }).slice(0, TITLE_LOOKUP_BATCH_SIZE);
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
        <h1>취향 고르면, 딱 맞는 다음 애니 추천해줄게</h1>
        <p className="hero-guide">카테고리 1개 선택 → 취향 기반 추천 4개를 바로 보여줘요</p>
      </header>

      {activeStep === 1 && (
      <section className="flow-panel step1-panel">
        <p className="step1-lead">먼저 원하는 분위기의 카테고리를 하나 골라주세요.</p>
        <CategoryStrip items={categoryStripItems} onPick={handleCategoryPick} />
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
                    loading={index < 2 ? "eager" : "lazy"}
                    fetchPriority={index < 2 ? "high" : "low"}
                    decoding="async"
                  />
                  <div className="card-body">
                    <h4>{getTitle(anime, koTitleCache)}</h4>
                    <p>{buildKoreanSummary(anime)}</p>
                    <div className="meta-row">
                      <span>★ {getScoreValue(anime) || "-"}</span>
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
                      <span>평점 {getScoreValue(item.anime) || "-"}</span>
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
