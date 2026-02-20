import { createHash } from "node:crypto";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { buildEvidence } from "../services/evidence";
import { calculateScores } from "../services/scoring";
import { lookupAcoustId } from "../services/acoustid";
import { ENGINE_VERSION, type EvidenceItem } from "../types/analysis";

type RequestDoc = {
  user_id?: string;
  file_name?: string;
  file_ref?: string;
  file_format?: string;
  file_mime?: string;
  file_size_mb?: number | null;
  duration_sec?: number | null;
  fingerprint?: string;
  target_platforms?: string[];
  retry_count?: number;
};

export const onAnalysisRequestCreated = onDocumentCreated(
  "analysis_requests/{requestId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const db = getFirestore();
    const requestId = event.params.requestId;
    const requestRef = db.collection("analysis_requests").doc(requestId);
    const data = (snap.data() ?? {}) as RequestDoc;

    await requestRef.update({
      status: "processing",
      updated_at: FieldValue.serverTimestamp(),
      job_started_at: FieldValue.serverTimestamp(),
    });

    try {
      const targetPlatforms = Array.isArray(data.target_platforms)
        ? data.target_platforms
        : ["spotify"];

      const fingerprint = data.fingerprint ?? "";
      const durationSec = typeof data.duration_sec === "number" ? data.duration_sec : undefined;
      const fileSizeMb = typeof data.file_size_mb === "number" ? data.file_size_mb : undefined;
      const fileMime = data.file_mime ?? "";
      const fileFormat = data.file_format ?? "unknown";
      const fingerprintHash = fingerprint
        ? createHash("sha256").update(fingerprint).digest("hex")
        : "";

      const evidenceItems: EvidenceItem[] = [];

      if (fingerprint && durationSec && durationSec > 0) {
        const acoustIdResult = await lookupAcoustId({
          fingerprint,
          durationSec,
        });

        await db.collection("provider_logs").add({
          request_id: requestId,
          provider: "acoustid",
          success: acoustIdResult.success,
          note: acoustIdResult.note ?? "",
          raw_status: acoustIdResult.rawStatus ?? "",
          created_at: FieldValue.serverTimestamp(),
          expires_at: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
        });

        if (typeof acoustIdResult.matchConfidence === "number") {
          evidenceItems.push(
            buildEvidence({
              category: "external_match",
              source: "acoustid",
              metric: "match_confidence",
              value: acoustIdResult.matchConfidence,
              confidence: 0.82,
              impactScore: Math.round(acoustIdResult.matchConfidence * 35),
              note:
                acoustIdResult.trackTitle && acoustIdResult.artistName
                  ? `Matched: ${acoustIdResult.trackTitle} - ${acoustIdResult.artistName}`
                  : "AcoustID similarity signal detected",
            }),
          );
        }
      }

      let hasInternalFingerprintMatch = false;
      if (fingerprintHash) {
        const internalMatchSnap = await db
          .collection("sample_fingerprints")
          .where("fingerprint_hash", "==", fingerprintHash)
          .limit(1)
          .get();

        hasInternalFingerprintMatch = !internalMatchSnap.empty;

        if (hasInternalFingerprintMatch) {
          evidenceItems.push(
            buildEvidence({
              category: "internal_match",
              source: "internal_fingerprint_db",
              metric: "exact_hash_match",
              value: 1,
              confidence: 0.9,
              impactScore: 30,
              note: "Internal fingerprint exact match found",
            }),
          );
        }

        await db.collection("sample_fingerprints").add({
          request_id: requestId,
          user_id: data.user_id ?? "unknown",
          file_ref: data.file_ref ?? "",
          fingerprint_hash: fingerprintHash,
          hash_algo: "sha256(chromaprint)",
          duration_sec: durationSec ?? null,
          created_at: FieldValue.serverTimestamp(),
          expires_at: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
        });
      }

      const externalMatchEvidence = evidenceItems.find((item) => item.category === "external_match");
      const scores = calculateScores({
        fileFormat,
        durationSec,
        fileSizeMb,
        fileMime,
        targetPlatforms,
        externalMatchConfidence: externalMatchEvidence?.value,
        hasInternalFingerprintMatch,
        acoustIdLookupSucceeded: !!externalMatchEvidence,
      });

      const reportRef = db.collection("analysis_reports").doc();
      await reportRef.set({
        request_id: requestId,
        user_id: data.user_id ?? "unknown",
        engine_version: ENGINE_VERSION,
        input: {
          file_name: data.file_name ?? "unknown",
          file_format: fileFormat,
          duration_sec: durationSec ?? null,
          file_size_mb: fileSizeMb ?? null,
          platform_targets: targetPlatforms,
        },
        scores: {
          overall_risk_score: scores.overallRiskScore,
          confidence_score: scores.confidenceScore,
          verdict: scores.verdict,
        },
        breakdown: scores.breakdown,
        reasons: scores.reasons,
        recommended_actions: scores.actions,
        legal_notice:
          "자동화된 신호 기반 분석이며 플랫폼 최종 판정을 보장하지 않습니다. 상업 배포 전 라이선스 상태를 직접 확인하세요.",
        created_at: FieldValue.serverTimestamp(),
      });

      const batch = db.batch();
      evidenceItems.forEach((item) => {
        const ref = db.collection("evidence_items").doc();
        batch.set(ref, {
          report_id: reportRef.id,
          request_id: requestId,
          ...item,
          created_at: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();

      await requestRef.update({
        status: "done",
        report_id: reportRef.id,
        updated_at: FieldValue.serverTimestamp(),
        completed_at: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      await requestRef.update({
        status: "failed",
        failed_stage: "analysis_pipeline",
        error_message: message,
        retry_count: (data.retry_count ?? 0) + 1,
        updated_at: FieldValue.serverTimestamp(),
      });
    }
  },
);
