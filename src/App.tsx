import { useMemo, useState } from "react";

type CheckLevel = "PASS" | "CAUTION" | "BLOCK";

type CheckResult = {
  level: CheckLevel;
  score: number;
  reasons: string[];
  action: string;
};

function evaluateSample(
  hasLicenseDoc: boolean,
  isAIGenerated: boolean,
  containsThirdPartyLoop: boolean,
  sourceUnknown: boolean,
): CheckResult {
  let score = 15;
  const reasons: string[] = [];

  if (!hasLicenseDoc) {
    score += 30;
    reasons.push("샘플 클리어/라이선스 증빙이 없습니다.");
  }

  if (isAIGenerated) {
    score += 25;
    reasons.push("AI 생성 샘플로 표시되어 플랫폼 정책 이슈 가능성이 있습니다.");
  }

  if (containsThirdPartyLoop) {
    score += 20;
    reasons.push("서드파티 루프/샘플 포함 가능성이 있습니다.");
  }

  if (sourceUnknown) {
    score += 20;
    reasons.push("원본 출처를 증명할 수 없습니다.");
  }

  score = Math.min(100, score);

  if (score >= 70) {
    return {
      level: "BLOCK",
      score,
      reasons,
      action: "배포 중지 후 샘플 출처/라이선스 문서를 먼저 확보하세요.",
    };
  }

  if (score >= 40) {
    return {
      level: "CAUTION",
      score,
      reasons,
      action: "배포 전 권리 확인 문서와 프로젝트별 사용 허용 범위를 검토하세요.",
    };
  }

  return {
    level: "PASS",
    score,
    reasons: reasons.length ? reasons : ["현재 입력 기준으로 주요 리스크 신호가 낮습니다."],
    action: "배포 전 최종 메타데이터/크레딧 표기만 확인하세요.",
  };
}

export default function App() {
  const [sampleName, setSampleName] = useState("");
  const [platform, setPlatform] = useState("spotify");
  const [hasLicenseDoc, setHasLicenseDoc] = useState(false);
  const [isAIGenerated, setIsAIGenerated] = useState(false);
  const [containsThirdPartyLoop, setContainsThirdPartyLoop] = useState(false);
  const [sourceUnknown, setSourceUnknown] = useState(false);

  const result = useMemo(
    () => evaluateSample(hasLicenseDoc, isAIGenerated, containsThirdPartyLoop, sourceUnknown),
    [hasLicenseDoc, isAIGenerated, containsThirdPartyLoop, sourceUnknown],
  );

  return (
    <div className="page">
      <header className="hero card">
        <p className="kicker">VOKO SAMPLE RISK CHECKER</p>
        <h1>샘플이 수익화/유통에서 걸릴지 사전 점검</h1>
        <p className="muted">
          Spotify, YouTube Music 등 업로드 전 리스크를 빠르게 확인하는 프로듀서용 웹앱입니다.
          이 결과는 법률 확정이 아닌 사전 위험도 체크입니다.
        </p>
      </header>

      <main className="layout">
        <section className="card">
          <h2>샘플 정보 입력</h2>
          <label className="label">
            샘플 이름
            <input
              className="input"
              value={sampleName}
              onChange={(e) => setSampleName(e.target.value)}
              placeholder="예: dark_pad_loop_01.wav"
            />
          </label>

          <label className="label">
            타겟 플랫폼
            <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="spotify">Spotify</option>
              <option value="youtube-music">YouTube Music</option>
              <option value="apple-music">Apple Music</option>
              <option value="multi">멀티 배포</option>
            </select>
          </label>

          <div className="checks">
            <label className="check"><input type="checkbox" checked={hasLicenseDoc} onChange={(e) => setHasLicenseDoc(e.target.checked)} /> 라이선스/클리어 문서 보유</label>
            <label className="check"><input type="checkbox" checked={isAIGenerated} onChange={(e) => setIsAIGenerated(e.target.checked)} /> AI 생성 샘플 포함</label>
            <label className="check"><input type="checkbox" checked={containsThirdPartyLoop} onChange={(e) => setContainsThirdPartyLoop(e.target.checked)} /> 서드파티 루프/원샷 사용</label>
            <label className="check"><input type="checkbox" checked={sourceUnknown} onChange={(e) => setSourceUnknown(e.target.checked)} /> 원본 출처 불명확</label>
          </div>
        </section>

        <section className="card">
          <h2>리스크 결과</h2>
          <p className={`badge badge-${result.level.toLowerCase()}`}>{result.level}</p>
          <p className="score">Risk Score: {result.score}/100</p>
          <p className="muted">샘플: {sampleName || "미입력"} / 플랫폼: {platform}</p>

          <div>
            <p className="label-title">판정 근거</p>
            <ul className="list">
              {result.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="label-title">권장 액션</p>
            <p>{result.action}</p>
          </div>
        </section>
      </main>

      <footer className="foot muted">
        <p>Firebase + GitHub + Cloudflare Pages 배포 구조</p>
        <p>Google Analytics / Microsoft Clarity / AdSense 스크립트 적용</p>
      </footer>
    </div>
  );
}
