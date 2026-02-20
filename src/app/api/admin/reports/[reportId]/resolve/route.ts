import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/security";

type ResolveBody = {
  status: "resolved" | "rejected";
  resolution: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const auth = await requireAdminUser(request);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const { reportId } = await params;
  const body = (await request.json()) as ResolveBody;
  if (!body.status || !body.resolution) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  const db = getAdminDb();
  await db.collection("reports").doc(reportId).set(
    {
      status: body.status,
      resolution: body.resolution,
      resolved_by: auth.adminUid,
      resolved_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return NextResponse.json({ success: true });
}
