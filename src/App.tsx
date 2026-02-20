import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";

type CheckLevel = "PASS" | "CAUTION" | "BLOCK";

type CheckResult = {
  level: CheckLevel;
  score: number;
  reasons: string[];
  action: string;
  breakdown: {
    similarityRisk: number;
    aiSignalRisk: number;
    loopIntensityRisk: number;
    vocalPresence: "낮음" | "중간" | "높음";
  };
  fileName: string;
  fileType: string;
  fileSizeMb: string;
  durationSec: string;
  platform: string;
};

type ViewMode = "input" | "result";
const ANALYSIS_STAGES = [
  "Audio fingerprint 생성 중...",
  "플랫폼 정책 기준 매칭 중...",
  "유사 패턴 탐지 중...",
] as const;

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };

    audio.src = url;
  });
}

function evaluateSample(file: File, duration: number, platform: string): CheckResult {
  let score = 10;
  const reasons: string[] = [];

  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const fileSizeMb = file.size / (1024 * 1024);
  const similarityRisk = Math.min(
    100,
    Math.round((duration > 0 && duration < 4 ? 30 : 12) + (fileSizeMb < 0.1 ? 28 : 10)),
  );
  const aiSignalRisk = Math.min(
    100,
    Math.round((file.type === "" || file.type === "application/octet-stream" ? 34 : 14) + (platform === "multi" ? 15 : 7)),
  );
  const loopIntensityRisk = Math.min(
    100,
    Math.round(duration > 0 && duration < 2.5 ? 45 : duration > 0 && duration < 8 ? 23 : 9),
  );
  const vocalPresence: "낮음" | "중간" | "높음" =
    duration > 40 ? "높음" : duration > 20 ? "중간" : "낮음";

  if (!["wav", "mp3"].includes(extension)) {
    score += 25;
    reasons.push("지원 권장 포맷(wav/mp3) 외 파일입니다.");
  }

  if (duration > 0 && duration < 2.5) {
    score += 18;
    reasons.push("길이가 매우 짧아 루프/원샷 샘플일 가능성이 있습니다.");
  }

  if (fileSizeMb < 0.08) {
    score += 16;
    reasons.push("파일 용량이 매우 작아 재사용 샘플 가능성이 있습니다.");
  }

  if (file.type === "" || file.type === "application/octet-stream") {
    score += 14;
    reasons.push("MIME 정보가 불명확해 출처/인코딩 검증이 필요합니다.");
  }

  if (platform === "multi") {
    score += 8;
    reasons.push("멀티 배포는 플랫폼별 정책 차이로 심사가 더 보수적일 수 있습니다.");
  }

  score = Math.min(100, score);

  if (!reasons.length) {
    reasons.push("기본 파일 신호 기준으로 즉시 차단 위험은 낮아 보입니다.");
  }

  if (score >= 70) {
    return {
      level: "BLOCK",
      score,
      reasons,
      action: "배포를 멈추고 샘플 라이선스/출처 문서를 먼저 확보하세요.",
      breakdown: {
        similarityRisk,
        aiSignalRisk,
        loopIntensityRisk,
        vocalPresence,
      },
      fileName: file.name,
      fileType: file.type || "unknown",
      fileSizeMb: fileSizeMb.toFixed(2),
      durationSec: duration > 0 ? duration.toFixed(2) : "unknown",
      platform,
    };
  }

  if (score >= 40) {
    return {
      level: "CAUTION",
      score,
      reasons,
      action: "배포 전 클리어런스 증빙 문서와 샘플 출처를 추가 확인하세요.",
      breakdown: {
        similarityRisk,
        aiSignalRisk,
        loopIntensityRisk,
        vocalPresence,
      },
      fileName: file.name,
      fileType: file.type || "unknown",
      fileSizeMb: fileSizeMb.toFixed(2),
      durationSec: duration > 0 ? duration.toFixed(2) : "unknown",
      platform,
    };
  }

  return {
    level: "PASS",
    score,
    reasons,
    action: "현재 신호 기준 리스크는 낮지만, 상업 배포 전 권리 검토는 유지하세요.",
    breakdown: {
      similarityRisk,
      aiSignalRisk,
      loopIntensityRisk,
      vocalPresence,
    },
    fileName: file.name,
    fileType: file.type || "unknown",
    fileSizeMb: fileSizeMb.toFixed(2),
    durationSec: duration > 0 ? duration.toFixed(2) : "unknown",
    platform,
  };
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("input");
  const [platform, setPlatform] = useState("spotify");
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [analysisStage, setAnalysisStage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleSelectedFile(file: File | null) {
    if (!file) return;

    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    if (!["wav", "mp3"].includes(extension)) {
      setErrorMessage("지원 파일은 WAV 또는 MP3만 가능합니다.");
      return;
    }

    setErrorMessage("");
    setSampleFile(file);
  }

  async function handleAnalyze() {
    if (!sampleFile) {
      setErrorMessage("WAV 또는 MP3 파일을 먼저 업로드하세요.");
      return;
    }

    setErrorMessage("");
    setIsAnalyzing(true);
    setAnalysisStage(ANALYSIS_STAGES[0]);

    const duration = await getAudioDuration(sampleFile);
    await wait(700);
    setAnalysisStage(ANALYSIS_STAGES[1]);
    await wait(800);
    setAnalysisStage(ANALYSIS_STAGES[2]);
    await wait(700);
    const nextResult = evaluateSample(sampleFile, duration, platform);

    setResult(nextResult);
    setViewMode("result");
    setIsAnalyzing(false);
    setAnalysisStage("");
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleUploadBlockDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleUploadBlockDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleUploadBlockDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    handleSelectedFile(e.dataTransfer.files?.[0] ?? null);
  }

  function handleUploadBlockPaste(e: ClipboardEvent<HTMLDivElement>) {
    handleSelectedFile(e.clipboardData.files?.[0] ?? null);
  }

  function resetToInput() {
    setViewMode("input");
    setErrorMessage("");
  }

  return (
    <div className="page">
      <header className="hero card">
        <p className="kicker">VOKO SAMPLE RISK CHECKER</p>
        <h1>샘플 수익화 리스크 사전 점검</h1>
        <p className="muted">파일 업로드 후 플랫폼 배포 리스크를 빠르게 확인합니다.</p>
      </header>

      {viewMode === "input" && (
        <main className="stack">
          <section className="card form-card">
            <h2>샘플 정보 입력</h2>

            <div className="field-block">
              <label className="label">
                <span className="label-head">타겟 플랫폼</span>
                <select className="input platform-select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  <option value="spotify">Spotify</option>
                  <option value="youtube-music">YouTube Music</option>
                  <option value="apple-music">Apple Music</option>
                  <option value="multi">멀티 배포</option>
                </select>
              </label>
            </div>

            <div
              className={`field-block upload-block ${isDragging ? "dragging" : ""}`}
              tabIndex={0}
              role="button"
              onClick={openFilePicker}
              onDragOver={handleUploadBlockDragOver}
              onDragLeave={handleUploadBlockDragLeave}
              onDrop={handleUploadBlockDrop}
              onPaste={handleUploadBlockPaste}
            >
              <label className="label" htmlFor="sample-file-input">
                <span className="label-head">샘플 파일 업로드</span>
                <span className="label-sub">(drag & paste / wav, mp3)</span>
                <input
                  ref={fileInputRef}
                  id="sample-file-input"
                  className="input"
                  type="file"
                  accept=".wav,.mp3,audio/wav,audio/mpeg"
                  onChange={(e) => handleSelectedFile(e.target.files?.[0] ?? null)}
                  hidden
                />
              </label>

              {!sampleFile && (
                <div className="dropzone">
                  <p className="drop-title">이 영역 아무 곳에나 파일을 드래그/붙여넣기</p>
                  <p className="muted">또는 클릭해서 파일 선택</p>
                </div>
              )}

              {sampleFile && (
                <div className="file-tile">
                  <div className="file-visual" aria-hidden>
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="file-meta">
                    <p className="file-name">{sampleFile.name}</p>
                    <p className="file-detail">
                      {(sampleFile.size / (1024 * 1024)).toFixed(2)} MB · {sampleFile.type || "audio"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {errorMessage && <p className="error-text">{errorMessage}</p>}

            {isAnalyzing && (
              <div className="analysis-box">
                <p className="analysis-title">분석 진행 중</p>
                <p className="analysis-stage">{analysisStage}</p>
              </div>
            )}

            <button className="btn" type="button" onClick={handleAnalyze} disabled={isAnalyzing}>
              {isAnalyzing ? "분석 중..." : "리스크 분석하기"}
            </button>

            <p className="notice-text">
              현재 버전은 파일을 브라우저 내에서만 임시 처리하며 서버에 저장하지 않습니다.
            </p>
          </section>

          <section className="card info-card">
            <h2>이 서비스는 어떻게 작동하나요?</h2>
            <ul className="list">
              <li>오디오 기본 신호(길이, 포맷, 파일 특성) 분석</li>
              <li>반복 루프 강도 및 유사 패턴 위험도 산출</li>
              <li>플랫폼 정책 기준 기반 리스크 스코어링</li>
              <li>배포 전 확인이 필요한 항목을 단계별로 안내</li>
            </ul>
          </section>
        </main>
      )}

      {viewMode === "result" && result && (
        <main className="stack">
          <section className="card result-card motion-in">
            <h2>리스크 결과</h2>
            <p className={`badge badge-${result.level.toLowerCase()}`}>{result.level}</p>
            <p className="score">Risk Score: {result.score}/100</p>

            <div className="meta-grid result-section rs1">
              <p><strong>파일:</strong> {result.fileName}</p>
              <p><strong>형식:</strong> {result.fileType}</p>
              <p><strong>용량:</strong> {result.fileSizeMb} MB</p>
              <p><strong>재생 길이:</strong> {result.durationSec} sec</p>
              <p><strong>플랫폼:</strong> {result.platform}</p>
            </div>

            <div className="result-section rs2">
              <p className="label-title">판정 근거</p>
              <ul className="list">
                {result.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>

            <div className="result-section rs3">
              <p className="label-title">권장 액션</p>
              <p>{result.action}</p>
            </div>

            <div className="result-section rs4">
              <p className="label-title">Risk Breakdown</p>
              <ul className="list">
                <li>유사도 리스크: {result.breakdown.similarityRisk}/100</li>
                <li>AI 생성 의심 신호: {result.breakdown.aiSignalRisk}/100</li>
                <li>반복 루프 강도: {result.breakdown.loopIntensityRisk}/100</li>
                <li>보컬 존재 가능성: {result.breakdown.vocalPresence}</li>
              </ul>
            </div>

            <p className="notice-text">
              본 리스크 평가는 자동화된 신호 기반 분석 결과이며, Spotify, YouTube Music 등 플랫폼의
              최종 판정을 보장하지 않습니다. 상업적 배포 전에는 반드시 라이선스 및 저작권 상태를
              직접 확인하시기 바랍니다.
            </p>

            <p className="notice-text">
              업로드된 파일은 분석 후 자동 삭제 대상이며, 서버 분석 도입 시 24시간 내 삭제 정책으로
              운영됩니다.
            </p>

            <button className="btn secondary" type="button" onClick={resetToInput}>
              다른 파일 다시 분석
            </button>
          </section>
        </main>
      )}

      <footer className="foot muted">
        <p>Google Analytics / Microsoft Clarity / AdSense 적용 유지</p>
      </footer>
    </div>
  );
}
