export type LocalizeAnimeClientInput = {
  mal_id: number;
  titles: {
    english?: string;
    romaji?: string;
    native?: string;
  };
  year?: number;
  type?: string;
  synopsis?: string;
  genres?: string[];
};

export type LocalizeAnimeClientResponse = {
  title_ko: string;
  synopsis_ko: string;
  confidence: number;
  provider: "tmdb" | "wikipedia_ko" | "translation_placeholder" | "none";
  cached: boolean;
};

export async function localizeAnimeFromApi(
  input: LocalizeAnimeClientInput,
): Promise<LocalizeAnimeClientResponse> {
  const endpoint = import.meta.env.VITE_LOCALIZE_ANIME_ENDPOINT as string | undefined;
  if (!endpoint) {
    throw new Error("VITE_LOCALIZE_ANIME_ENDPOINT is not configured.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`localizeAnime failed: ${response.status} ${body}`);
  }

  return (await response.json()) as LocalizeAnimeClientResponse;
}

/**
 * React usage example:
 *
 * const localized = await localizeAnimeFromApi({
 *   mal_id: anime.mal_id,
 *   titles: { english: anime.title, romaji: anime.title_english, native: anime.title_japanese },
 *   year: anime.year,
 *   type: anime.type,
 *   synopsis: anime.synopsis,
 *   genres: anime.genres?.map((g) => g.name) ?? [],
 * });
 */
