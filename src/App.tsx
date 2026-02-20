import { useMemo, useState } from "react";

type Preference = "love" | "neutral" | "dislike";

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
  tags?: Array<{
    name?: string;
    rank?: number;
  }>;
  meanScore?: number;
  popularity?: number;
  seasonYear?: number;
};

type SeedItem = {
  anime: Anime;
  preference: Preference;
};

type RecommendationItem = {
  anime: Anime;
  score: number;
  matchedGenres: string[];
  matchedTags: string[];
  why: string;
};

type RecommendationRails = {
  directHits: RecommendationItem[];
  hiddenGems: RecommendationItem[];
  freshPicks: RecommendationItem[];
};

const SEARCH_QUERY = `
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
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

const CANDIDATE_QUERY = `
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

function cleanDescription(input?: string): string {
  if (!input) return "설명 정보가 없습니다.";
  const stripped = input.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return stripped.length > 180 ? `${stripped.slice(0, 180)}...` : stripped;
}

async function aniListFetch<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`AniList request failed: ${response.status}`);
  }

  const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) {
    throw new Error(body.errors[0]?.message || "AniList GraphQL error");
  }
  if (!body.data) {
    throw new Error("AniList data is empty");
  }

  return body.data;
}

function weightFromPreference(preference: Preference): number {
  if (preference === "love") return 1.8;
  if (preference === "neutral") return 1;
  return -1.2;
}

function buildRecommendations(seedItems: SeedItem[], candidates: Anime[]): RecommendationRails {
  const positiveSeeds = seedItems.filter((item) => item.preference !== "dislike");
  const genreWeight = new Map<string, number>();
  const tagWeight = new Map<string, number>();

  seedItems.forEach((item) => {
    const w = weightFromPreference(item.preference);
    (item.anime.genres ?? []).forEach((genre) => {
      genreWeight.set(genre, (genreWeight.get(genre) ?? 0) + w);
    });

    (item.anime.tags ?? []).forEach((tag) => {
      if (!tag.name) return;
      const rankWeight = (tag.rank ?? 50) / 100;
      tagWeight.set(tag.name, (tagWeight.get(tag.name) ?? 0) + w * rankWeight);
    });
  });

  const seedIds = new Set(seedItems.map((item) => item.anime.id));
  const scored = candidates
    .filter((anime) => !seedIds.has(anime.id))
    .map((anime) => {
      const genres = anime.genres ?? [];
      const tags = (anime.tags ?? []).map((t) => t.name).filter((v): v is string => !!v);

      let similarity = 0;
      const matchedGenres = genres.filter((g) => (genreWeight.get(g) ?? 0) > 0);
      matchedGenres.forEach((g) => {
        similarity += (genreWeight.get(g) ?? 0) * 9;
      });

      const matchedTags = tags.filter((t) => (tagWeight.get(t) ?? 0) > 0).slice(0, 6);
      matchedTags.forEach((t) => {
        similarity += (tagWeight.get(t) ?? 0) * 6;
      });

      const qualityBonus = ((anime.meanScore ?? 60) - 50) * 0.5;
      const popularityBonus = Math.min(18, Math.log10((anime.popularity ?? 1) + 1) * 6);
      const score = similarity + qualityBonus + popularityBonus;

      const why =
        matchedGenres.length || matchedTags.length
          ? `${matchedGenres.slice(0, 2).join(", ")}${matchedTags[0] ? ` + ${matchedTags[0]}` : ""} 성향이 유사해서 추천`
          : "시드와 완전 동일하진 않지만 점수/품질 기반으로 추천";

      return {
        anime,
        score,
        matchedGenres,
        matchedTags,
        why,
      } satisfies RecommendationItem;
    })
    .sort((a, b) => b.score - a.score);

  const directHits = scored
    .filter((item) => item.matchedGenres.length >= 2 || item.matchedTags.length >= 2)
    .slice(0, 8);

  const hiddenGems = scored
    .filter((item) => (item.anime.popularity ?? 0) < 50000 && (item.anime.meanScore ?? 0) >= 75)
    .slice(0, 8);

  const seedGenres = new Set(positiveSeeds.flatMap((s) => s.anime.genres ?? []));
  const freshPicks = scored
    .filter((item) => (item.anime.genres ?? []).some((g) => !seedGenres.has(g)))
    .slice(0, 8);

  return {
    directHits: directHits.length ? directHits : scored.slice(0, 8),
    hiddenGems: hiddenGems.length ? hiddenGems : scored.slice(8, 16),
    freshPicks: freshPicks.length ? freshPicks : scored.slice(16, 24),
  };
}

export default function App() {
  const [searchInput, setSearchInput] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<Anime[]>([]);

  const [selectedSeeds, setSelectedSeeds] = useState<SeedItem[]>([]);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendError, setRecommendError] = useState("");
  const [rails, setRails] = useState<RecommendationRails | null>(null);

  const selectedSeedIds = useMemo(
    () => new Set(selectedSeeds.map((item) => item.anime.id)),
    [selectedSeeds],
  );

  async function runSearch() {
    if (!searchInput.trim()) return;
    setSearchLoading(true);
    setSearchError("");

    try {
      const data = await aniListFetch<{ Page: { media: Anime[] } }>(SEARCH_QUERY, {
        search: searchInput.trim(),
        page: 1,
        perPage: 12,
      });
      setSearchResults(data.Page.media ?? []);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "검색 중 오류가 발생했습니다.");
    } finally {
      setSearchLoading(false);
    }
  }

  function addSeed(anime: Anime) {
    if (selectedSeedIds.has(anime.id)) return;
    if (selectedSeeds.length >= 10) return;
    setSelectedSeeds((prev) => [...prev, { anime, preference: "love" }]);
    setRails(null);
  }

  function removeSeed(id: number) {
    setSelectedSeeds((prev) => prev.filter((item) => item.anime.id !== id));
    setRails(null);
  }

  function updatePreference(id: number, preference: Preference) {
    setSelectedSeeds((prev) =>
      prev.map((item) => (item.anime.id === id ? { ...item, preference } : item)),
    );
    setRails(null);
  }

  async function recommend() {
    if (selectedSeeds.length < 3) {
      setRecommendError("최소 3개 이상의 애니를 선택해 주세요.");
      return;
    }

    setRecommendError("");
    setRecommendLoading(true);

    try {
      const topGenres = Array.from(
        new Set(selectedSeeds.flatMap((item) => item.anime.genres ?? [])),
      ).slice(0, 5);

      const data = await aniListFetch<{ Page: { media: Anime[] } }>(CANDIDATE_QUERY, {
        genreIn: topGenres.length ? topGenres : undefined,
        page: 1,
        perPage: 50,
      });

      const nextRails = buildRecommendations(selectedSeeds, data.Page.media ?? []);
      setRails(nextRails);
    } catch (error) {
      setRecommendError(error instanceof Error ? error.message : "추천 생성 중 오류가 발생했습니다.");
    } finally {
      setRecommendLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">ANIMATCH LAB</p>
        <h1>봤던 애니만 고르면, 취향 맞춤 추천을 뽑아드립니다</h1>
        <p>
          AniList 무료 데이터 기반으로 <strong>취향 직격</strong>, <strong>숨은 명작</strong>,
          <strong> 새로움 추천</strong>을 동시에 제공합니다.
        </p>
      </header>

      <section className="panel search-panel">
        <h2>1) 봤던 애니 검색</h2>
        <div className="search-row">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void runSearch();
              }
            }}
            placeholder="예: Attack on Titan, Steins;Gate"
          />
          <button onClick={() => void runSearch()} disabled={searchLoading}>
            {searchLoading ? "검색 중..." : "검색"}
          </button>
        </div>

        {searchError && <p className="error-text">{searchError}</p>}

        <div className="grid cards">
          {searchResults.map((anime) => (
            <article className="anime-card" key={anime.id}>
              <img
                src={anime.coverImage?.medium || anime.coverImage?.large || ""}
                alt={getTitle(anime)}
              />
              <div>
                <h3>{getTitle(anime)}</h3>
                <p>{cleanDescription(anime.description)}</p>
                <div className="meta-row">
                  <span>Score {anime.meanScore ?? "-"}</span>
                  <span>{anime.seasonYear ?? "-"}</span>
                </div>
                <button
                  className="add-btn"
                  onClick={() => addSeed(anime)}
                  disabled={selectedSeedIds.has(anime.id) || selectedSeeds.length >= 10}
                >
                  {selectedSeedIds.has(anime.id) ? "선택됨" : "시드에 추가"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel seed-panel">
        <h2>2) 선택한 시드 (3~10개)</h2>
        <div className="seed-list">
          {selectedSeeds.map((item) => (
            <div className="seed-item" key={item.anime.id}>
              <span>{getTitle(item.anime)}</span>
              <div className="seed-actions">
                <select
                  value={item.preference}
                  onChange={(e) => updatePreference(item.anime.id, e.target.value as Preference)}
                >
                  <option value="love">좋아함</option>
                  <option value="neutral">보통</option>
                  <option value="dislike">별로</option>
                </select>
                <button className="remove-btn" onClick={() => removeSeed(item.anime.id)}>
                  제거
                </button>
              </div>
            </div>
          ))}
          {!selectedSeeds.length && <p className="hint">먼저 검색에서 애니를 추가해 주세요.</p>}
        </div>

        <button className="recommend-btn" onClick={() => void recommend()} disabled={recommendLoading}>
          {recommendLoading ? "추천 생성 중..." : "3개 레일 추천 받기"}
        </button>
        {recommendError && <p className="error-text">{recommendError}</p>}
      </section>

      {rails && (
        <section className="panel result-panel motion-in">
          <h2>3) 추천 결과</h2>

          <div className="rail">
            <div className="rail-head">
              <h3>취향 직격</h3>
              <p>시드 태그/장르 유사도가 가장 높은 라인</p>
            </div>
            <div className="grid cards">
              {rails.directHits.map((item) => (
                <RecommendationCard key={item.anime.id} item={item} />
              ))}
            </div>
          </div>

          <div className="rail">
            <div className="rail-head">
              <h3>숨은 명작</h3>
              <p>대중 노출은 낮지만 점수/완성도 신호가 높은 라인</p>
            </div>
            <div className="grid cards">
              {rails.hiddenGems.map((item) => (
                <RecommendationCard key={item.anime.id} item={item} />
              ))}
            </div>
          </div>

          <div className="rail">
            <div className="rail-head">
              <h3>새로움 추천</h3>
              <p>취향은 맞지만 기존 시드와 다른 결을 섞은 라인</p>
            </div>
            <div className="grid cards">
              {rails.freshPicks.map((item) => (
                <RecommendationCard key={item.anime.id} item={item} />
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="footer-note">
        <p>
          데이터 출처: AniList GraphQL API (무료). 추천 결과는 참고용이며, 개인 취향에 따라 달라질 수
          있습니다.
        </p>
      </footer>
    </div>
  );
}

function RecommendationCard({ item }: { item: RecommendationItem }) {
  return (
    <article className="anime-card rec-card">
      <img src={item.anime.coverImage?.medium || item.anime.coverImage?.large || ""} alt={getTitle(item.anime)} />
      <div>
        <h3>{getTitle(item.anime)}</h3>
        <p>{cleanDescription(item.anime.description)}</p>
        <div className="meta-row">
          <span>추천점수 {Math.round(item.score)}</span>
          <span>평점 {item.anime.meanScore ?? "-"}</span>
        </div>
        <p className="why">{item.why}</p>
        <div className="chip-row">
          {item.matchedGenres.slice(0, 2).map((genre) => (
            <span key={genre} className="chip">#{genre}</span>
          ))}
          {item.matchedTags.slice(0, 2).map((tag) => (
            <span key={tag} className="chip dim">#{tag}</span>
          ))}
        </div>
      </div>
    </article>
  );
}
