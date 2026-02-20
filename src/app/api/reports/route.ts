import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { enforceAppCheck } from "@/lib/server/security";

type ReportBody = {
  target_type: "post" | "comment" | "user";
  target_id: string;
  reporter_uid: string;
  reason_code: string;
  reason_text?: string;
};

export async function POST(request: Request) {
  try {
    const appCheckError = await enforceAppCheck(request);
    if (appCheckError) {
      return appCheckError;
    }

    const body = (await request.json()) as ReportBody;

    if (!body.target_type || !body.target_id || !body.reporter_uid || !body.reason_code) {
      return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
    }

    const db = getAdminDb();
    const limited = await enforceRateLimit(db, {
      key: `report:${body.reporter_uid}`,
      limit: 10,
      windowSeconds: 3600,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retry_after_seconds: limited.retryAfterSeconds },
        { status: 429 },
      );
    }

    await db.collection("reports").add({
      ...body,
      status: "open",
      created_at: FieldValue.serverTimestamp(),
    });

    if (body.target_type === "post") {
      const postRef = db.collection("posts").doc(body.target_id);
      await db.runTransaction(async (tx) => {
        const doc = await tx.get(postRef);
        const reportCount = (doc.data()?.report_count as number | undefined) ?? 0;
        const nextCount = reportCount + 1;
        tx.update(postRef, { report_count: nextCount });
        if (nextCount >= 5) {
          tx.update(postRef, { status: "hidden" });
        }
      });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "failed_to_create_report" }, { status: 500 });
  }
}
