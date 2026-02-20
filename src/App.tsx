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

const CATEGORIES: Category[] = [
  { id: "lovecom", label: "러브코미디", genre: "Romance" },
  { id: "action", label: "액션", genre: "Action" },
  { id: "fantasy", label: "판타지", genre: "Fantasy" },
  { id: "thriller", label: "스릴러/미스터리", genre: "Thriller" },
];

const CATEGORY_ANIME_QUERY = `
query ($genreIn: [String], $page: Int, $perPage: Int, $sort: [MediaSort]) {
  Page(page: $page, perPage: $perPage) {
    media(
      type: ANIME,
      status_not_in: [NOT_YET_RELEASED],
      genre_in: $genreIn,
      sort: $sort
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

const CATEGORY_SORT_OPTIONS: string[][] = [
  ["TRENDING_DESC", "POPULARITY_DESC"],
  ["POPULARITY_DESC", "SCORE_DESC"],
  ["FAVOURITES_DESC", "POPULARITY_DESC"],
  ["SCORE_DESC", "POPULARITY_DESC"],
];

const FINAL_CANDIDATE_QUERY = `
query ($genreIn: [String], $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(type: ANIME, status_not_in: [NOT_YET_RELEASED], genre_in: $genreIn, sort: POPULARITY_DESC) {
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

async function aniFetch<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`AniList 요청 실패 (${res.status})`);

  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0]?.message || "AniList GraphQL 오류");
  if (!json.data) throw new Error("AniList 응답 데이터 없음");
  return json.data;
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

function buildReason(candidate: Anime, seeds: Anime[]): string {
  const seedGenreSet = new Set(seeds.flatMap((seed) => seed.genres ?? []));
  const matchedGenres = (candidate.genres ?? []).filter((genre) => seedGenreSet.has(genre));

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
  const [categoryPage, setCategoryPage] = useState(0);
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
      const data = await aniFetch<{ Page: { media: Anime[] } }>(CATEGORY_ANIME_QUERY, {
        genreIn: [category.genre],
        page: Math.floor(Math.random() * 3) + 1,
        perPage: 18,
        sort: CATEGORY_SORT_OPTIONS[Math.floor(Math.random() * CATEGORY_SORT_OPTIONS.length)],
      });

      const candidates = dedupeByFranchise(
        (data.Page.media ?? []).filter((anime) => !["SPECIAL", "MUSIC"].includes(anime.format ?? "")),
      );
      const picked = candidates[Math.floor(Math.random() * Math.max(candidates.length, 1))];
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
      setCategoryPage(0);
    }

    const existingSeen = new Set(mode === "reset" ? [] : seenCategoryIds);
    const collectedMap = new Map<number, Anime>();
    let pageCursor = mode === "reset" ? Math.floor(Math.random() * 10) + 1 : categoryPage + 1;

    try {
      for (let attempt = 0; attempt < 4 && collectedMap.size < 24; attempt++) {
        const data = await aniFetch<{ Page: { media: Anime[] } }>(CATEGORY_ANIME_QUERY, {
          genreIn: [category.genre],
          page: pageCursor,
          perPage: 50,
          sort: CATEGORY_SORT_OPTIONS[(attempt + Math.floor(Math.random() * CATEGORY_SORT_OPTIONS.length)) % CATEGORY_SORT_OPTIONS.length],
        });

        const filtered = dedupeByFranchise(
          (data.Page.media ?? []).filter((anime) => !["MOVIE", "SPECIAL", "MUSIC"].includes(anime.format ?? "")),
        );

        filtered.forEach((anime) => {
          if (existingSeen.has(anime.id)) return;
          if (collectedMap.has(anime.id)) return;
          collectedMap.set(anime.id, anime);
        });

        pageCursor += 1;
      }

      let nextList = shuffleArray(Array.from(collectedMap.values())).slice(0, 24);
      if (!nextList.length) {
        const fallback = await aniFetch<{ Page: { media: Anime[] } }>(CATEGORY_ANIME_QUERY, {
          genreIn: [category.genre],
          page: 1,
          perPage: 50,
          sort: ["POPULARITY_DESC", "SCORE_DESC"],
        });
        nextList = shuffleArray(
          dedupeByFranchise(
            (fallback.Page.media ?? []).filter((anime) => !["MOVIE", "SPECIAL", "MUSIC"].includes(anime.format ?? "")),
          ),
        ).slice(0, 24);
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
      setCategoryPage(pageCursor - 1);
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
      const topGenres = Array.from(new Set(pickedBaseAnimes.flatMap((s) => s.genres ?? []))).slice(0, 5);
      const data = await aniFetch<{ Page: { media: Anime[] } }>(FINAL_CANDIDATE_QUERY, {
        genreIn: topGenres.length ? topGenres : [selectedCategory.genre],
        page: 1,
        perPage: 80,
      });

      const seedSet = new Set(pickedBaseAnimes.map((item) => item.id));
      const ranked = dedupeByFranchise(data.Page.media ?? [])
        .filter((anime) => !seedSet.has(anime.id))
        .map((anime) => ({
          anime,
          score: scoreCandidate(anime, pickedBaseAnimes),
          reason: buildReason(anime, pickedBaseAnimes),
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

          const wikiCandidates = [anime.title.english, anime.title.romaji]
            .filter((v): v is string => !!v)
            .slice(0, 2);
          for (const titleCandidate of wikiCandidates) {
            const wikiKo = await fetchKoreanTitleFromWikipediaByTitle(titleCandidate);
            if (wikiKo) {
              resolvedTitle = wikiKo;
              break;
            }
          }

          if (!resolvedTitle && anime.idMal) {
            const wikidataKo = await fetchKoreanTitleFromWikidata(anime.idMal);
            if (wikidataKo) resolvedTitle = wikidataKo;
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
        <p>Data by AniList API · 한글 제목은 캐시/동의어/외부 무료 소스로 보강됩니다.</p>
      </footer>
    </div>
  );
}
