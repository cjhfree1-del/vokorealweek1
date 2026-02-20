import { useEffect, useMemo, useRef, useState } from "react";

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
  genre: string;
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

const CATEGORIES: Category[] = [
  { id: "lovecom", label: "러브코미디", genre: "Romance" },
  { id: "action", label: "액션", genre: "Action" },
  { id: "fantasy", label: "판타지", genre: "Fantasy" },
  { id: "thriller", label: "스릴러/미스터리", genre: "Thriller" },
];

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
const CATEGORY_MIN_SCORE = 62;
const CATEGORY_MIN_POPULARITY = 8000;

const KOREAN_TITLE_BY_KEY: Record<string, string> = {
  "attack on titan": "진격의 거인",
  "shingeki no kyojin": "진격의 거인",
  "demon slayer": "귀멸의 칼날",
  "kimetsu no yaiba": "귀멸의 칼날",
  "jujutsu kaisen": "주술회전",
  "one piece": "원피스",
  naruto: "나루토",
  "naruto: shippuden": "나루토 질풍전",
  bleach: "블리치",
  "spy x family": "스파이 패밀리",
  "frieren: beyond journey's end": "장송의 프리렌",
  "sousou no frieren": "장송의 프리렌",
  "death note": "데스노트",
  "steins;gate": "슈타인즈 게이트",
  "fullmetal alchemist: brotherhood": "강철의 연금술사 브라더후드",
  "my hero academia": "나의 히어로 아카데미아",
  "bocchi the rock!": "봇치 더 록!",
  "kaguya-sama: love is war": "카구야 님은 고백받고 싶어",
  "re:zero -starting life in another world-": "리제로",
  "re:zero kara hajimeru isekai seikatsu": "리제로",
  "tokyo revengers": "도쿄 리벤저스",
};

const KOREAN_TITLE_BY_MAL_ID: Record<number, string> = {
  16498: "진격의 거인",
  5114: "강철의 연금술사 브라더후드",
  30276: "원펀맨",
  9253: "슈타인즈 게이트",
  1535: "데스노트",
  38000: "귀멸의 칼날",
  40748: "주술회전",
  21: "원피스",
  11061: "헌터×헌터",
  44511: "장송의 프리렌",
  42249: "도쿄 리벤저스",
  20583: "하이큐!!",
  47: "아키라",
  11757: "소드 아트 온라인",
  28851: "목소리의 형태",
  1649: "에반게리온",
  1575: "코드 기아스",
  35849: "바이올렛 에버가든",
  38408: "귀멸의 칼날 무한열차편",
};

const KO_TITLE_CACHE_KEY = "voko_ko_title_cache_v1";
const TMDB_API_KEY = (import.meta.env.VITE_TMDB_API_KEY as string | undefined)?.trim();

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasHangul(value?: string): value is string {
  return !!value && /[가-힣]/.test(value);
}

function cacheKey(anime: Anime): string {
  return anime.idMal ? `mal:${anime.idMal}` : `ani:${anime.id}`;
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
  if (fromSynonym) return fromSynonym.trim();
  if (hasHangul(anime.title.native)) return anime.title.native.trim();
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

function franchiseKey(anime: Anime): string {
  const baseTitle = anime.title.english || anime.title.romaji || anime.title.native || String(anime.id);
  return normalizeTitle(baseTitle)
    .replace(/[:\-|].*$/g, "")
    .replace(/\b(\d+th|\d+nd|\d+rd|\d+st)\s+season\b/g, "")
    .replace(/\bseason\s+\d+\b/g, "")
    .replace(/\bpart\s+\d+\b/g, "")
    .replace(/\b(movie|special|ova|ona)\b/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  const cached = koTitleCache[cacheKey(anime)];
  if (cached) return cached;

  const staticMapped = titleFromStaticMap(anime);
  if (staticMapped) return staticMapped;

  const fromSynonyms = titleFromSynonyms(anime);
  if (fromSynonyms) return fromSynonyms;

  const english = anime.title.english?.trim();
  const romaji = anime.title.romaji?.trim();
  if (english) return english;
  if (romaji) return romaji;
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
    "Slice of Life": "일상",
    Supernatural: "초자연",
    Horror: "호러",
  };
  return map[genre] ?? genre;
}

function cleanDescription(description?: string): string {
  if (!description) return "작품 설명 정보가 아직 등록되지 않았습니다.";
  const cleaned = description.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 180)}...` : cleaned;
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
let aniRequestQueue: Promise<void> = Promise.resolve();

async function aniFetch<T>(
  query: string,
  variables: Record<string, unknown>,
  options?: { retries?: number },
): Promise<T> {
  const run = async (): Promise<T> => {
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
  };

  const request = aniRequestQueue.then(run, run);
  aniRequestQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}

function scoreCandidate(candidate: Anime, seeds: Anime[]): number {
  const seedGenres = new Map<string, number>();
  const seedTags = new Map<string, number>();

  seeds.forEach((seed) => {
    (seed.genres ?? []).forEach((genre) => {
      seedGenres.set(genre, (seedGenres.get(genre) ?? 0) + 1);
    });
    (seed.tags ?? []).forEach((tag) => {
      if (!tag.name) return;
      const weight = ((tag.rank ?? 50) / 100) * 1.2;
      seedTags.set(tag.name, (seedTags.get(tag.name) ?? 0) + weight);
    });
  });

  let similarity = 0;
  (candidate.genres ?? []).forEach((genre) => {
    similarity += (seedGenres.get(genre) ?? 0) * 8;
  });
  (candidate.tags ?? []).forEach((tag) => {
    if (!tag.name) return;
    similarity += (seedTags.get(tag.name) ?? 0) * 5;
  });

  const scoreBonus = ((candidate.meanScore ?? 65) - 60) * 0.5;
  const popularityBonus = Math.min(15, Math.log10((candidate.popularity ?? 1) + 1) * 5);
  return similarity + scoreBonus + popularityBonus;
}

function buildReason(candidate: Anime, seeds: Anime[], graphSignal = 0): string {
  const seedGenreSet = new Set(seeds.flatMap((seed) => seed.genres ?? []));
  const matchedGenres = (candidate.genres ?? []).filter((genre) => seedGenreSet.has(genre));

  if (graphSignal > 0) {
    if (matchedGenres.length) {
      return `AniList 추천 그래프 신호가 강하고 ${matchedGenres.slice(0, 2).map(toKoreanGenre).join(", ")} 장르 결도 잘 맞습니다.`;
    }
    return "AniList 사용자 추천 그래프에서 선택작과 함께 자주 추천되는 작품입니다.";
  }

  if (matchedGenres.length >= 2) {
    return `선택한 작품들과 ${matchedGenres.slice(0, 2).map(toKoreanGenre).join(", ")} 장르 결이 강하게 맞습니다.`;
  }

  if (matchedGenres.length === 1) {
    return `${toKoreanGenre(matchedGenres[0])} 감성을 유지하면서 다른 전개를 보여주는 작품입니다.`;
  }

  if ((candidate.meanScore ?? 0) >= 80) {
    return "평점이 높고 완성도 신호가 좋아 입문/정주행용으로 추천됩니다.";
  }

  return "현재 선택한 취향과의 태그/장르 유사도를 기준으로 뽑힌 추천입니다.";
}

export default function App() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(CATEGORIES[0].id);
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);
  const [seenCategoryIds, setSeenCategoryIds] = useState<number[]>([]);
  const [categoryPreviewMap, setCategoryPreviewMap] = useState<Record<string, Anime | undefined>>({});

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
  const previewInFlight = useRef<Set<string>>(new Set());

  const selectedCategory = useMemo(
    () => CATEGORIES.find((c) => c.id === selectedCategoryId) ?? CATEGORIES[0],
    [selectedCategoryId],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KO_TITLE_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      setKoTitleCache(parsed);
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

  async function ensureCategoryPreview(category: Category): Promise<void> {
    if (categoryPreviewMap[category.id] || previewInFlight.current.has(category.id)) return;

    previewInFlight.current.add(category.id);
    try {
      const data = await aniFetch<CategoryBucketPayload>(
        CATEGORY_BUCKET_QUERY,
        {
          genreIn: [category.genre],
          excludeIds: [],
          minScore: CATEGORY_MIN_SCORE,
          minPopularity: CATEGORY_MIN_POPULARITY,
        },
        { retries: 2 },
      );

      const candidates = shuffleArray(collectCategoryBuckets(data));
      const picked = candidates[0];
      if (picked) {
        setCategoryPreviewMap((prev) => (prev[category.id] ? prev : { ...prev, [category.id]: picked }));
      }
    } catch {
      // ignore preview fetch failures
    } finally {
      previewInFlight.current.delete(category.id);
    }
  }

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

    try {
      const strictPayload = await aniFetch<CategoryBucketPayload>(CATEGORY_BUCKET_QUERY, {
        genreIn: [category.genre],
        excludeIds,
        minScore: CATEGORY_MIN_SCORE,
        minPopularity: CATEGORY_MIN_POPULARITY,
      });

      let nextList = shuffleArray(collectCategoryBuckets(strictPayload)).slice(0, 24);

      if (nextList.length < 18) {
        const relaxedExclude = Array.from(new Set([...excludeIds, ...nextList.map((item) => item.id)])).slice(-350);
        const relaxedPayload = await aniFetch<CategoryBucketPayload>(CATEGORY_BUCKET_QUERY, {
          genreIn: [category.genre],
          excludeIds: relaxedExclude,
          minScore: 0,
          minPopularity: 0,
        });
        nextList = shuffleArray(dedupeByFranchise([...nextList, ...collectCategoryBuckets(relaxedPayload)])).slice(0, 24);
      }

      if (!nextList.length) setCategoryError("새로 보여줄 작품이 부족합니다. 카테고리를 바꿔보세요.");

      setCategoryAnimes(nextList);
      if (nextList[0]) {
        setCategoryPreviewMap((prev) => (prev[category.id] ? prev : { ...prev, [category.id]: nextList[0] }));
      }
      setSeenCategoryIds((prev) => {
        const base = mode === "reset" ? [] : prev;
        return Array.from(new Set([...base, ...nextList.map((a) => a.id)]));
      });
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : "카테고리 로딩 실패");
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
      if (prev.length >= 6) return prev;
      return [...prev, anime];
    });
    setFinalRecs([]);
  }

  async function makeFinalRecommendations() {
    if (pickedBaseAnimes.length < 3) {
      setFinalError("최소 3개 이상 선택하면 추천 정확도가 올라갑니다.");
      return;
    }

    setFinalLoading(true);
    setFinalError("");

    try {
      const allowedFormats = new Set(["TV", "OVA", "ONA", "TV_SHORT"]);
      const topGenres = Array.from(new Set(pickedBaseAnimes.flatMap((s) => s.genres ?? []))).slice(0, 5);
      const topTags = extractTopTags(pickedBaseAnimes, 6);
      const seedSet = new Set(pickedBaseAnimes.map((item) => item.id));
      const seedIds = Array.from(seedSet);

      const graphScoreById = new Map<number, number>();
      const graphCandidates = new Map<number, Anime>();

      const graphResponses = await Promise.all(
        seedIds.slice(0, 4).map((id) =>
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
        genreIn: topGenres.length ? topGenres : [selectedCategory.genre],
        page: 1,
        perPage: 80,
        excludeIds: seedIds,
      };
      if (topTags.length) {
        finalVariables.tagIn = topTags;
        finalVariables.minimumTagRank = 35;
      }

      const fallbackData = await aniFetch<{ Page: { media: Anime[] } }>(FINAL_CANDIDATE_QUERY, finalVariables);
      const mergedCandidates = new Map<number, Anime>();
      graphCandidates.forEach((anime) => mergedCandidates.set(anime.id, anime));
      dedupeByFranchise(fallbackData.Page.media ?? [])
        .filter((anime) => !seedSet.has(anime.id))
        .forEach((anime) => {
          if (!mergedCandidates.has(anime.id)) mergedCandidates.set(anime.id, anime);
        });

      const ranked = dedupeByFranchise(Array.from(mergedCandidates.values()))
        .filter((anime) => !seedSet.has(anime.id))
        .map((anime) => ({
          anime,
          score:
            scoreCandidate(anime, pickedBaseAnimes) +
            (graphScoreById.get(anime.id) ?? 0) +
            ((anime.meanScore ?? 65) - 60) * 0.4 +
            Math.min(8, Math.log10((anime.popularity ?? 1) + 1) * 3),
          reason: buildReason(anime, pickedBaseAnimes, graphScoreById.get(anime.id) ?? 0),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

      setFinalRecs(ranked);
    } catch (error) {
      setFinalError(error instanceof Error ? error.message : "추천 생성 실패");
    } finally {
      setFinalLoading(false);
    }
  }

  useEffect(() => {
    void ensureCategoryPreview(selectedCategory);
  }, [selectedCategory]);

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
      for (const anime of visibleAnimesForKoLookup) {
        const key = cacheKey(anime);
        if (koTitleCache[key] || lookupInFlight.current.has(key) || lookupFailed.current.has(key)) continue;

        const staticMapped = titleFromStaticMap(anime);
        if (staticMapped) {
          setKoTitleCache((prev) => (prev[key] ? prev : { ...prev, [key]: staticMapped }));
          continue;
        }

        const synonymMapped = titleFromSynonyms(anime);
        if (synonymMapped) {
          setKoTitleCache((prev) => (prev[key] ? prev : { ...prev, [key]: synonymMapped }));
          continue;
        }

        lookupInFlight.current.add(key);
        try {
          let resolvedTitle: string | null = null;

          if (anime.idMal) {
            const wikidataKo = await fetchKoreanTitleFromWikidata(anime.idMal);
            if (wikidataKo) resolvedTitle = wikidataKo;
          }

          const wikiCandidates = [anime.title.english, anime.title.romaji]
            .filter((v): v is string => !!v)
            .slice(0, 2);
          if (!resolvedTitle) {
            for (const titleCandidate of wikiCandidates) {
              const wikiKo = await fetchKoreanTitleFromWikipediaByTitle(titleCandidate);
              if (wikiKo) {
                resolvedTitle = wikiKo;
                break;
              }
            }
          }

          if (!resolvedTitle) {
            const tmdbKo = await fetchKoreanTitleFromTMDB(anime);
            if (tmdbKo) resolvedTitle = tmdbKo;
          }

          if (resolvedTitle) {
            setKoTitleCache((prev) => (prev[key] ? prev : { ...prev, [key]: resolvedTitle! }));
          } else {
            lookupFailed.current.add(key);
          }
        } finally {
          lookupInFlight.current.delete(key);
        }
      }
    }

    void resolveKoreanTitles();
  }, [visibleAnimesForKoLookup, koTitleCache]);

  return (
    <div className={`page ${!categoryAnimes.length && !finalRecs.length ? "landing" : ""}`}>
      <header className="hero">
        <p className="kicker">OTAKU MATCHMAKER</p>
        <h1>취향 고르면, 딱 맞는 다음 애니를 추천해줄게</h1>
        <p>카테고리 선택 → 재밌게 본 애니 선택 → 최종 추천(4작품)</p>
      </header>

      <section className="flow-panel step1-panel">
        <h2>STEP 1. 카테고리 선택</h2>
        <div className="chip-group" onMouseLeave={() => setHoveredCategoryId(null)}>
          {CATEGORIES.map((category) => {
            const preview = categoryPreviewMap[category.id];
            const isPreviewVisible = hoveredCategoryId === category.id;
            return (
              <button
                key={category.id}
                className={`chip-btn ${selectedCategoryId === category.id ? "active" : ""}`}
                onMouseEnter={() => {
                  setHoveredCategoryId(category.id);
                  void ensureCategoryPreview(category);
                }}
                onFocus={() => {
                  setHoveredCategoryId(category.id);
                  void ensureCategoryPreview(category);
                }}
                onClick={() => {
                  setSelectedCategoryId(category.id);
                  void fetchCategoryAnimes(category, "reset");
                }}
              >
                <span className="chip-label">{category.label}</span>
                <span className={`chip-preview ${isPreviewVisible ? "show" : ""}`}>
                  {preview ? (
                    <img src={preview.coverImage?.large || preview.coverImage?.medium || ""} alt={`${category.label} 대표작`} />
                  ) : (
                    <span className="chip-preview-loading">대표작 불러오는 중...</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {categoryLoading && <p className="loading-text">카테고리 애니 불러오는 중...</p>}
        {categoryError && <p className="error-text">{categoryError}</p>}
      </section>

      {!!categoryAnimes.length && (
        <section className="panel">
          <h2>STEP 2. 재밌게 본 애니 고르기 (최대 6개)</h2>
          <p className="source-note">트렌딩/인기/평점 버킷에서 중복 제거 후 보여줍니다.</p>
          <div className="step2-topbar">
            <p className="picked-count">선택됨: {pickedBaseAnimes.length}/6</p>
            <button
              className="primary-btn"
              onClick={() => void fetchCategoryAnimes(selectedCategory, "refresh")}
              disabled={categoryLoading}
            >
              {categoryLoading ? "새 목록 준비 중..." : "새 목록 보기"}
            </button>
          </div>

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

          <div className="grid cards">
            {categoryAnimes.map((anime) => {
              const selected = pickedBaseAnimes.some((item) => item.id === anime.id);
              return (
                <article
                  key={anime.id}
                  className={`anime-card ${selected ? "selected" : ""}`}
                  onClick={() => toggleBasePick(anime)}
                >
                  <img src={anime.coverImage?.medium || anime.coverImage?.large || ""} alt={getTitle(anime, koTitleCache)} />
                  <div>
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

          <button className="primary-btn strong" onClick={() => void makeFinalRecommendations()} disabled={finalLoading}>
            {finalLoading ? "추천 생성 중..." : "최종 추천 받기"}
          </button>
          {finalError && <p className="error-text">{finalError}</p>}
        </section>
      )}

      {!!finalRecs.length && (
        <section className="panel result-panel motion-in">
          <h2>최종 추천 4작품</h2>
          <p className="source-note">AniList 추천 그래프 신호 + 장르/태그 유사도 기반 결과입니다.</p>
          <div className="grid cards result-grid">
            {finalRecs.map((item) => (
              <article key={item.anime.id} className="anime-card result large">
                <img src={item.anime.coverImage?.medium || item.anime.coverImage?.large || ""} alt={getTitle(item.anime, koTitleCache)} />
                <div>
                  <h4>{getTitle(item.anime, koTitleCache)}</h4>
                  <p className="reason">추천 이유: {item.reason}</p>
                  <p>{cleanDescription(item.anime.description)}</p>
                  <div className="meta-row">
                    <span>평점 {item.anime.meanScore ?? "-"}</span>
                    <span>추천점수 {Math.round(item.score)}</span>
                  </div>
                  <div className="tag-row">
                    {(item.anime.genres ?? []).slice(0, 4).map((g) => (
                      <span key={g}>#{toKoreanGenre(g)}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer className="footer-note">
        <p>Data by AniList API · 한글 제목은 ID 기반(Wikidata) 우선으로 보강됩니다.</p>
      </footer>
    </div>
  );
}
