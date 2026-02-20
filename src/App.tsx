import { useMemo, useState } from "react";

type Anime = {
  id: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
  };
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
  subcategories: Array<{
    id: string;
    label: string;
    tag?: string;
  }>;
};

const CATEGORIES: Category[] = [
  {
    id: "lovecom",
    label: "러브코미디",
    genre: "Romance",
    subcategories: [
      { id: "school-love", label: "학원물", tag: "School" },
      { id: "tsundere", label: "츤데레", tag: "Tsundere" },
      { id: "harem", label: "하렘", tag: "Harem" },
      { id: "wholesome", label: "달달함", tag: "Cute Girls Doing Cute Things" },
    ],
  },
  {
    id: "action",
    label: "액션",
    genre: "Action",
    subcategories: [
      { id: "battle", label: "배틀물", tag: "Shounen" },
      { id: "superpower", label: "초능력", tag: "Super Power" },
      { id: "military", label: "밀리터리", tag: "Military" },
      { id: "samurai", label: "검/사무라이", tag: "Samurai" },
    ],
  },
  {
    id: "fantasy",
    label: "판타지",
    genre: "Fantasy",
    subcategories: [
      { id: "isekai", label: "이세계", tag: "Isekai" },
      { id: "magic", label: "마법", tag: "Magic" },
      { id: "adventure", label: "모험", tag: "Adventure" },
      { id: "dark-fantasy", label: "다크판타지", tag: "Dark Fantasy" },
    ],
  },
  {
    id: "thriller",
    label: "스릴러/미스터리",
    genre: "Thriller",
    subcategories: [
      { id: "mystery", label: "미스터리", tag: "Detective" },
      { id: "psychological", label: "심리전", tag: "Psychological" },
      { id: "time-loop", label: "타임루프", tag: "Time Manipulation" },
      { id: "survival", label: "생존", tag: "Survival" },
    ],
  },
];

const CATEGORY_ANIME_QUERY = `
query ($genreIn: [String], $tagIn: [String], $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(
      type: ANIME,
      status_not_in: [NOT_YET_RELEASED],
      genre_in: $genreIn,
      tag_in: $tagIn,
      sort: [POPULARITY_DESC, SCORE_DESC]
    ) {
      id
      title { romaji english native }
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
          title { romaji english native }
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
      title { romaji english native }
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

function getTitle(anime: Anime): string {
  return anime.title.english || anime.title.romaji || anime.title.native || `Anime #${anime.id}`;
}

function trimDescription(description?: string): string {
  if (!description) return "설명 정보가 없습니다.";
  const cleaned = description.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return cleaned.length > 120 ? `${cleaned.slice(0, 120)}...` : cleaned;
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
  const [selectedSubId, setSelectedSubId] = useState<string>(CATEGORIES[0].subcategories[0].id);

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

  const selectedCategory = useMemo(
    () => CATEGORIES.find((c) => c.id === selectedCategoryId) ?? CATEGORIES[0],
    [selectedCategoryId],
  );

  const selectedSub = useMemo(
    () => selectedCategory.subcategories.find((s) => s.id === selectedSubId) ?? selectedCategory.subcategories[0],
    [selectedCategory, selectedSubId],
  );

  const animeMap = useMemo(() => {
    const map = new Map<number, Anime>();
    categoryAnimes.forEach((a) => map.set(a.id, a));
    similarAnimes.forEach((a) => map.set(a.id, a));
    return map;
  }, [categoryAnimes, similarAnimes]);

  async function fetchCategoryAnimes() {
    setCategoryLoading(true);
    setCategoryError("");
    setCategoryAnimes([]);
    setPickedBaseIds([]);
    setSimilarAnimes([]);
    setPickedSimilarIds([]);
    setFinalRecs([]);

    try {
      const data = await aniFetch<{ Page: { media: Anime[] } }>(CATEGORY_ANIME_QUERY, {
        genreIn: [selectedCategory.genre],
        tagIn: selectedSub?.tag ? [selectedSub.tag] : undefined,
        page: 1,
        perPage: 18,
      });
      setCategoryAnimes(data.Page.media ?? []);
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

      const unique = Array.from(new Map(all.map((a) => [a.id, a])).values()).filter(
        (anime) => !pickedBaseIds.includes(anime.id),
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
      const ranked = (data.Page.media ?? [])
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

  return (
    <div className="page">
      <header className="hero">
        <p className="kicker">OTAKU MATCHMAKER</p>
        <h1>취향 고르면, 딱 맞는 다음 애니를 추천해줄게</h1>
        <p>카테고리 → 세부취향 → 재밌게 본 애니 선택 순서로 추천 정확도를 끌어올립니다.</p>
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
                setSelectedSubId(category.subcategories[0].id);
                setCategoryAnimes([]);
                setPickedBaseIds([]);
                setSimilarAnimes([]);
                setPickedSimilarIds([]);
                setFinalRecs([]);
              }}
            >
              {category.label}
            </button>
          ))}
        </div>

        <h3>세부 카테고리</h3>
        <div className="chip-group sub">
          {selectedCategory.subcategories.map((sub) => (
            <button
              key={sub.id}
              className={`chip-btn sub-chip ${selectedSubId === sub.id ? "active" : ""}`}
              onClick={() => {
                setSelectedSubId(sub.id);
                setCategoryAnimes([]);
                setPickedBaseIds([]);
                setSimilarAnimes([]);
                setPickedSimilarIds([]);
                setFinalRecs([]);
              }}
            >
              {sub.label}
            </button>
          ))}
        </div>

        <button className="primary-btn" onClick={() => void fetchCategoryAnimes()} disabled={categoryLoading}>
          {categoryLoading ? "불러오는 중..." : "이 취향 애니 불러오기"}
        </button>
        {categoryError && <p className="error-text">{categoryError}</p>}
      </section>

      {!!categoryAnimes.length && (
        <section className="panel">
          <h2>STEP 2. 재밌게 본 애니 고르기 (최대 6개)</h2>
          <div className="grid cards">
            {categoryAnimes.map((anime) => (
              <article
                key={anime.id}
                className={`anime-card ${pickedBaseIds.includes(anime.id) ? "selected" : ""}`}
                onClick={() => toggleBasePick(anime.id)}
              >
                <img src={anime.coverImage?.medium || anime.coverImage?.large || ""} alt={getTitle(anime)} />
                <div>
                  <h4>{getTitle(anime)}</h4>
                  <p>{trimDescription(anime.description)}</p>
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
                <img src={anime.coverImage?.medium || anime.coverImage?.large || ""} alt={getTitle(anime)} />
                <div>
                  <h4>{getTitle(anime)}</h4>
                  <p>{trimDescription(anime.description)}</p>
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
                <img src={anime.coverImage?.medium || anime.coverImage?.large || ""} alt={getTitle(anime)} />
                <div>
                  <h4>{getTitle(anime)}</h4>
                  <p>{trimDescription(anime.description)}</p>
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
