import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { enforceRateLimit } from "./lib/rateLimit";
import { verifyIdentityWithProvider } from "./lib/identityProvider";
import { createAnalysisRequest } from "./handlers/createAnalysisRequest";
import { onAnalysisRequestCreated } from "./handlers/onAnalysisRequestCreated";
import { cleanupExpiredFiles } from "./jobs/cleanupExpiredFiles";

initializeApp();
const db = getFirestore();

const hashCi = (ci: string) => createHash("sha256").update(ci).digest("hex");

export const verifyIdentity = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const { ci, verificationToken } = request.data as { ci?: string; verificationToken?: string };
  if (!ci || !verificationToken) {
    throw new HttpsError("invalid-argument", "ci and verificationToken are required.");
  }

  const limited = await enforceRateLimit(db, {
    key: `identity:${uid}`,
    limit: 5,
    windowSeconds: 86400,
  });
  if (!limited.allowed) {
    throw new HttpsError(
      "resource-exhausted",
      `Too many requests. Retry after ${limited.retryAfterSeconds} seconds.`,
    );
  }

  const verification = await verifyIdentityWithProvider({ uid, ci, verificationToken });
  if (!verification.verified) {
    return { identity_verified: false, reason: verification.reason ?? "verification_failed" };
  }

  await db.collection("users").doc(uid).set(
    {
      verification: {
        identity_verified: true,
        hashed_ci: hashCi(ci),
        verified_at: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );

  return { identity_verified: true };
});

export const reportContent = onCall(async (request) => {
  const reporterUid = request.auth?.uid;
  if (!reporterUid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const { targetType, targetId, reasonCode, reasonText } = request.data as {
    targetType?: "post" | "comment" | "user";
    targetId?: string;
    reasonCode?: string;
    reasonText?: string;
  };

  if (!targetType || !targetId || !reasonCode) {
    throw new HttpsError("invalid-argument", "Missing required report fields.");
  }

  const limited = await enforceRateLimit(db, {
    key: `report:${reporterUid}`,
    limit: 10,
    windowSeconds: 3600,
  });
  if (!limited.allowed) {
    throw new HttpsError(
      "resource-exhausted",
      `Too many requests. Retry after ${limited.retryAfterSeconds} seconds.`,
    );
  }

  await db.collection("reports").add({
    target_type: targetType,
    target_id: targetId,
    reporter_uid: reporterUid,
    reason_code: reasonCode,
    reason_text: reasonText ?? "",
    status: "open",
    created_at: FieldValue.serverTimestamp(),
  });

  if (targetType === "post") {
    const postRef = db.collection("posts").doc(targetId);
    await db.runTransaction(async (tx) => {
      const post = await tx.get(postRef);
      if (!post.exists) {
        return;
      }

      const nextCount = ((post.data()?.report_count as number | undefined) ?? 0) + 1;
      tx.update(postRef, { report_count: nextCount });
      if (nextCount >= 5) {
        tx.update(postRef, { status: "hidden" });
      }
    });
  }

  return { success: true };
});

export {
  createAnalysisRequest,
  onAnalysisRequestCreated,
  cleanupExpiredFiles,
};
