import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import {
  AnimeLocalizationDoc,
  LocalizeAnimeInput,
  LocalizeAnimeResponse,
  MatchProvider,
  MatchStatus,
  TmdbSearchResult,
} from "../types/localization";
import { buildKoFallbackIndexes, normalizeKoFallbackKey } from "../data/koTitleFallbackRepo";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_MAX_REQUESTS_PER_CALL = 8;
const TMDB_RETRY_LIMIT = 3;

type LocalizeInternalResult = {
  ko: {
    title: string;
    synopsis: string;
    genres: string[];
  };
  match: {
    status: MatchStatus;
    best_provider: MatchProvider;
    confidence: number;
    evidence: Record<string, unknown>;
  };
};

const { byMalId: FALLBACK_BY_MAL_ID, byAlias: FALLBACK_BY_ALIAS } = buildKoFallbackIndexes();

export function normalizeTitle(str?: string): string {
  if (!str) return "";
  return normalizeKoFallbackKey(
    str.replace(
      /\b(final\s*season|\d+(st|nd|rd|th)\s*season)\b/gi,
      " ",
    ),
  );
}

function tokenize(str: string): string[] {
  return normalizeTitle(str)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

export function similarity(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (!aTokens.size || !bTokens.size) return 0;

  let intersect = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersect += 1;
  }

  return (2 * intersect) / (aTokens.size + bTokens.size);
}

function parseYearFromDate(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const year = Number.parseInt(dateStr.slice(0, 4), 10);
  if (Number.isNaN(year)) return undefined;
  return year;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function scoreTmdbCandidate(
  candidate: TmdbSearchResult,
  input: LocalizeAnimeInput,
): number {
  const candidateTitles = [
    candidate.name,
    candidate.title,
    candidate.original_name,
    candidate.original_title,
  ].filter((value): value is string => Boolean(value));
  const inputTitles = [input.titles.english, input.titles.romaji, input.titles.native].filter(
    (value): value is string => Boolean(value),
  );

  const titleScore = inputTitles.reduce((best, srcTitle) => {
    const localBest = candidateTitles.reduce((innerBest, candTitle) => {
      const s = similarity(srcTitle, candTitle);
      return s > innerBest ? s : innerBest;
    }, 0);
    return localBest > best ? localBest : best;
  }, 0);

  const candidateYear = parseYearFromDate(candidate.first_air_date ?? candidate.release_date);
  const yearGap =
    typeof input.year === "number" && typeof candidateYear === "number"
      ? Math.abs(input.year - candidateYear)
      : 4;
  const yearScore = yearGap <= 1 ? 1 : yearGap <= 3 ? 0.8 : yearGap <= 5 ? 0.55 : 0.2;

  const popularity = candidate.popularity ?? 0;
  const popularityScore = clamp01(popularity / 100);

  return 0.72 * titleScore + 0.2 * yearScore + 0.08 * popularityScore;
}

function computeGenreNamesFromIds(genreIds?: number[]): string[] {
  if (!genreIds?.length) return [];
  return genreIds.map((id) => `genre_${id}`);
}

export function computeExpiresAt(confidence: number): Date {
  const now = Date.now();
  if (confidence >= 0.9) return new Date(now + 1000 * 60 * 60 * 24 * 90);
  if (confidence >= 0.85) return new Date(now + 1000 * 60 * 60 * 24 * 45);
  if (confidence >= 0.7) return new Date(now + 1000 * 60 * 60 * 24 * 14);
  if (confidence >= 0.5) return new Date(now + 1000 * 60 * 60 * 24 * 7);
  return new Date(now + 1000 * 60 * 60 * 24 * 3);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TmdbRequester {
  private readonly apiKey: string;
  private requestCount = 0;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private ensureBudget(): void {
    if (this.requestCount >= TMDB_MAX_REQUESTS_PER_CALL) {
      throw new Error("tmdb_request_limit_exceeded");
    }
    this.requestCount += 1;
  }

  async get(path: string, query: Record<string, string>): Promise<any> {
    this.ensureBudget();
    const url = new URL(`${TMDB_BASE_URL}${path}`);
    url.searchParams.set("api_key", this.apiKey);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    let lastStatus = 0;
    for (let attempt = 0; attempt <= TMDB_RETRY_LIMIT; attempt += 1) {
      const response = await fetch(url.toString(), { method: "GET" });
      if (response.ok) return response.json();
      lastStatus = response.status;

      if (response.status === 429 && attempt < TMDB_RETRY_LIMIT) {
        const delayMs = 250 * 2 ** attempt;
        await sleep(delayMs);
        continue;
      }
      throw new Error(`tmdb_http_${response.status}`);
    }
    throw new Error(`tmdb_http_${lastStatus}`);
  }
}

function buildQueryCandidates(input: LocalizeAnimeInput): string[] {
  const raw = [input.titles.english, input.titles.romaji, input.titles.native].filter(
    (value): value is string => Boolean(value),
  );
  const dedup = new Map<string, string>();

  for (const title of raw) {
    const normalized = normalizeTitle(title);
    if (!normalized) continue;
    if (!dedup.has(normalized)) dedup.set(normalized, title);
  }
  return [...dedup.values()].slice(0, 3);
}

function pickTmdbLocalizedTitle(candidate: TmdbSearchResult): string {
  return (
    candidate.name ??
    candidate.title ??
    candidate.original_name ??
    candidate.original_title ??
    ""
  );
}

async function tryTmdb(input: LocalizeAnimeInput): Promise<LocalizeInternalResult | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const requester = new TmdbRequester(apiKey);
  const queries = buildQueryCandidates(input);
  if (!queries.length) return null;

  const candidates: TmdbSearchResult[] = [];
  for (const query of queries) {
    const ko = await requester.get("/search/tv", {
      query,
      language: "ko-KR",
      include_adult: "false",
      page: "1",
    });
    candidates.push(...((ko.results as TmdbSearchResult[] | undefined) ?? []));

    const en = await requester.get("/search/tv", {
      query,
      language: "en-US",
      include_adult: "false",
      page: "1",
    });
    candidates.push(...((en.results as TmdbSearchResult[] | undefined) ?? []));
  }

  // If TV-only confidence is low, multi search can recover anime entries with weaker metadata.
  const multi = await requester.get("/search/multi", {
    query: queries[0],
    language: "ko-KR",
    include_adult: "false",
    page: "1",
  });
  candidates.push(
    ...(((multi.results as TmdbSearchResult[] | undefined) ?? []).filter(
      (item) => item.media_type === "tv" || item.media_type === "movie",
    ) as TmdbSearchResult[]),
  );

  if (!candidates.length) return null;

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreTmdbCandidate(candidate, input),
    }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;

  const status: MatchStatus =
    best.score >= 0.85 ? "matched" : best.score >= 0.7 ? "partial" : "failed";
  if (status === "failed") return null;

  const localizedTitle = pickTmdbLocalizedTitle(best.candidate);
  const localizedSynopsis = best.candidate.overview ?? "";
  const genres = computeGenreNamesFromIds(best.candidate.genre_ids);

  return {
    ko: {
      title: localizedTitle || input.titles.english || input.titles.romaji || "",
      synopsis: localizedSynopsis,
      genres,
    },
    match: {
      status,
      best_provider: "tmdb",
      confidence: best.score,
      evidence: {
        best_candidate_id: best.candidate.id,
        best_score: best.score,
        top_scores: scored.slice(0, 5).map((row) => ({
          id: row.candidate.id,
          score: row.score,
          title: pickTmdbLocalizedTitle(row.candidate),
        })),
      },
    },
  };
}

type WikiSearchItem = {
  title: string;
  pageid: number;
  snippet?: string;
};

async function searchWikipedia(query: string): Promise<WikiSearchItem[]> {
  const url = new URL("https://ko.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("format", "json");
  url.searchParams.set("utf8", "1");
  url.searchParams.set("srlimit", "5");
  url.searchParams.set("srsearch", query);

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) return [];
  const json = (await response.json()) as {
    query?: { search?: Array<{ title: string; pageid: number; snippet?: string }> };
  };
  return json.query?.search ?? [];
}

async function fetchWikipediaExtract(pageId: number): Promise<string> {
  const url = new URL("https://ko.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("exintro", "1");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("pageids", String(pageId));

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) return "";
  const json = (await response.json()) as {
    query?: { pages?: Record<string, { extract?: string }> };
  };
  const pages = json.query?.pages ?? {};
  const page = pages[String(pageId)];
  return page?.extract?.slice(0, 400) ?? "";
}

async function tryWikipediaKo(input: LocalizeAnimeInput): Promise<LocalizeInternalResult | null> {
  const queries = buildQueryCandidates(input);
  if (!queries.length) return null;

  const rows: Array<{ item: WikiSearchItem; score: number; sourceQuery: string }> = [];
  for (const query of queries.slice(0, 2)) {
    const hits = await searchWikipedia(query);
    for (const hit of hits) {
      const titleScore = similarity(hit.title, query);
      const snippet = (hit.snippet ?? "").toLowerCase();
      const keywordBonus = snippet.includes("애니메이션") || snippet.includes("만화") ? 0.08 : 0;
      rows.push({
        item: hit,
        score: clamp01(0.85 * titleScore + keywordBonus),
        sourceQuery: query,
      });
    }
  }

  if (!rows.length) return null;
  rows.sort((a, b) => b.score - a.score);
  const best = rows[0];
  if (best.score < 0.45) return null;

  const extract = await fetchWikipediaExtract(best.item.pageid);
  const confidence = clamp01(0.55 + best.score * 0.25);
  return {
    ko: {
      title: best.item.title,
      synopsis: extract,
      genres: [],
    },
    match: {
      status: "fallback",
      best_provider: "wikipedia_ko",
      confidence,
      evidence: {
        pageid: best.item.pageid,
        source_query: best.sourceQuery,
        base_score: best.score,
      },
    },
  };
}

async function translatePlaceholder(text?: string): Promise<string> {
  if (!text) return "";
  return `[번역] ${text}`;
}

async function fallbackTranslation(input: LocalizeAnimeInput): Promise<LocalizeInternalResult> {
  const baseTitle = input.titles.english || input.titles.romaji || input.titles.native || `MAL ${input.mal_id}`;
  const titleKo = await translatePlaceholder(baseTitle);
  const synopsisKo = await translatePlaceholder(input.synopsis);
  const genres = await Promise.all((input.genres ?? []).map((genre) => translatePlaceholder(genre)));

  return {
    ko: {
      title: titleKo,
      synopsis: synopsisKo,
      genres,
    },
    match: {
      status: "fallback",
      best_provider: "translation_placeholder",
      confidence: 0.35,
      evidence: { reason: "tmdb_and_wikipedia_unavailable_or_low_confidence" },
    },
  };
}

function toResponse(result: LocalizeInternalResult, cached: boolean): LocalizeAnimeResponse {
  return {
    title_ko: result.ko.title,
    synopsis_ko: result.ko.synopsis,
    confidence: result.match.confidence,
    provider: result.match.best_provider,
    cached,
  };
}

function getFallbackTitleFromStaticRepo(input: LocalizeAnimeInput): string | null {
  if (FALLBACK_BY_MAL_ID[input.mal_id]) return FALLBACK_BY_MAL_ID[input.mal_id];
  const titles = [input.titles.english, input.titles.romaji, input.titles.native].filter(
    (value): value is string => Boolean(value),
  );
  for (const title of titles) {
    const key = normalizeTitle(title);
    if (FALLBACK_BY_ALIAS[key]) return FALLBACK_BY_ALIAS[key];
  }
  return null;
}

async function getFallbackTitleFromFirestore(
  db: Firestore,
  input: LocalizeAnimeInput,
): Promise<string | null> {
  const byMal = await db.collection("anime_title_repo").doc(`mal:${input.mal_id}`).get();
  const direct = byMal.data() as { title_ko?: string } | undefined;
  if (direct?.title_ko) return direct.title_ko;

  const keys = [input.titles.english, input.titles.romaji, input.titles.native]
    .filter((value): value is string => Boolean(value))
    .map((title) => normalizeTitle(title))
    .filter(Boolean);
  if (!keys.length) return null;

  // Uses deterministic first-key probe to keep reads bounded.
  const aliasRef = await db.collection("anime_title_repo_alias").doc(keys[0]).get();
  const aliasData = aliasRef.data() as { title_ko?: string } | undefined;
  return aliasData?.title_ko ?? null;
}

async function saveResolvedTitleRepo(
  db: Firestore,
  input: LocalizeAnimeInput,
  titleKo: string,
  confidence: number,
  provider: string,
): Promise<void> {
  const normalizedAliases = [input.titles.english, input.titles.romaji, input.titles.native]
    .filter((value): value is string => Boolean(value))
    .map((title) => normalizeTitle(title))
    .filter(Boolean);

  await db.collection("anime_title_repo").doc(`mal:${input.mal_id}`).set(
    {
      mal_id: input.mal_id,
      title_ko: titleKo,
      confidence,
      provider,
      aliases: normalizedAliases,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await Promise.all(
    normalizedAliases.slice(0, 3).map((alias) =>
      db.collection("anime_title_repo_alias").doc(alias).set(
        {
          title_ko: titleKo,
          mal_id: input.mal_id,
          confidence,
          provider,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  );
}

async function saveMissingTitleRepo(db: Firestore, input: LocalizeAnimeInput): Promise<void> {
  await db.collection("anime_title_missing").doc(`mal:${input.mal_id}`).set(
    {
      mal_id: input.mal_id,
      titles: input.titles,
      year: input.year,
      type: input.type,
      synopsis: input.synopsis ?? "",
      genres: input.genres ?? [],
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

function isFreshEnough(doc: Partial<AnimeLocalizationDoc> | undefined): doc is AnimeLocalizationDoc {
  if (!doc?.match || !doc?.cache?.expires_at) return false;
  const expiresAtMs = doc.cache.expires_at.toMillis();
  return doc.match.confidence >= 0.85 && expiresAtMs > Date.now();
}

export async function localizeAnimeWithCache(
  db: Firestore,
  input: LocalizeAnimeInput,
): Promise<LocalizeAnimeResponse> {
  const docId = `mal:${input.mal_id}`;
  const ref = db.collection("anime_localization").doc(docId);
  const snapshot = await ref.get();
  const cached = snapshot.data() as AnimeLocalizationDoc | undefined;

  if (isFreshEnough(cached)) {
    return {
      title_ko: cached.ko.title,
      synopsis_ko: cached.ko.synopsis,
      confidence: cached.match.confidence,
      provider: cached.match.best_provider,
      cached: true,
    };
  }

  const fireRepoTitle = await getFallbackTitleFromFirestore(db, input);
  if (fireRepoTitle) {
    const repoResult: LocalizeInternalResult = {
      ko: {
        title: fireRepoTitle,
        synopsis: input.synopsis ?? "",
        genres: input.genres ?? [],
      },
      match: {
        status: "matched",
        best_provider: "none",
        confidence: 0.93,
        evidence: { source: "anime_title_repo" },
      },
    };
    const expiresAt = computeExpiresAt(repoResult.match.confidence);
    await ref.set(
      {
        source: {
          mal_id: input.mal_id,
          titles: input.titles,
          year: input.year,
          type: input.type,
        },
        ko: repoResult.ko,
        match: repoResult.match,
        cache: { expires_at: Timestamp.fromDate(expiresAt) },
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return toResponse(repoResult, false);
  }

  const staticTitle = getFallbackTitleFromStaticRepo(input);
  if (staticTitle) {
    const staticResult: LocalizeInternalResult = {
      ko: {
        title: staticTitle,
        synopsis: input.synopsis ?? "",
        genres: input.genres ?? [],
      },
      match: {
        status: "matched",
        best_provider: "none",
        confidence: 0.9,
        evidence: { source: "offline_fallback_repo" },
      },
    };
    await saveResolvedTitleRepo(db, input, staticTitle, staticResult.match.confidence, "offline_fallback_repo");
    const expiresAt = computeExpiresAt(staticResult.match.confidence);
    await ref.set(
      {
        source: {
          mal_id: input.mal_id,
          titles: input.titles,
          year: input.year,
          type: input.type,
        },
        ko: staticResult.ko,
        match: staticResult.match,
        cache: { expires_at: Timestamp.fromDate(expiresAt) },
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return toResponse(staticResult, false);
  }

  let result: LocalizeInternalResult | null = null;
  try {
    result = await tryTmdb(input);
  } catch {
    result = null;
  }

  if (!result) {
    try {
      result = await tryWikipediaKo(input);
    } catch {
      result = null;
    }
  }

  if (!result) {
    result = await fallbackTranslation(input);
    await saveMissingTitleRepo(db, input);
  }

  const expiresAt = computeExpiresAt(result.match.confidence);
  const doc: AnimeLocalizationDoc = {
    source: {
      mal_id: input.mal_id,
      titles: input.titles,
      year: input.year,
      type: input.type,
    },
    ko: result.ko,
    match: result.match,
    cache: {
      expires_at: Timestamp.fromDate(expiresAt),
    },
    updated_at: FieldValue.serverTimestamp(),
  };

  await ref.set(doc, { merge: true });
  if (result.match.confidence >= 0.85 && result.ko.title) {
    await saveResolvedTitleRepo(db, input, result.ko.title, result.match.confidence, result.match.best_provider);
  }
  return toResponse(result, false);
}
