import type { PostDoc } from "@/lib/mvp/types";

export const seedPosts: PostDoc[] = [
  {
    id: "seed-1",
    board_id: "rates-contract",
    author_anon_name: "익명 24",
    title: "영상 사운드 단가 협상할 때 기준 어떻게 잡나요?",
    content: "3분 내외 브랜디드 영상 믹싱 기준으로 제안서 템플릿 공유 가능하신 분?",
    tags: ["rate", "sound", "freelance"],
    status: "active",
    created_at: "2026-02-20T00:00:00.000Z",
  },
  {
    id: "seed-2",
    board_id: "feedback",
    author_anon_name: "익명 75",
    title: "키비주얼 2안 중 뭐가 더 낫는지 피드백 부탁",
    content: "브랜드가 요청한 톤이 과감한 쪽이라 B안에 기울었는데 불안하네요.",
    tags: ["feedback", "visual"],
    status: "active",
    created_at: "2026-02-19T10:00:00.000Z",
  },
];
