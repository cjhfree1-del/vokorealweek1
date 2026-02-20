import { useRef, useState } from "react";

type CheckLevel = "PASS" | "CAUTION" | "BLOCK";

type CheckResult = {
  level: CheckLevel;
  score: number;
  reasons: string[];
  action: string;
  fileName: string;
  fileType: string;
  fileSizeMb: string;
  durationSec: string;
  platform: string;
};

type ViewMode = "input" | "result";

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

    const duration = await getAudioDuration(sampleFile);
    const nextResult = evaluateSample(sampleFile, duration, platform);

    setResult(nextResult);
    setViewMode("result");
    setIsAnalyzing(false);
  }

  function openFilePicker() {
    fileInputRef.current?.click();
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

            <label className="label">
              타겟 플랫폼
              <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="spotify">Spotify</option>
                <option value="youtube-music">YouTube Music</option>
                <option value="apple-music">Apple Music</option>
                <option value="multi">멀티 배포</option>
              </select>
            </label>

            <label className="label" htmlFor="sample-file-input">
              샘플 파일 업로드 (drag & paste / wav, mp3)
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

            <div
              className={`dropzone ${isDragging ? "dragging" : ""}`}
              tabIndex={0}
              role="button"
              onClick={openFilePicker}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleSelectedFile(e.dataTransfer.files?.[0] ?? null);
              }}
              onPaste={(e) => {
                handleSelectedFile(e.clipboardData.files?.[0] ?? null);
              }}
            >
              <p className="drop-title">파일을 여기로 드래그하거나 붙여넣기(Ctrl+V)</p>
              <p className="muted">또는 클릭해서 파일 선택</p>
            </div>

            {sampleFile && (
              <p className="muted">선택 파일: {sampleFile.name}</p>
            )}

            {errorMessage && <p className="error-text">{errorMessage}</p>}

            <button className="btn" type="button" onClick={handleAnalyze} disabled={isAnalyzing}>
              {isAnalyzing ? "분석 중..." : "리스크 분석하기"}
            </button>
          </section>
        </main>
      )}

      {viewMode === "result" && result && (
        <main className="stack">
          <section className="card result-card">
            <h2>리스크 결과</h2>
            <p className={`badge badge-${result.level.toLowerCase()}`}>{result.level}</p>
            <p className="score">Risk Score: {result.score}/100</p>

            <div className="meta-grid">
              <p><strong>파일:</strong> {result.fileName}</p>
              <p><strong>형식:</strong> {result.fileType}</p>
              <p><strong>용량:</strong> {result.fileSizeMb} MB</p>
              <p><strong>재생 길이:</strong> {result.durationSec} sec</p>
              <p><strong>플랫폼:</strong> {result.platform}</p>
            </div>

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
