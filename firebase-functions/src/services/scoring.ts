import type { RiskBreakdown, ScoreOutput, Verdict } from "../types/analysis";

type ScoringInput = {
  fileFormat: string;
  durationSec?: number;
  fileSizeMb?: number;
  fileMime?: string;
  targetPlatforms: string[];
  externalMatchConfidence?: number;
  hasInternalFingerprintMatch: boolean;
  acoustIdLookupSucceeded: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function verdictFromScore(score: number): Verdict {
  if (score >= 65) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

export function calculateScores(input: ScoringInput): ScoreOutput {
  const duration = input.durationSec ?? 0;
  const size = input.fileSizeMb ?? 0;

  const externalMatchRisk = clamp(
    Math.round(
      input.externalMatchConfidence
        ? 18 + input.externalMatchConfidence * 60
        : input.hasInternalFingerprintMatch
          ? 36
          : 8,
    ),
    0,
    100,
  );

  const loopDensityRisk = clamp(
    Math.round(duration > 0 && duration < 2.5 ? 44 : duration > 0 && duration < 8 ? 26 : 10),
    0,
    100,
  );

  const vocalPresenceRisk = clamp(
    Math.round(duration > 45 ? 20 : duration > 20 ? 11 : 4),
    0,
    100,
  );

  const aiSignalRisk = clamp(
    Math.round(input.fileMime === "" || input.fileMime === "application/octet-stream" ? 24 : 10),
    0,
    100,
  );

  const metadataAnomalyRisk = clamp(
    Math.round((!["wav", "mp3"].includes(input.fileFormat) ? 24 : 6) + (size > 0 && size < 0.08 ? 14 : 0)),
    0,
    100,
  );

  const policyContextRisk = clamp(
    Math.round(input.targetPlatforms.includes("multi") ? 14 : 8),
    0,
    100,
  );

  const breakdown: RiskBreakdown = {
    external_match_risk: externalMatchRisk,
    loop_density_risk: loopDensityRisk,
    vocal_presence_risk: vocalPresenceRisk,
    ai_signal_risk: aiSignalRisk,
    metadata_anomaly_risk: metadataAnomalyRisk,
    policy_context_risk: policyContextRisk,
  };

  const weightedRisk =
    breakdown.external_match_risk * 0.35 +
    breakdown.loop_density_risk * 0.2 +
    breakdown.vocal_presence_risk * 0.15 +
    breakdown.ai_signal_risk * 0.1 +
    breakdown.metadata_anomaly_risk * 0.1 +
    breakdown.policy_context_risk * 0.1;

  const overallRiskScore = clamp(Math.round(weightedRisk), 0, 100);

  let confidenceScore = 35;
  if (input.acoustIdLookupSucceeded) confidenceScore += 15;
  if (typeof input.externalMatchConfidence === "number") confidenceScore += 20;
  if (typeof input.durationSec === "number" && input.durationSec > 0) confidenceScore += 8;
  if (input.fileMime && input.fileMime !== "application/octet-stream") confidenceScore += 6;
  if (input.hasInternalFingerprintMatch) confidenceScore += 8;
  if (!input.fileMime) confidenceScore -= 8;
  if (!input.durationSec || input.durationSec <= 0) confidenceScore -= 12;
  confidenceScore = clamp(confidenceScore, 0, 100);

  const verdict = verdictFromScore(overallRiskScore);

  const reasons: string[] = [];
  if (breakdown.external_match_risk >= 35) reasons.push("외부/내부 매칭 신호가 높습니다.");
  if (breakdown.loop_density_risk >= 30) reasons.push("반복 루프 강도가 높습니다.");
  if (breakdown.metadata_anomaly_risk >= 20) reasons.push("파일 메타데이터 이상치가 감지되었습니다.");
  if (reasons.length === 0) reasons.push("현재 수집된 신호 기준 즉시 차단 위험은 낮습니다.");

  const actions =
    verdict === "HIGH"
      ? ["샘플 출처와 라이선스를 우선 확인하세요.", "대체 샘플 사용을 검토하세요."]
      : verdict === "MEDIUM"
        ? ["배포 전 샘플 권리 상태를 재검토하세요.", "보컬/루프 구간의 출처 증빙을 확보하세요."]
        : ["상업 배포 전 최종 권리 문서를 보관하세요."];

  return {
    overallRiskScore,
    confidenceScore,
    verdict,
    breakdown,
    reasons,
    actions,
  };
}
