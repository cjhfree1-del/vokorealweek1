import { useMemo, useState } from "react";

type CharacterId = "yuna" | "aria";

type GameState = {
  yuna: number;
  aria: number;
  courage: number;
};

type Choice = {
  label: string;
  effects?: Partial<GameState>;
  next: string | ((state: GameState) => string);
};

type Scene = {
  id: string;
  day: string;
  place: string;
  speaker: string;
  text: string;
  choices?: Choice[];
  next?: string;
};

const INITIAL_STATE: GameState = {
  yuna: 0,
  aria: 0,
  courage: 0,
};

const SCENES: Scene[] = [
  {
    id: "prologue",
    day: "4월 3일 월요일",
    place: "새봄고 2학년 복도",
    speaker: "나",
    text: "전학 첫날. 문 앞에서 숨 고르는 사이, 누군가 내 이름을 먼저 불렀다.",
    next: "first-meet",
  },
  {
    id: "first-meet",
    day: "4월 3일 월요일",
    place: "교실 앞",
    speaker: "유나",
    text: "" +
      "혹시 전학생? 나는 유나. 길 잃을까 봐 기다렸어. 같이 들어갈래?",
    choices: [
      { label: "고맙다고 웃으며 같이 들어간다", effects: { yuna: 2, courage: 1 }, next: "class-intro" },
      { label: "긴장해서 짧게 인사만 한다", effects: { yuna: 1 }, next: "class-intro" },
      { label: "괜히 허세 부리며 혼자 들어간다", effects: { courage: 1 }, next: "class-intro" },
    ],
  },
  {
    id: "class-intro",
    day: "4월 5일 수요일",
    place: "방과 후 교실",
    speaker: "아리아",
    text: "창가에 앉은 아리아가 책을 덮었다. '넌 소설 좋아하지? 문예부 모집 중이야.'",
    choices: [
      { label: "관심 있다며 자세히 묻는다", effects: { aria: 2 }, next: "club-split" },
      { label: "유나와 운동장 구경하러 간다", effects: { yuna: 2 }, next: "club-split" },
      { label: "둘 다 신경 쓰여 반반 시간 쓰기", effects: { yuna: 1, aria: 1 }, next: "club-split" },
    ],
  },
  {
    id: "club-split",
    day: "4월 11일 화요일",
    place: "동아리 홍보제",
    speaker: "나",
    text: "축제 준비를 도울 사람이 필요하다는 연락이 동시에 왔다. 어디로 갈까?",
    choices: [
      { label: "유나의 밴드부 무대 리허설 도와주기", effects: { yuna: 2 }, next: "night-call" },
      { label: "아리아의 문예부 낭독회 원고 교정", effects: { aria: 2 }, next: "night-call" },
      { label: "둘 다 무리해서 뛰어다닌다", effects: { yuna: 1, aria: 1, courage: 1 }, next: "night-call" },
    ],
  },
  {
    id: "night-call",
    day: "4월 17일 월요일",
    place: "기숙사 옥상",
    speaker: "나",
    text: "밤 11시. 핸드폰엔 유나와 아리아의 부재중이 동시에 찍혀 있다.",
    choices: [
      { label: "유나에게 먼저 전화한다", effects: { yuna: 2 }, next: "pre-festival" },
      { label: "아리아에게 먼저 전화한다", effects: { aria: 2 }, next: "pre-festival" },
      { label: "둘 다 문자로 내일 보자고 보낸다", effects: { courage: 1 }, next: "pre-festival" },
    ],
  },
  {
    id: "pre-festival",
    day: "4월 28일 금요일",
    place: "봄빛제 전날",
    speaker: "유나",
    text: "'내일 끝나고 할 말 있어.' 유나의 메시지와, 아리아의 '나도.'가 거의 동시에 도착했다.",
    next: "confession",
  },
  {
    id: "confession",
    day: "4월 29일 토요일",
    place: "봄빛제 불꽃놀이",
    speaker: "나",
    text: "불꽃이 터지는 순간. 나는 마음을 정해야 한다.",
    choices: [
      {
        label: "유나에게 고백한다",
        effects: { courage: 2 },
        next: (state) => (state.yuna >= 7 ? "ending-yuna-good" : "ending-yuna-bad"),
      },
      {
        label: "아리아에게 고백한다",
        effects: { courage: 2 },
        next: (state) => (state.aria >= 7 ? "ending-aria-good" : "ending-aria-bad"),
      },
      {
        label: "지금은 고백하지 않는다",
        next: (state) => (state.courage >= 4 ? "ending-solo-growth" : "ending-solo-plain"),
      },
    ],
  },
  {
    id: "ending-yuna-good",
    day: "엔딩",
    place: "운동장 관중석",
    speaker: "유나",
    text: "'나도 같은 마음이었어.' 불꽃보다 더 밝게 웃는 유나와, 우리는 첫 데이트 약속을 잡았다. [유나 루트 해피 엔딩]",
  },
  {
    id: "ending-yuna-bad",
    day: "엔딩",
    place: "운동장 관중석",
    speaker: "유나",
    text: "유나는 미안하다고 말했지만, 마지막엔 웃으며 손을 내밀었다. '친구로도 소중해.' [유나 루트 노멀 엔딩]",
  },
  {
    id: "ending-aria-good",
    day: "엔딩",
    place: "도서관 뒤 정원",
    speaker: "아리아",
    text: "아리아는 한참 침묵하다가 내 손끝을 잡았다. '이번엔 네가 먼저 말했네.' [아리아 루트 해피 엔딩]",
  },
  {
    id: "ending-aria-bad",
    day: "엔딩",
    place: "도서관 뒤 정원",
    speaker: "아리아",
    text: "아리아는 조용히 고개를 저었지만, 내 노트를 돌려주며 웃었다. '계속 같이 쓰자.' [아리아 루트 노멀 엔딩]",
  },
  {
    id: "ending-solo-growth",
    day: "엔딩",
    place: "학교 정문",
    speaker: "나",
    text: "오늘은 고백하지 않았지만 도망치지도 않았다. 다음 계절엔 더 솔직해질 수 있을 것 같다. [성장 엔딩]",
  },
  {
    id: "ending-solo-plain",
    day: "엔딩",
    place: "집으로 가는 버스",
    speaker: "나",
    text: "아무 말도 하지 못한 채 축제는 끝났다. 다음엔 용기를 내자고 마음속으로만 다짐했다. [일상 엔딩]",
  },
];

const SCENE_MAP = new Map(SCENES.map((scene) => [scene.id, scene]));

function clamp(value: number): number {
  return Math.max(0, Math.min(10, value));
}

function applyEffects(base: GameState, effects?: Partial<GameState>): GameState {
  if (!effects) return base;
  return {
    yuna: clamp(base.yuna + (effects.yuna ?? 0)),
    aria: clamp(base.aria + (effects.aria ?? 0)),
    courage: clamp(base.courage + (effects.courage ?? 0)),
  };
}

function meter(value: number): string {
  return "#".repeat(value).padEnd(10, "-");
}

function endingReached(sceneId: string): boolean {
  return sceneId.startsWith("ending-");
}

export default function App() {
  const [playerName, setPlayerName] = useState("");
  const [started, setStarted] = useState(false);
  const [sceneId, setSceneId] = useState("prologue");
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [history, setHistory] = useState<string[]>([]);

  const currentScene = SCENE_MAP.get(sceneId) ?? SCENE_MAP.get("prologue")!;

  const chapter = useMemo(() => {
    const index = SCENES.findIndex((scene) => scene.id === sceneId);
    if (index < 0) return `DAY 1`;
    return `DAY ${Math.min(6, index + 1)}`;
  }, [sceneId]);

  function startGame() {
    if (!playerName.trim()) return;
    setStarted(true);
  }

  function advance(next: string | ((value: GameState) => string), effects?: Partial<GameState>) {
    const nextState = applyEffects(state, effects);
    const resolved = typeof next === "function" ? next(nextState) : next;

    setState(nextState);
    setHistory((prev) => [...prev, currentScene.id]);
    setSceneId(resolved);
  }

  function nextScene() {
    if (!currentScene.next) return;
    advance(currentScene.next);
  }

  function restart() {
    setSceneId("prologue");
    setState(INITIAL_STATE);
    setHistory([]);
    setStarted(false);
  }

  if (!started) {
    return (
      <main className="vn-shell intro-screen">
        <section className="intro-card">
          <p className="logo">SPRING SIGNAL</p>
          <h1>미연시: 봄빛제의 고백</h1>
          <p>선택지에 따라 유나/아리아 호감도와 엔딩이 달라집니다.</p>
          <div className="intro-row">
            <input
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder="주인공 이름 입력"
              aria-label="주인공 이름"
            />
            <button onClick={startGame}>게임 시작</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="vn-shell">
      <section className="hud">
        <div>
          <p className="chip">{chapter}</p>
          <p className="place">{currentScene.day} · {currentScene.place}</p>
        </div>
        <div className="meters">
          <p>유나 호감도 [{meter(state.yuna)}] {state.yuna}/10</p>
          <p>아리아 호감도 [{meter(state.aria)}] {state.aria}/10</p>
          <p>용기 [{meter(state.courage)}] {state.courage}/10</p>
        </div>
      </section>

      <section className="stage">
        <div className="bg-layer" />
        <article className="dialogue-box">
          <p className="speaker">{currentScene.speaker}</p>
          <h2>{playerName}</h2>
          <p className="line">{currentScene.text}</p>

          {!!currentScene.choices?.length && (
            <div className="choices">
              {currentScene.choices.map((choice) => (
                <button
                  key={choice.label}
                  className="choice-btn"
                  onClick={() => advance(choice.next, choice.effects)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          )}

          {!currentScene.choices && currentScene.next && (
            <button className="next-btn" onClick={nextScene}>다음 장면</button>
          )}

          {endingReached(sceneId) && (
            <div className="ending-actions">
              <p>플레이 기록: {history.length + 1}개 장면 진행</p>
              <button className="next-btn" onClick={restart}>처음부터 다시</button>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
