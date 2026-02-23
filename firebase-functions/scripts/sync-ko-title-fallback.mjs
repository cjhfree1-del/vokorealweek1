#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");
const FALLBACK_FILE = path.join(ROOT, "src/data/koTitleFallbackRepo.ts");
const MAX_MISSING_SCAN = Number(process.env.MAX_MISSING_SCAN ?? 200);
const TMDB_API_KEY = process.env.TMDB_API_KEY?.trim();

function normalizeKey(value) {
  return value
    .toLowerCase()
    .replace(/\b(season\s*\d+|part\s*\d+|cour\s*\d+|s\d+)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasHangul(value) {
  return /[가-힣]/.test(value);
}

function parseExistingRepoEntries(source) {
  const marker = /KO_TITLE_FALLBACK_REPO:\s*KoTitleFallbackEntry\[\]\s*=\s*(\[[\s\S]*?\n\]);/m;
  const match = source.match(marker);
  if (!match) throw new Error("Could not parse KO_TITLE_FALLBACK_REPO from source file.");
  const arrayLiteral = match[1];
  return vm.runInNewContext(`(${arrayLiteral})`);
}

async function resolveFromWikipedia(title) {
  if (!title) return null;
  for (const lang of ["en", "ja"]) {
    const endpoint =
      `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=langlinks` +
      `&lllang=ko&lllimit=1&redirects=1&origin=*&titles=${encodeURIComponent(title)}`;
    const res = await fetch(endpoint);
    if (!res.ok) continue;
    const json = await res.json();
    const pages = json?.query?.pages ?? {};
    for (const page of Object.values(pages)) {
      const ko = page?.langlinks?.[0]?.["*"]?.trim();
      if (ko && hasHangul(ko)) return ko;
    }
  }
  return null;
}

async function resolveFromTmdb(title, year) {
  if (!TMDB_API_KEY || !title) return null;
  const endpoint =
    `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(TMDB_API_KEY)}` +
    `&language=ko-KR&query=${encodeURIComponent(title)}&page=1&include_adult=false`;
  const res = await fetch(endpoint);
  if (!res.ok) return null;
  const json = await res.json();
  const candidates = (json?.results ?? []).filter((item) => item?.media_type === "tv" || item?.media_type === "movie");
  for (const item of candidates) {
    const ko = (item?.name || item?.title || "").trim();
    if (!ko || !hasHangul(ko)) continue;
    if (year) {
      const date = item?.first_air_date || item?.release_date || "";
      const y = Number.parseInt(String(date).slice(0, 4), 10);
      if (Number.isFinite(y) && Math.abs(y - year) > 3) continue;
    }
    return ko;
  }
  return null;
}

async function resolveKoTitle(input) {
  const candidates = [input?.titles?.english, input?.titles?.romaji, input?.titles?.native].filter(Boolean);
  for (const c of candidates) {
    const fromWiki = await resolveFromWikipedia(c);
    if (fromWiki) return fromWiki;
  }
  for (const c of candidates) {
    const fromTmdb = await resolveFromTmdb(c, input?.year);
    if (fromTmdb) return fromTmdb;
  }
  return null;
}

function toEntryLiteral(entry) {
  const aliases = [...new Set((entry.aliases ?? []).map((v) => v.trim()).filter(Boolean))];
  const malPart = entry.malId ? `, malId: ${entry.malId}` : "";
  return `  { titleKo: ${JSON.stringify(entry.titleKo)}${malPart}, aliases: ${JSON.stringify(aliases)} },`;
}

function buildFallbackFile(entries) {
  const lines = entries.map(toEntryLiteral).join("\n");
  return `export type KoTitleFallbackEntry = {
  titleKo: string;
  malId?: number;
  aliases: string[];
};

// Auto-maintained fallback map. Update via \`firebase-functions/scripts/sync-ko-title-fallback.mjs\`.
export const KO_TITLE_FALLBACK_REPO: KoTitleFallbackEntry[] = [
${lines}
];

export function normalizeKoFallbackKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\\b(season\\s*\\d+|part\\s*\\d+|cour\\s*\\d+|s\\d+)\\b/g, " ")
    .replace(/[^\\p{L}\\p{N}\\s]/gu, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

export function buildKoFallbackIndexes() {
  const byMalId: Record<number, string> = {};
  const byAlias: Record<string, string> = {};

  for (const row of KO_TITLE_FALLBACK_REPO) {
    if (row.malId) byMalId[row.malId] = row.titleKo;
    for (const alias of row.aliases) {
      const key = normalizeKoFallbackKey(alias);
      if (key && !byAlias[key]) byAlias[key] = row.titleKo;
    }
  }

  return { byMalId, byAlias };
}
`;
}

async function main() {
  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  const source = await fs.readFile(FALLBACK_FILE, "utf8");
  const existing = parseExistingRepoEntries(source);
  const byMalId = new Map();
  const aliasTaken = new Set();

  for (const row of existing) {
    const aliases = [...new Set((row.aliases ?? []).map((v) => normalizeKey(v)).filter(Boolean))];
    const normalized = { titleKo: row.titleKo, malId: row.malId, aliases };
    if (row.malId) byMalId.set(row.malId, normalized);
    for (const a of aliases) aliasTaken.add(a);
  }

  const missingSnap = await db.collection("anime_title_missing").orderBy("updated_at", "desc").limit(MAX_MISSING_SCAN).get();
  let resolvedCount = 0;

  for (const doc of missingSnap.docs) {
    const data = doc.data();
    const malId = Number(data?.mal_id);
    if (!Number.isFinite(malId)) continue;
    if (byMalId.has(malId)) continue;

    const ko = await resolveKoTitle(data);
    if (!ko) continue;

    const aliases = [data?.titles?.english, data?.titles?.romaji, data?.titles?.native]
      .filter(Boolean)
      .map((v) => normalizeKey(v));
    if (!aliases.length) continue;

    const entry = { titleKo: ko, malId, aliases: [...new Set(aliases)] };
    byMalId.set(malId, entry);
    for (const alias of entry.aliases) aliasTaken.add(alias);
    resolvedCount += 1;

    await db.collection("anime_title_repo").doc(`mal:${malId}`).set(
      {
        mal_id: malId,
        title_ko: ko,
        confidence: 0.82,
        provider: "sync_script",
        aliases: entry.aliases,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await Promise.all(
      entry.aliases.slice(0, 3).map((alias) =>
        db.collection("anime_title_repo_alias").doc(alias).set(
          {
            mal_id: malId,
            title_ko: ko,
            confidence: 0.82,
            provider: "sync_script",
            updated_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
      ),
    );
  }

  const merged = [...byMalId.values()].sort((a, b) => {
    if (a.malId && b.malId) return a.malId - b.malId;
    return (a.titleKo ?? "").localeCompare(b.titleKo ?? "");
  });

  await fs.writeFile(FALLBACK_FILE, buildFallbackFile(merged), "utf8");
  // Keep functions-side fallback synchronized for server fallback behavior.
  await fs.writeFile(path.join(ROOT, "firebase-functions/src/data/koTitleFallbackRepo.ts"), buildFallbackFile(merged), "utf8");

  console.log(`Updated fallback repo with ${merged.length} entries (newly resolved: ${resolvedCount}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
