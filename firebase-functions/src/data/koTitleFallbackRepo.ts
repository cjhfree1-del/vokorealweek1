export type KoTitleFallbackEntry = {
  titleKo: string;
  malId?: number;
  aliases: string[];
};

// Auto-maintained fallback map. Update via `firebase-functions/scripts/sync-ko-title-fallback.mjs`.
export const KO_TITLE_FALLBACK_REPO: KoTitleFallbackEntry[] = [
  { titleKo: "카우보이 비밥", malId: 1, aliases: ["cowboy bebop"] },
  { titleKo: "나루토", malId: 20, aliases: ["naruto"] },
  { titleKo: "원피스", malId: 21, aliases: ["one piece"] },
  { titleKo: "신세기 에반게리온", malId: 30, aliases: ["neon genesis evangelion"] },
  { titleKo: "슬램덩크", malId: 170, aliases: ["slam dunk"] },
  { titleKo: "사무라이 참프루", malId: 205, aliases: ["samurai champloo"] },
  { titleKo: "블리치", malId: 269, aliases: ["bleach"] },
  { titleKo: "데스노트", malId: 1535, aliases: ["death note"] },
  { titleKo: "코드 기아스 반역의 를르슈", malId: 1575, aliases: ["code geass"] },
  { titleKo: "나루토 질풍전", malId: 1735, aliases: ["naruto shippuden"] },
  { titleKo: "강철의 연금술사 브라더후드", malId: 5114, aliases: ["fullmetal alchemist brotherhood"] },
  { titleKo: "슈타인즈 게이트", malId: 9253, aliases: ["steins gate"] },
  { titleKo: "마법소녀 마도카☆마기카", malId: 9756, aliases: ["puella magi madoka magica","mahou shoujo madoka magica"] },
  { titleKo: "헌터×헌터", malId: 11061, aliases: ["hunter x hunter","hunter x hunter 2011"] },
  { titleKo: "소드 아트 온라인", malId: 11757, aliases: ["sword art online"] },
  { titleKo: "쿠로코의 농구", malId: 11771, aliases: ["kuroko s basketball","kuroko no basket"] },
  { titleKo: "늑대아이", malId: 12355, aliases: ["wolf children","ookami kodomo no ame to yuki"] },
  { titleKo: "진격의 거인", malId: 16498, aliases: ["attack on titan","shingeki no kyojin"] },
  { titleKo: "노 게임 노 라이프", malId: 19815, aliases: ["no game no life"] },
  { titleKo: "하이큐!!", malId: 20583, aliases: ["haikyu","haikyuu"] },
  { titleKo: "도쿄 구울", malId: 22319, aliases: ["tokyo ghoul"] },
  { titleKo: "4월은 너의 거짓말", malId: 23273, aliases: ["your lie in april","shigatsu wa kimi no uso"] },
  { titleKo: "목소리의 형태", malId: 28851, aliases: ["a silent voice","koe no katachi"] },
  { titleKo: "오버로드", malId: 29803, aliases: ["overlord"] },
  { titleKo: "Re:제로부터 시작하는 이세계 생활", malId: 31240, aliases: ["re zero","re zero kara hajimeru isekai seikatsu"] },
  { titleKo: "아인", malId: 31580, aliases: ["ajin"] },
  { titleKo: "너의 이름은", malId: 32281, aliases: ["your name","kimi no na wa"] },
  { titleKo: "바이올렛 에버가든", malId: 33352, aliases: ["violet evergarden"] },
  { titleKo: "메이드 인 어비스", malId: 34599, aliases: ["made in abyss"] },
  { titleKo: "장난을 잘 치는 타카기 양", malId: 35860, aliases: ["teasing master takagi san","karakai jouzu no takagi san"] },
  { titleKo: "전생했더니 슬라임이었던 건에 대하여", malId: 37430, aliases: ["that time i got reincarnated as a slime","tensei shitara slime datta ken"] },
  { titleKo: "약속의 네버랜드", malId: 37779, aliases: ["the promised neverland","yakusoku no neverland"] },
  { titleKo: "카구야 님은 고백받고 싶어", malId: 37999, aliases: ["kaguya sama love is war","kaguya sama wa kokurasetai"] },
  { titleKo: "귀멸의 칼날", malId: 38000, aliases: ["demon slayer","kimetsu no yaiba"] },
  { titleKo: "날씨의 아이", malId: 38826, aliases: ["weathering with you","tenki no ko"] },
  { titleKo: "악마에 입문했습니다! 이루마 군", malId: 39196, aliases: ["welcome to demon school iruma kun","mairimashita iruma kun"] },
  { titleKo: "무직전생", malId: 39535, aliases: ["mushoku tensei","jobless reincarnation"] },
  { titleKo: "진격의 거인 파이널 시즌", malId: 40028, aliases: ["attack on titan final season","shingeki no kyojin the final season"] },
  { titleKo: "주술회전", malId: 40748, aliases: ["jujutsu kaisen"] },
  { titleKo: "블리치 천년혈전", malId: 41467, aliases: ["bleach thousand year blood war"] },
  { titleKo: "도쿄 리벤저스", malId: 42249, aliases: ["tokyo revengers"] },
  { titleKo: "사이버펑크: 엣지러너", malId: 42310, aliases: ["cyberpunk edgerunners"] },
  { titleKo: "괴롭히지 말아요, 나가토로 양", malId: 42361, aliases: ["don t toy with me miss nagatoro","ijiranaide nagatoro san"] },
  { titleKo: "체인소 맨", malId: 44511, aliases: ["chainsaw man"] },
  { titleKo: "봇치 더 록!", malId: 47917, aliases: ["bocchi the rock"] },
  { titleKo: "귀멸의 칼날 무한열차편", malId: 49926, aliases: ["demon slayer mugen train arc","kimetsu no yaiba mugen ressha hen"] },
  { titleKo: "스파이 패밀리", malId: 50265, aliases: ["spy x family","spy family"] },
  { titleKo: "스즈메의 문단속", malId: 50594, aliases: ["suzume","suzume no tojimari"] },
  { titleKo: "주술회전", malId: 51009, aliases: ["jujutsu kaisen"] },
  { titleKo: "무직전생", malId: 51179, aliases: ["mushoku tensei"] },
  { titleKo: "최애의 아이", malId: 52034, aliases: ["oshi no ko"] },
  { titleKo: "나 혼자만 레벨업", malId: 52299, aliases: ["solo leveling","ore dake level up na ken"] },
  { titleKo: "내 마음의 위험한 녀석", malId: 52578, aliases: ["the dangers in my heart","boku no kokoro no yabai yatsu","bokuyaba"] },
  { titleKo: "괴수 8호", malId: 52588, aliases: ["kaiju no 8","kaijuu 8 gou"] },
  { titleKo: "던전밥", malId: 52701, aliases: ["delicious in dungeon","dungeon meshi"] },
  { titleKo: "장송의 프리렌", malId: 52991, aliases: ["frieren beyond journey s end","sousou no frieren"] },
  { titleKo: "약사의 혼잣말", malId: 54492, aliases: ["the apothecary diaries","kusuriya no hitorigoto"] },
  { titleKo: "윈드 브레이커", malId: 54900, aliases: ["wind breaker"] },
  { titleKo: "내 마음의 위험한 녀석", malId: 55690, aliases: ["the dangers in my heart","boku no kokoro no yabai yatsu"] },
];

export function normalizeKoFallbackKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(season\s*\d+|part\s*\d+|cour\s*\d+|s\d+)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
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
