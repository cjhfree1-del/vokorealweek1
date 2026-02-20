import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { AnalysisRequestInput } from "../types/analysis";
import { ENGINE_VERSION } from "../types/analysis";

const SUPPORTED_FORMATS = new Set(["wav", "mp3"]);

export const createAnalysisRequest = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const input = request.data as AnalysisRequestInput;
  if (!input?.fileName || !input?.fileRef || !input?.fileFormat) {
    throw new HttpsError("invalid-argument", "fileName, fileRef, fileFormat are required.");
  }

  if (!Array.isArray(input.targetPlatforms) || input.targetPlatforms.length === 0) {
    throw new HttpsError("invalid-argument", "targetPlatforms is required.");
  }

  const fileFormat = input.fileFormat.toLowerCase();
  if (!SUPPORTED_FORMATS.has(fileFormat)) {
    throw new HttpsError("invalid-argument", "fileFormat must be wav or mp3.");
  }

  const db = getFirestore();
  const requestRef = db.collection("analysis_requests").doc();
  const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

  await requestRef.set({
    user_id: uid,
    status: "queued",
    file_name: input.fileName,
    file_ref: input.fileRef,
    file_format: fileFormat,
    target_platforms: input.targetPlatforms,
    duration_sec: input.durationSec ?? null,
    file_size_mb: input.fileSizeMb ?? null,
    file_mime: input.fileMime ?? "",
    fingerprint: input.fingerprint ?? "",
    engine_version: ENGINE_VERSION,
    retry_count: 0,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    expires_at: expiresAt,
  });

  return {
    requestId: requestRef.id,
    status: "queued",
    engineVersion: ENGINE_VERSION,
  };
});
