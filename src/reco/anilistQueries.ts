export const ANILIST_ENDPOINT = "https://graphql.anilist.co";

const MEDIA_CORE_FIELDS = `
  id
  idMal
  format
  episodes
  duration
  title { romaji english native }
  synonyms
  description(asHtml: false)
  coverImage { medium large }
  genres
  tags { name rank }
  averageScore
  meanScore
  popularity
  favourites
  trending
  seasonYear
  studios { nodes { name } }
`;

export const DISCOVERY_MEDIA_QUERY = `
query (
  $genreIn: [String]
  $tagIn: [String]
  $excludeIds: [Int]
  $page: Int
  $perPage: Int
  $minAverageScore: Int
  $minPopularity: Int
  $sort: [MediaSort]
) {
  Page(page: $page, perPage: $perPage) {
    media(
      type: ANIME
      status_not_in: [NOT_YET_RELEASED]
      isAdult: false
      genre_in: $genreIn
      tag_in: $tagIn
      id_not_in: $excludeIds
      format_in: [TV, OVA, ONA, TV_SHORT]
      averageScore_greater: $minAverageScore
      popularity_greater: $minPopularity
      sort: $sort
    ) {
${MEDIA_CORE_FIELDS}
    }
  }
}
`;

export const RECOMMENDATION_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    recommendations(sort: [RATING_DESC], perPage: 30) {
      nodes {
        rating
        mediaRecommendation {
${MEDIA_CORE_FIELDS}
        }
      }
    }
  }
}
`;
