import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { createHash } from "crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { enforceAppCheck } from "@/lib/server/security";
import { verifyIdentityWithProvider } from "@/lib/server/identity-provider";

function hashCi(ci: string) {
  return createHash("sha256").update(ci).digest("hex");
}

export async function POST(request: Request) {
  try {
    const appCheckError = await enforceAppCheck(request);
    if (appCheckError) {
      return appCheckError;
    }

    const { uid, ci, verification_token } = await request.json();

    if (!uid || !ci || !verification_token) {
      return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
    }

    const db = getAdminDb();
    const limited = await enforceRateLimit(db, {
      key: `identity:${uid}`,
      limit: 5,
      windowSeconds: 86400,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retry_after_seconds: limited.retryAfterSeconds },
        { status: 429 },
      );
    }

    const verification = await verifyIdentityWithProvider({
      uid,
      ci,
      verificationToken: verification_token,
    });
    if (!verification.verified) {
      return NextResponse.json(
        { identity_verified: false, reason: verification.reason ?? "verification_failed" },
        { status: 401 },
      );
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

    return NextResponse.json({ identity_verified: true });
  } catch {
    return NextResponse.json({ error: "failed_to_verify_identity" }, { status: 500 });
  }
}
