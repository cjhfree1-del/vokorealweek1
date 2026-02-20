import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/security";

export async function GET(request: Request) {
  const auth = await requireAdminUser(request);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "open";
  const limit = Number(url.searchParams.get("limit") ?? 50);

  const db = getAdminDb();
  const snapshot = await db
    .collection("reports")
    .where("status", "==", status)
    .orderBy("created_at", "desc")
    .limit(Math.min(Math.max(limit, 1), 100))
    .get();

  const reports = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  return NextResponse.json({ reports });
}
