import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/security";

type ModerationBody = {
  target_uid: string;
  action_type: "warn" | "mute" | "suspend" | "ban" | "content_hide";
  duration_hours?: number;
  note?: string;
};

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const body = (await request.json()) as ModerationBody;
  if (!body.target_uid || !body.action_type) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  const db = getAdminDb();
  const durationHours = body.duration_hours ?? 0;
  const endsAt =
    durationHours > 0 ? new Date(Date.now() + durationHours * 60 * 60 * 1000) : null;

  await db.collection("moderation_actions").add({
    target_uid: body.target_uid,
    action_type: body.action_type,
    duration_hours: durationHours,
    ends_at: endsAt,
    note: body.note ?? "",
    created_by: auth.adminUid,
    created_at: FieldValue.serverTimestamp(),
  });

  if (body.action_type === "suspend" || body.action_type === "ban") {
    await db.collection("users").doc(body.target_uid).set(
      {
        status: body.action_type === "ban" ? "deleted" : "suspended",
      },
      { merge: true },
    );
  }

  return NextResponse.json({ success: true });
}
