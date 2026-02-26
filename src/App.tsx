import { useEffect, useMemo, useState } from "react";

type Tone = string;
type Length = "단편" | "중편" | "장편";

type WebNovel = {
  id: string;
  title: string;
  author: string;
  platform: string;
  genres: string[];
  tones: Tone[];
  length: Length;
  intro: string;
  hook: string;
  completed: boolean;
};

type RankedNovel = {
  novel: WebNovel;
  score: number;
  personal: number;
};

const USER_KEY = "novel_user_v1";
const LIKE_PREFIX = "novel_likes_";

function countMap<T extends string>(values: T[]): Map<T, number> {
  const map = new Map<T, number>();
  for (const value of values) {
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return map;
}

function byCountDesc(a: [string, number], b: [string, number]): number {
  return b[1] - a[1];
}

export default function App() {
  const [novels, setNovels] = useState<WebNovel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [genre, setGenre] = useState<string>("전체");
  const [length, setLength] = useState<Length | "전체">("전체");
  const [tones, setTones] = useState<Tone[]>(["몰입"]);
  const [query, setQuery] = useState("");
  const [seed, setSeed] = useState(0);

  const [draftName, setDraftName] = useState("");
  const [userName, setUserName] = useState("");
  const [likes, setLikes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const storedName = localStorage.getItem(USER_KEY) ?? "";
    if (storedName) {
      setUserName(storedName);
      setDraftName(storedName);
      const rawLikes = localStorage.getItem(`${LIKE_PREFIX}${storedName}`);
      if (rawLikes) {
        try {
          setLikes(new Set(JSON.parse(rawLikes) as string[]));
        } catch {
          setLikes(new Set());
        }
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNovels() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/data/webnovels.json");
        if (!response.ok) throw new Error(`데이터 로드 실패 (${response.status})`);
        const data = (await response.json()) as WebNovel[];
        if (!cancelled) setNovels(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "데이터 로드 실패");
          setNovels([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadNovels();
    return () => {
      cancelled = true;
    };
  }, []);

  const allGenres = useMemo(
    () => Array.from(new Set(novels.flatMap((novel) => novel.genres))).sort(),
    [novels],
  );

  const allTones = useMemo(
    () => Array.from(new Set(novels.flatMap((novel) => novel.tones))),
    [novels],
  );

  const likedNovels = useMemo(
    () => novels.filter((novel) => likes.has(novel.id)),
    [novels, likes],
  );

  const profile = useMemo(() => {
    const genreFreq = countMap(likedNovels.flatMap((novel) => novel.genres));
    const toneFreq = countMap(likedNovels.flatMap((novel) => novel.tones));
    const platformFreq = countMap(likedNovels.map((novel) => novel.platform));

    return {
      topGenres: Array.from(genreFreq.entries()).sort(byCountDesc).slice(0, 3).map(([name]) => name),
      topTones: Array.from(toneFreq.entries()).sort(byCountDesc).slice(0, 3).map(([name]) => name),
      topPlatforms: new Set(Array.from(platformFreq.entries()).sort(byCountDesc).slice(0, 2).map(([name]) => name)),
      genreFreq,
      toneFreq,
    };
  }, [likedNovels]);

  const picks = useMemo(() => {
    const ranked: RankedNovel[] = novels.map((novel) => {
      let score = 0;
      let personal = 0;

      if (genre === "전체" || novel.genres.includes(genre)) score += 35;
      if (length === "전체" || novel.length === length) score += 20;

      const filterToneMatches = tones.filter((tone) => novel.tones.includes(tone)).length;
      score += filterToneMatches * 16;

      if (query) {
        const target = `${novel.title} ${novel.author} ${novel.intro} ${novel.hook}`.toLowerCase();
        if (target.includes(query.toLowerCase())) score += 15;
      }

      if (novel.completed) score += 4;

      if (userName) {
        const sharedGenres = novel.genres.reduce((acc, item) => acc + (profile.genreFreq.get(item) ?? 0), 0);
        const sharedTones = novel.tones.reduce((acc, item) => acc + (profile.toneFreq.get(item) ?? 0), 0);
        personal += sharedGenres * 11;
        personal += sharedTones * 10;
        if (profile.topPlatforms.has(novel.platform)) personal += 7;
      }

      return { novel, score: score + personal, personal };
    });

    ranked.sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, 8);

    if (seed % 2 === 1) {
      return [...top.slice(0, 4), ...top.slice(5, 8), top[4]].filter(Boolean);
    }
    return top;
  }, [novels, genre, length, tones, query, userName, profile, seed]);

  function toggleTone(tone: Tone) {
    setTones((prev) => (prev.includes(tone) ? prev.filter((item) => item !== tone) : [...prev, tone]));
  }

  function login() {
    const next = draftName.trim();
    if (!next) return;

    setUserName(next);
    localStorage.setItem(USER_KEY, next);

    const rawLikes = localStorage.getItem(`${LIKE_PREFIX}${next}`);
    if (!rawLikes) {
      setLikes(new Set());
      return;
    }

    try {
      setLikes(new Set(JSON.parse(rawLikes) as string[]));
    } catch {
      setLikes(new Set());
    }
  }

  function logout() {
    setUserName("");
    setLikes(new Set());
    localStorage.removeItem(USER_KEY);
  }

  function toggleLike(id: string) {
    if (!userName) return;

    setLikes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(`${LIKE_PREFIX}${userName}`, JSON.stringify(Array.from(next)));
      return next;
    });
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <p className="badge">NOVEL COMPASS</p>
        <h1>웹소설 추천 스테이션</h1>
        <p>내부 DB + 로그인 취향 기록 기반 개인화 추천</p>
      </header>

      <section className="user-panel">
        {!userName ? (
          <>
            <p className="user-title">로그인</p>
            <div className="user-row">
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="닉네임 입력"
                aria-label="닉네임 입력"
              />
              <button onClick={login}>시작하기</button>
            </div>
            <p className="user-help">닉네임별로 찜 목록이 로컬에 저장됩니다.</p>
          </>
        ) : (
          <>
            <div className="user-head">
              <p className="user-title">{userName}님 맞춤 추천</p>
              <button className="logout" onClick={logout}>로그아웃</button>
            </div>
            <p className="user-help">찜 {likes.size}개 · 선호 장르 {profile.topGenres.join(", ") || "데이터 수집 중"} · 선호 분위기 {profile.topTones.join(", ") || "데이터 수집 중"}</p>
          </>
        )}
      </section>

      <section className="filter-panel">
        <div className="filter-row">
          <label>장르</label>
          <div className="chip-wrap">
            {["전체", ...allGenres].map((item) => (
              <button
                key={item}
                className={`chip ${genre === item ? "active" : ""}`}
                onClick={() => setGenre(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-row">
          <label>분위기</label>
          <div className="chip-wrap">
            {allTones.map((tone) => (
              <button
                key={tone}
                className={`chip ${tones.includes(tone) ? "active" : ""}`}
                onClick={() => toggleTone(tone)}
              >
                {tone}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-row compact">
          <label htmlFor="length">분량</label>
          <select id="length" value={length} onChange={(event) => setLength(event.target.value as Length | "전체")}>
            <option value="전체">전체</option>
            <option value="단편">단편</option>
            <option value="중편">중편</option>
            <option value="장편">장편</option>
          </select>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목/키워드 검색"
            aria-label="제목 또는 키워드 검색"
          />

          <button className="shuffle" onClick={() => setSeed((prev) => prev + 1)}>
            추천 섞기
          </button>
        </div>
      </section>

      <section className="result-panel">
        <div className="result-head">
          <h2>추천 결과</h2>
          <p>상위 {picks.length}개</p>
        </div>

        {loading && <p className="status-text">내부 DB에서 웹소설 목록 불러오는 중...</p>}
        {!!error && <p className="status-text error">{error}</p>}

        {!loading && !error && (
          <div className="card-grid">
            {picks.map(({ novel, score, personal }) => (
              <article key={novel.id} className="novel-card">
                <div className="novel-top">
                  <h3>{novel.title}</h3>
                  <span>{score}점</span>
                </div>
                <p className="meta">{novel.author} · {novel.platform} · {novel.length} · {novel.completed ? "완결" : "연재중"}</p>
                <p className="intro">{novel.intro}</p>
                <p className="hook">추천 포인트: {novel.hook}</p>
                <div className="tags">
                  {novel.genres.map((item) => <span key={item}>#{item}</span>)}
                </div>
                <div className="card-bottom">
                  <p className="personal">개인화 가중치 +{personal}</p>
                  <button
                    className={`like-btn ${likes.has(novel.id) ? "on" : ""}`}
                    onClick={() => toggleLike(novel.id)}
                    disabled={!userName}
                  >
                    {likes.has(novel.id) ? "찜 완료" : "찜하기"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
