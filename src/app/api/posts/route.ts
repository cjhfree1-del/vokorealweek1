import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { seedPosts } from "@/lib/mvp/seed";
import { getAdminDb } from "@/lib/firebase/admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { enforceAppCheck } from "@/lib/server/security";

export async function GET() {
  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection("posts")
      .where("status", "==", "active")
      .orderBy("created_at", "desc")
      .limit(20)
      .get();

    const posts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    return NextResponse.json({ source: "firestore", posts });
  } catch {
    return NextResponse.json({ source: "seed", posts: seedPosts });
  }
}

export async function POST(request: Request) {
  try {
    const appCheckError = await enforceAppCheck(request);
    if (appCheckError) {
      return appCheckError;
    }

    const body = await request.json();
    const { board_id, title, content, tags = [], author_uid, author_anon_name } = body;

    if (!board_id || !title || !content || !author_uid || !author_anon_name) {
      return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
    }

    const db = getAdminDb();
    const limited = await enforceRateLimit(db, {
      key: `post:${author_uid}`,
      limit: 20,
      windowSeconds: 600,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retry_after_seconds: limited.retryAfterSeconds },
        { status: 429 },
      );
    }

    const ref = await db.collection("posts").add({
      board_id,
      title,
      content,
      tags,
      author_uid,
      author_anon_name,
      status: "active",
      report_count: 0,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ postId: ref.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "failed_to_create_post" }, { status: 500 });
  }
}
