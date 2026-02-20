export type RequestStatus = "queued" | "processing" | "done" | "failed";

export type Verdict = "LOW" | "MEDIUM" | "HIGH";

export type AnalysisRequestInput = {
  fileName: string;
  fileRef: string;
  fileFormat: string;
  targetPlatforms: string[];
  durationSec?: number;
  fileSizeMb?: number;
  fileMime?: string;
  fingerprint?: string;
};

export type AnalysisRequestDoc = {
  user_id: string;
  status: RequestStatus;
  file_name: string;
  file_ref: string;
  file_format: string;
  target_platforms: string[];
  duration_sec?: number;
  file_size_mb?: number;
  file_mime?: string;
  fingerprint?: string;
  fingerprint_hash?: string;
  engine_version: string;
  retry_count: number;
  created_at: FirebaseFirestore.FieldValue;
  updated_at: FirebaseFirestore.FieldValue;
  expires_at: FirebaseFirestore.Timestamp;
};

export type RiskBreakdown = {
  external_match_risk: number;
  loop_density_risk: number;
  vocal_presence_risk: number;
  ai_signal_risk: number;
  metadata_anomaly_risk: number;
  policy_context_risk: number;
};

export type ScoreOutput = {
  overallRiskScore: number;
  confidenceScore: number;
  verdict: Verdict;
  breakdown: RiskBreakdown;
  reasons: string[];
  actions: string[];
};

export type EvidenceItem = {
  category: string;
  source: string;
  metric: string;
  value: number;
  value_text: string;
  confidence: number;
  impact_score: number;
  direction: "increase_risk" | "decrease_risk";
  note: string;
};

export const ENGINE_VERSION = "voko-risk-v1.0.0";
