import { describe, expect, it } from "vitest";
import { hasDiversityByFeature } from "../mmrSelect";
import { recommendNextBatch } from "../index";
import { scoreCandidates } from "../scoring";
import { Anime, UserTasteState, initTasteState } from "../types";

function makeAnime(
  id: string,
  genres: string[],
  tags: string[],
  year: number,
  score: number,
  popularity: number,
): Anime {
  return {
    id,
    title: { kr: `작품-${id}` },
    genres,
    tags,
    year,
    score,
    popularity,
  };
}

function makeState(): UserTasteState {
  return {
    selectedCategory: "thriller",
    stepIndex: 3,
    likedIds: new Set(["a1"]),
    dislikedIds: new Set(["a5"]),
    genreWeights: {
      Thriller: 1.3,
      Mystery: 1.1,
      Action: 0.4,
      Romance: -0.1,
    },
    tagWeights: {
      MindGame: 0.9,
      Detective: 0.8,
      Battle: 0.3,
      SchoolLife: -0.2,
    },
    eraWeights: {
      pre2000: -0.1,
      "2000_2010": 0.1,
      "2010_now": 0.3,
    },
    likedEraCounts: {
      pre2000: 0,
      "2000_2010": 1,
      "2010_now": 2,
    },
  };
}

const POOL: Anime[] = [
  makeAnime("a1", ["Thriller", "Mystery"], ["MindGame", "Detective"], 2017, 8.9, 12000),
  makeAnime("a2", ["Thriller", "Action"], ["MindGame", "Battle"], 2019, 8.5, 13000),
  makeAnime("a3", ["Mystery", "Drama"], ["Detective", "SlowBurn"], 2014, 8.2, 11000),
  makeAnime("a4", ["Action", "Adventure"], ["Battle", "Tournament"], 2016, 8.4, 15000),
  makeAnime("a5", ["Thriller", "Mystery"], ["MindGame", "Detective"], 2018, 8.1, 9000),
  makeAnime("a6", ["Romance", "Drama"], ["SchoolLife", "Healing"], 2012, 7.9, 5000),
  makeAnime("a7", ["Mystery", "Psychological"], ["Detective", "Suspense"], 2008, 8.0, 4500),
  makeAnime("a8", ["Action", "SciFi"], ["Military", "Battle"], 2005, 7.8, 6000),
  makeAnime("a9", ["Drama"], ["Tragedy"], 1998, 8.3, 4000),
  makeAnime("a10", ["Comedy"], ["Slice"], 1996, 7.4, 3000),
  makeAnime("a11", ["Thriller"], ["Suspense"], 2020, 8.0, 20000),
  makeAnime("a12", ["Mystery"], ["Detective"], 2011, 7.7, 7000),
];

describe("recommendation engine", () => {
  it("returns up to requested batch size", () => {
    const result = recommendNextBatch({
      state: makeState(),
      candidatePool: POOL,
      alreadyShownIds: new Set<string>(),
      batchSize: 7,
    });
    expect(result.batch.length).toBeLessThanOrEqual(7);
  });

  it("excludes already shown ids", () => {
    const result = recommendNextBatch({
      state: makeState(),
      candidatePool: POOL,
      alreadyShownIds: new Set(["a2", "a3", "a11"]),
      batchSize: 8,
    });
    const ids = new Set(result.batch.map((item) => item.anime.id));
    expect(ids.has("a2")).toBe(false);
    expect(ids.has("a3")).toBe(false);
    expect(ids.has("a11")).toBe(false);
  });

  it("MMR keeps feature diversity", () => {
    const result = recommendNextBatch({
      state: makeState(),
      candidatePool: POOL,
      alreadyShownIds: new Set<string>(),
      batchSize: 8,
    });
    expect(hasDiversityByFeature(result.batch.map((item) => item.anime))).toBe(true);
  });

  it("applies dislike similarity penalty", () => {
    const state = makeState();
    const pool = [
      makeAnime("a5", ["Thriller", "Mystery"], ["MindGame", "Detective"], 2018, 8.2, 5000),
      makeAnime("x1", ["Thriller", "Mystery"], ["MindGame", "Detective"], 2019, 8.3, 5200),
      makeAnime("x2", ["Comedy"], ["Healing"], 2019, 8.3, 5200),
    ];
    const { scored } = scoreCandidates({ state, candidatePool: pool });
    const x1 = scored.find((item) => item.anime.id === "x1");
    const x2 = scored.find((item) => item.anime.id === "x2");
    expect(x1).toBeDefined();
    expect(x2).toBeDefined();
    expect((x1?.breakdown.dislikePenalty ?? 0)).toBeLessThan(0);
    expect((x1?.score ?? 0)).toBeLessThan(x2?.score ?? Number.POSITIVE_INFINITY);
  });

  it("creates a Korean explanation mentioning genre or tag", () => {
    const result = recommendNextBatch({
      state: makeState(),
      candidatePool: POOL,
      alreadyShownIds: new Set<string>(),
      batchSize: 5,
    });
    expect(result.batch.length).toBeGreaterThan(0);
    const why = result.batch[0].why;
    expect(/[가-힣]/.test(why)).toBe(true);
    expect(why.includes("장르") || why.includes("태그")).toBe(true);
  });

  it("initializes taste presets with default era bias", () => {
    const state = initTasteState("thriller", "dark");
    expect(state.eraWeights.pre2000).toBeCloseTo(-0.1);
    expect(state.eraWeights["2000_2010"]).toBeCloseTo(0);
    expect(state.eraWeights["2010_now"]).toBeCloseTo(0.1);
    expect(Object.keys(state.genreWeights).length).toBeGreaterThan(0);
  });
});
