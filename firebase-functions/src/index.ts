import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { enforceRateLimit } from "./lib/rateLimit";
import { verifyIdentityWithProvider } from "./lib/identityProvider";
import { createAnalysisRequest } from "./handlers/createAnalysisRequest";
import { onAnalysisRequestCreated } from "./handlers/onAnalysisRequestCreated";
import { cleanupExpiredFiles } from "./jobs/cleanupExpiredFiles";
import { localizeAnimeWithCache } from "./services/localization";
import { LocalizeAnimeInput } from "./types/localization";

initializeApp();
const db = getFirestore();

const hashCi = (ci: string) => createHash("sha256").update(ci).digest("hex");

function parseLocalizeInput(payload: unknown): LocalizeAnimeInput {
  const data = payload as Record<string, unknown> | undefined;
  const malId = data?.mal_id;
  const titles = data?.titles as Record<string, unknown> | undefined;

  if (typeof malId !== "number" || !Number.isInteger(malId) || malId <= 0) {
    throw new HttpsError("invalid-argument", "mal_id must be a positive integer.");
  }
  if (!titles || typeof titles !== "object") {
    throw new HttpsError("invalid-argument", "titles object is required.");
  }

  const english = typeof titles.english === "string" ? titles.english : undefined;
  const romaji = typeof titles.romaji === "string" ? titles.romaji : undefined;
  const native = typeof titles.native === "string" ? titles.native : undefined;
  if (!english && !romaji && !native) {
    throw new HttpsError("invalid-argument", "At least one title is required.");
  }

  const input: LocalizeAnimeInput = {
    mal_id: malId,
    titles: { english, romaji, native },
    year: typeof data?.year === "number" ? data.year : undefined,
    type: typeof data?.type === "string" ? data.type : undefined,
    synopsis: typeof data?.synopsis === "string" ? data.synopsis : undefined,
    genres: Array.isArray(data?.genres)
      ? data.genres.filter((item): item is string => typeof item === "string")
      : undefined,
  };
  return input;
}

async function enforceLocalizationRateLimit(keySuffix: string): Promise<void> {
  const limited = await enforceRateLimit(db, {
    key: `localize:${keySuffix}`,
    limit: 30,
    windowSeconds: 3600,
  });
  if (!limited.allowed) {
    throw new HttpsError(
      "resource-exhausted",
      `Too many localization requests. Retry after ${limited.retryAfterSeconds} seconds.`,
    );
  }
}

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

export const localizeAnime = onCall(async (request) => {
  const uid = request.auth?.uid;
  const ip = request.rawRequest.ip ?? "unknown";
  const limiterKey = uid ? `uid:${uid}` : `ip:${ip}`;
  await enforceLocalizationRateLimit(limiterKey);

  const input = parseLocalizeInput(request.data);
  const localized = await localizeAnimeWithCache(db, input);
  return localized;
});

export const localizeAnimeHttp = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  try {
    const ip = req.ip ?? req.get("x-forwarded-for") ?? "unknown";
    await enforceLocalizationRateLimit(`http:${ip}`);
    const input = parseLocalizeInput(req.body);
    const localized = await localizeAnimeWithCache(db, input);
    res.status(200).json(localized);
  } catch (error) {
    if (error instanceof HttpsError) {
      res.status(400).json({ error: error.code, message: error.message });
      return;
    }
    res.status(500).json({ error: "internal", message: "Localization failed." });
  }
});

export {
  createAnalysisRequest,
  onAnalysisRequestCreated,
  cleanupExpiredFiles,
};
