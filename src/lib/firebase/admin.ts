import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getAppCheck } from "firebase-admin/app-check";
import { getFirestore } from "firebase-admin/firestore";

function assertEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
}

function getAdminCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  assertEnv("FIREBASE_PROJECT_ID", projectId);
  assertEnv("FIREBASE_CLIENT_EMAIL", clientEmail);
  assertEnv("FIREBASE_PRIVATE_KEY", privateKey);

  return { projectId, clientEmail, privateKey };
}

export function getAdminApp(): App {
  if (getApps().length) {
    return getApp();
  }

  const credentials = getAdminCredentials();
  return initializeApp({
    credential: cert(credentials),
  });
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminAppCheck() {
  return getAppCheck(getAdminApp());
}
