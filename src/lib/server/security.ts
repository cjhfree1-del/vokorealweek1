import { NextResponse } from "next/server";
import { getAdminAppCheck, getAdminAuth } from "@/lib/firebase/admin";

export async function enforceAppCheck(request: Request) {
  const shouldEnforce = process.env.ENFORCE_APP_CHECK === "true";
  if (!shouldEnforce) {
    return null;
  }

  const token = request.headers.get("x-firebase-appcheck");
  if (!token) {
    return NextResponse.json({ error: "missing_app_check_token" }, { status: 401 });
  }

  try {
    await getAdminAppCheck().verifyToken(token);
    return null;
  } catch {
    return NextResponse.json({ error: "invalid_app_check_token" }, { status: 401 });
  }
}

export async function requireAdminUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { errorResponse: NextResponse.json({ error: "missing_bearer_token" }, { status: 401 }) };
  }

  const token = authHeader.replace("Bearer ", "");
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (decoded.admin !== true) {
      return { errorResponse: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
    }
    return { adminUid: decoded.uid };
  } catch {
    return { errorResponse: NextResponse.json({ error: "invalid_auth_token" }, { status: 401 }) };
  }
}
