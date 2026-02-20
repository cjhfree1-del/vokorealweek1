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

const CATEGORIES: Category[] = [
  {
    id: "lovecom",
    label: "러브코미디",
    genre: "Romance",
  },
  {
    id: "action",
    label: "액션",
    genre: "Action",
  },
  {
    id: "fantasy",
    label: "판타지",
    genre: "Fantasy",
  },
  {
    id: "thriller",
    label: "스릴러/미스터리",
    genre: "Thriller",
  },
];

const CATEGORY_ANIME_QUERY = `
query ($genreIn: [String], $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(
      type: ANIME,
      status_not_in: [NOT_YET_RELEASED],
      genre_in: $genreIn,
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

const SIMILAR_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    recommendations(sort: RATING_DESC, perPage: 12) {
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
  "bleach": "블리치",
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
    if (KOREAN_TITLE_BY_KEY[key]) {
      return KOREAN_TITLE_BY_KEY[key];
    }
  }
  return undefined;
}

function titleFromSynonyms(anime: Anime): string | undefined {
  const fromSynonym = (anime.synonyms ?? []).find((syn) => hasHangul(syn));
  if (fromSynonym) return fromSynonym.trim();
  if (hasHangul(anime.title.native)) return anime.title.native.trim();
  return undefined;
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
  const res = await fetch(endpoint, {
    headers: {
      Accept: "application/sparql-results+json",
    },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    results?: { bindings?: Array<{ label?: { value?: string } }> };
  };
  const label = json.results?.bindings?.[0]?.label?.value;
  return label?.trim() || null;
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
    if (nextScore > currentScore) {
      map.set(key, anime);
    }
  }
  return Array.from(map.values());
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

function buildKoreanSummary(anime: Anime): string {
  const genres = (anime.genres ?? []).slice(0, 3).map(toKoreanGenre);
  const score = anime.meanScore ?? "-";
  const year = anime.seasonYear ? `${anime.seasonYear}년작` : "연도 정보 없음";
  if (!genres.length) {
    return `평균 평점 ${score} · ${year}`;
  }
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

  if (!res.ok) {
    throw new Error(`AniList 요청 실패 (${res.status})`);
  }

  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || "AniList GraphQL 오류");
  }
  if (!json.data) {
    throw new Error("AniList 응답 데이터 없음");
  }
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

export default function App() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(CATEGORIES[0].id);
  const [step2Tab, setStep2Tab] = useState(1);

  const [categoryAnimes, setCategoryAnimes] = useState<Anime[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState("");

  const [pickedBaseIds, setPickedBaseIds] = useState<number[]>([]);

  const [similarAnimes, setSimilarAnimes] = useState<Anime[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [pickedSimilarIds, setPickedSimilarIds] = useState<number[]>([]);

  const [finalRecs, setFinalRecs] = useState<Anime[]>([]);
  const [finalLoading, setFinalLoading] = useState(false);
  const [finalError, setFinalError] = useState("");
  const [koTitleCache, setKoTitleCache] = useState<Record<string, string>>({});
  const lookupInFlight = useRef<Set<string>>(new Set());

  const selectedCategory = useMemo(
    () => CATEGORIES.find((c) => c.id === selectedCategoryId) ?? CATEGORIES[0],
    [selectedCategoryId],
  );

  const animeMap = useMemo(() => {
    const map = new Map<number, Anime>();
    categoryAnimes.forEach((a) => map.set(a.id, a));
    similarAnimes.forEach((a) => map.set(a.id, a));
    return map;
  }, [categoryAnimes, similarAnimes]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KO_TITLE_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      setKoTitleCache(parsed);
    } catch {
      // ignore malformed cache
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KO_TITLE_CACHE_KEY, JSON.stringify(koTitleCache));
    } catch {
      // ignore storage errors
    }
  }, [koTitleCache]);

  async function fetchCategoryAnimes(category: Category) {
    setCategoryLoading(true);
    setCategoryError("");
    setCategoryAnimes([]);
    setPickedBaseIds([]);
    setSimilarAnimes([]);
    setPickedSimilarIds([]);
    setFinalRecs([]);
    setFinalError("");
    setStep2Tab(1);

    try {
      const data = await aniFetch<{ Page: { media: Anime[] } }>(CATEGORY_ANIME_QUERY, {
        genreIn: [category.genre],
        page: 1,
        perPage: 72,
      });
      const filtered = (data.Page.media ?? []).filter(
        (anime) => !["MOVIE", "SPECIAL", "MUSIC"].includes(anime.format ?? ""),
      );
      setCategoryAnimes(dedupeByFranchise(filtered));
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : "카테고리 로딩 실패");
    } finally {
      setCategoryLoading(false);
    }
  }

  function toggleBasePick(animeId: number) {
    setPickedBaseIds((prev) =>
      prev.includes(animeId) ? prev.filter((id) => id !== animeId) : [...prev, animeId].slice(0, 6),
    );
    setSimilarAnimes([]);
    setPickedSimilarIds([]);
    setFinalRecs([]);
  }

  async function fetchSimilarFive() {
    if (!pickedBaseIds.length) return;

    setSimilarLoading(true);
    setFinalRecs([]);

    try {
      const sourceIds = pickedBaseIds.slice(0, 3);
      const all: Anime[] = [];

      for (const id of sourceIds) {
        const data = await aniFetch<{
          Media: {
            recommendations?: {
              nodes?: Array<{
                mediaRecommendation?: Anime;
              }>;
            };
          };
        }>(SIMILAR_QUERY, { id });

        (data.Media.recommendations?.nodes ?? []).forEach((node) => {
          if (node.mediaRecommendation) {
            all.push(node.mediaRecommendation);
          }
        });
      }

      const step2IdSet = new Set(categoryAnimes.map((anime) => anime.id));
      const unique = dedupeByFranchise(Array.from(new Map(all.map((a) => [a.id, a])).values())).filter(
        (anime) => !pickedBaseIds.includes(anime.id) && !step2IdSet.has(anime.id),
      );

      setSimilarAnimes(unique.slice(0, 5));
      setPickedSimilarIds([]);
    } catch {
      setSimilarAnimes([]);
    } finally {
      setSimilarLoading(false);
    }
  }

  function toggleSimilarPick(animeId: number) {
    setPickedSimilarIds((prev) =>
      prev.includes(animeId) ? prev.filter((id) => id !== animeId) : [...prev, animeId].slice(0, 5),
    );
    setFinalRecs([]);
  }

  async function makeFinalRecommendations() {
    const allSeedIds = [...pickedBaseIds, ...pickedSimilarIds];
    if (allSeedIds.length < 3) {
      setFinalError("최소 3개 이상 선택하면 추천 정확도가 올라갑니다.");
      return;
    }

    setFinalLoading(true);
    setFinalError("");

    try {
      const seeds = allSeedIds.map((id) => animeMap.get(id)).filter((a): a is Anime => !!a);
      const topGenres = Array.from(new Set(seeds.flatMap((s) => s.genres ?? []))).slice(0, 5);

      const data = await aniFetch<{ Page: { media: Anime[] } }>(FINAL_CANDIDATE_QUERY, {
        genreIn: topGenres.length ? topGenres : [selectedCategory.genre],
        page: 1,
        perPage: 60,
      });

      const seedSet = new Set(allSeedIds);
      const ranked = dedupeByFranchise(data.Page.media ?? [])
        .filter((anime) => !seedSet.has(anime.id))
        .map((anime) => ({ anime, score: scoreCandidate(anime, seeds) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((item) => item.anime);

      setFinalRecs(ranked);
    } catch (error) {
      setFinalError(error instanceof Error ? error.message : "추천 생성 실패");
    } finally {
      setFinalLoading(false);
    }
  }

  const visibleStep2Animes = useMemo(() => {
    const size = 18;
    const from = (step2Tab - 1) * size;
    return categoryAnimes.slice(from, from + size);
  }, [categoryAnimes, step2Tab]);

  const step2TabCount = Math.max(1, Math.ceil(categoryAnimes.length / 18));

  const visibleAnimesForKoLookup = useMemo(
    () =>
      Array.from(
        new Map(
          [...visibleStep2Animes, ...similarAnimes, ...finalRecs].map((anime) => [anime.id, anime]),
        ).values(),
      ),
    [visibleStep2Animes, similarAnimes, finalRecs],
  );

  useEffect(() => {
    async function resolveKoreanTitles() {
      for (const anime of visibleAnimesForKoLookup) {
        const key = cacheKey(anime);
        if (koTitleCache[key] || lookupInFlight.current.has(key)) continue;

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

        if (!anime.idMal) continue;
        lookupInFlight.current.add(key);
        try {
          const wikidataKo = await fetchKoreanTitleFromWikidata(anime.idMal);
          if (wikidataKo) {
            setKoTitleCache((prev) => (prev[key] ? prev : { ...prev, [key]: wikidataKo }));
          }
        } finally {
          lookupInFlight.current.delete(key);
        }
      }
    }

    void resolveKoreanTitles();
  }, [visibleAnimesForKoLookup, koTitleCache]);

  return (
    <div className={`page ${!categoryAnimes.length && !similarAnimes.length && !finalRecs.length ? "landing" : ""}`}>
      <header className="hero">
        <p className="kicker">OTAKU MATCHMAKER</p>
        <h1>취향 고르면, 딱 맞는 다음 애니를 추천해줄게</h1>
        <p>카테고리 → 재밌게 본 애니 선택 → 비슷한 애니 추가 선택 순서로 추천합니다.</p>
      </header>

      <section className="panel flow-panel">
        <h2>STEP 1. 카테고리 선택</h2>
        <div className="chip-group">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              className={`chip-btn ${selectedCategoryId === category.id ? "active" : ""}`}
              onClick={() => {
                setSelectedCategoryId(category.id);
                setPickedBaseIds([]);
                setSimilarAnimes([]);
                setPickedSimilarIds([]);
                setFinalRecs([]);
                void fetchCategoryAnimes(category);
              }}
            >
              {category.label}
            </button>
          ))}
        </div>
        {categoryLoading && <p className="loading-text">카테고리 애니 불러오는 중...</p>}
        {categoryError && <p className="error-text">{categoryError}</p>}
      </section>

      {!!categoryAnimes.length && (
        <section className="panel">
          <h2>STEP 2. 재밌게 본 애니 고르기 (최대 6개)</h2>
          <div className="tab-row">
            {Array.from({ length: step2TabCount }).map((_, idx) => {
              const tab = idx + 1;
              return (
                <button
                  key={tab}
                  className={`tab-btn ${step2Tab === tab ? "active" : ""}`}
                  onClick={() => setStep2Tab(tab)}
                >
                  {tab}
                </button>
              );
            })}
          </div>
          <div className="grid cards">
            {visibleStep2Animes.map((anime) => (
              <article
                key={anime.id}
                className={`anime-card ${pickedBaseIds.includes(anime.id) ? "selected" : ""}`}
                onClick={() => toggleBasePick(anime.id)}
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
            ))}
          </div>

          <button className="primary-btn" onClick={() => void fetchSimilarFive()} disabled={similarLoading || pickedBaseIds.length === 0}>
            {similarLoading ? "비슷한 애니 분석 중..." : "비슷한 애니 5개 보기"}
          </button>
        </section>
      )}

      {!!similarAnimes.length && (
        <section className="panel motion-in">
          <h2>STEP 3. 비슷한 애니 중 추가로 재밌게 본 것 선택</h2>
          <div className="grid cards five">
            {similarAnimes.map((anime) => (
              <article
                key={anime.id}
                className={`anime-card compact ${pickedSimilarIds.includes(anime.id) ? "selected" : ""}`}
                onClick={() => toggleSimilarPick(anime.id)}
              >
                <img src={anime.coverImage?.medium || anime.coverImage?.large || ""} alt={getTitle(anime, koTitleCache)} />
                <div>
                  <h4>{getTitle(anime, koTitleCache)}</h4>
                  <p>{buildKoreanSummary(anime)}</p>
                </div>
              </article>
            ))}
          </div>

          <button className="primary-btn strong" onClick={() => void makeFinalRecommendations()} disabled={finalLoading}>
            {finalLoading ? "추천 생성 중..." : "최종 추천 받기"}
          </button>
          {finalError && <p className="error-text">{finalError}</p>}
        </section>
      )}

      {!!finalRecs.length && (
        <section className="panel result-panel motion-in">
          <h2>추천 애니</h2>
          <div className="grid cards">
            {finalRecs.map((anime) => (
              <article key={anime.id} className="anime-card result">
                <img src={anime.coverImage?.medium || anime.coverImage?.large || ""} alt={getTitle(anime, koTitleCache)} />
                <div>
                  <h4>{getTitle(anime, koTitleCache)}</h4>
                  <p>{buildKoreanSummary(anime)}</p>
                  <div className="meta-row">
                    <span>평점 {anime.meanScore ?? "-"}</span>
                    <span>인기 {anime.popularity ?? "-"}</span>
                  </div>
                  <div className="tag-row">
                    {(anime.genres ?? []).slice(0, 3).map((g) => (
                      <span key={g}>#{g}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer className="footer-note">
        <p>Data by AniList API · 추천 결과는 취향 참고용입니다.</p>
      </footer>
    </div>
  );
}
