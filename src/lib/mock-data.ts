export type Channel = {
  slug: string;
  name: string;
  members: string;
  vibe: string;
  tags: string[];
};

export type Post = {
  id: string;
  title: string;
  channel: string;
  author: string;
  time: string;
  body: string;
  tags: string[];
  reactions: number;
  comments: number;
};

export type Job = {
  id: string;
  title: string;
  studio: string;
  location: string;
  pay: string;
  type: string;
  closing: string;
  tags: string[];
};

export const channels: Channel[] = [
  {
    slug: "visual",
    name: "Visual Lab",
    members: "12.4k",
    vibe: "포스터, 아트워크, 키비주얼",
    tags: ["graphic", "poster", "brand"],
  },
  {
    slug: "sound",
    name: "Sound Room",
    members: "8.9k",
    vibe: "사운드 디자인, 믹싱, 작곡",
    tags: ["mixing", "scoring", "studio"],
  },
  {
    slug: "film",
    name: "Frame House",
    members: "10.1k",
    vibe: "뮤직비디오, 촬영, 편집",
    tags: ["mv", "editing", "cinema"],
  },
  {
    slug: "performance",
    name: "Stage Lab",
    members: "6.2k",
    vibe: "퍼포먼스, 무브먼트, 안무",
    tags: ["choreo", "live", "direction"],
  },
];

export const posts: Post[] = [
  {
    id: "p-001",
    title: "익명으로 사운드 레퍼런스 요청합니다",
    channel: "Sound Room",
    author: "익명 58",
    time: "2시간 전",
    body:
      "베이스가 넓고 리버브가 깊은 느낌의 곡 레퍼런스 찾고 있어요. 00년대 감성도 OK.",
    tags: ["reference", "mix"],
    reactions: 128,
    comments: 24,
  },
  {
    id: "p-002",
    title: "포스터 키비주얼 피드백 구합니다",
    channel: "Visual Lab",
    author: "익명 11",
    time: "3시간 전",
    body:
      "Y2K 질감 + 실크스크린 무드입니다. 컬러 밸런스 어떤지 의견 부탁해요.",
    tags: ["feedback", "poster"],
    reactions: 94,
    comments: 18,
  },
  {
    id: "p-003",
    title: "라이브 무대 동선 설계 팁?",
    channel: "Stage Lab",
    author: "익명 72",
    time: "5시간 전",
    body:
      "3분짜리 무대에서 프론트-센터-백 동선이 답답합니다. 개선 팁 있을까요?",
    tags: ["stage", "choreo"],
    reactions: 77,
    comments: 12,
  },
];

export const jobs: Job[] = [
  {
    id: "j-101",
    title: "뮤직비디오 편집자 (프리랜서)",
    studio: "Neon River",
    location: "서울 / 원격",
    pay: "건당 180-250",
    type: "프로젝트",
    closing: "3일 후 마감",
    tags: ["editing", "premiere"],
  },
  {
    id: "j-102",
    title: "키비주얼 디자이너",
    studio: "Loud Paper",
    location: "서울 성수",
    pay: "협의",
    type: "계약직",
    closing: "채용 시 마감",
    tags: ["branding", "poster"],
  },
  {
    id: "j-103",
    title: "사운드 디자이너 (게임 OST)",
    studio: "Studio 402",
    location: "부산 / 원격",
    pay: "월 320",
    type: "정규직",
    closing: "7일 후 마감",
    tags: ["sound", "mixing"],
  },
];
