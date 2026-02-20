import { FieldValue, type Firestore } from "firebase-admin/firestore";

type RateLimitInput = {
  key: string;
  limit: number;
  windowSeconds: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export async function enforceRateLimit(
  db: Firestore,
  input: RateLimitInput,
): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAtMs = now + input.windowSeconds * 1000;
  const ref = db.collection("rate_limits").doc(input.key);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) {
      tx.set(ref, {
        count: 1,
        limit: input.limit,
        window_seconds: input.windowSeconds,
        reset_at_ms: resetAtMs,
        updated_at: FieldValue.serverTimestamp(),
      });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const data = snapshot.data();
    const count = typeof data?.count === "number" ? data.count : 0;
    const existingResetAtMs =
      typeof data?.reset_at_ms === "number" ? data.reset_at_ms : now;

    if (now >= existingResetAtMs) {
      tx.update(ref, {
        count: 1,
        reset_at_ms: resetAtMs,
        updated_at: FieldValue.serverTimestamp(),
      });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (count >= input.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((existingResetAtMs - now) / 1000),
      };
    }

    tx.update(ref, {
      count: count + 1,
      updated_at: FieldValue.serverTimestamp(),
    });
    return { allowed: true, retryAfterSeconds: 0 };
  });
}
