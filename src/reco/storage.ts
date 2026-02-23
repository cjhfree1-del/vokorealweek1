import { createEmptyUserProfile, normalizeUserProfile, type UserProfile } from "./userProfile";

const ANON_USER_ID_KEY = "voko_anon_user_id_v1";
let firebaseInitLogged = false;
let runtimePromise: Promise<FirebaseRuntime | null> | null = null;

export type SessionStep = {
  stepIndex: number;
  shownMediaIds: number[];
  likedMediaIds: number[];
  dislikedMediaIds: number[];
  timestamp: string;
};

type FirebaseOptions = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

type FirestoreTimestampLike = {
  toDate?: () => Date;
};

type FirestoreModule = typeof import("firebase/firestore");
type FirestoreDb = ReturnType<FirestoreModule["getFirestore"]>;

type FirebaseRuntime = {
  firestore: FirestoreModule;
  db: FirestoreDb;
};

function uuidv4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseDateLike(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const timestamp = value as FirestoreTimestampLike | undefined;
  if (timestamp && typeof timestamp.toDate === "function") {
    return timestamp.toDate().toISOString();
  }
  return undefined;
}

function sanitizeWeightMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const next: Record<string, number> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!key) continue;
    const num = Number(raw);
    if (!Number.isFinite(num)) continue;
    next[key] = num;
  }
  return next;
}

function sanitizeIdList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<number>();
  value.forEach((raw) => {
    const num = Number(raw);
    if (Number.isFinite(num)) deduped.add(num);
  });
  return Array.from(deduped);
}

function firebaseConfigFromEnv(): FirebaseOptions | null {
  const config: FirebaseOptions = {
    apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined)?.trim(),
    authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined)?.trim(),
    projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim(),
    storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined)?.trim(),
    messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined)?.trim(),
    appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined)?.trim(),
    measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined)?.trim(),
  };

  if (!config.apiKey || !config.projectId || !config.appId) return null;
  return config;
}

async function getFirebaseRuntimeOrNull(): Promise<FirebaseRuntime | null> {
  if (runtimePromise) return runtimePromise;
  const config = firebaseConfigFromEnv();
  runtimePromise = (async () => {
    if (!config) return null;
    try {
      const appModule = await import("firebase/app");
      const firestoreModule = await import("firebase/firestore");
      const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(config);
      const db = firestoreModule.getFirestore(app);
      return {
        firestore: firestoreModule,
        db,
      };
    } catch {
      return null;
    }
  })();

  const runtime = await runtimePromise;
  if (!runtime && !firebaseInitLogged) {
    firebaseInitLogged = true;
    console.warn("[RECO][PROFILE] Firebase init skipped or failed.");
  }
  return runtime;
}

function profileDoc(runtime: FirebaseRuntime, userId: string) {
  // users/{anonUserId}/profile/profile
  return runtime.firestore.doc(runtime.db, "users", userId, "profile", "profile");
}

function sessionDoc(runtime: FirebaseRuntime, userId: string, sessionId: string) {
  return runtime.firestore.doc(runtime.db, "users", userId, "sessions", sessionId);
}

function normalizeStepPayload(step: SessionStep): SessionStep {
  return {
    stepIndex: step.stepIndex,
    shownMediaIds: sanitizeIdList(step.shownMediaIds),
    likedMediaIds: sanitizeIdList(step.likedMediaIds),
    dislikedMediaIds: sanitizeIdList(step.dislikedMediaIds),
    timestamp: step.timestamp || new Date().toISOString(),
  };
}

export function getOrCreateAnonUserId(): string {
  try {
    const existing = localStorage.getItem(ANON_USER_ID_KEY);
    if (existing) return existing;
    const created = uuidv4();
    localStorage.setItem(ANON_USER_ID_KEY, created);
    return created;
  } catch {
    return uuidv4();
  }
}

export function createSessionId(): string {
  return `sess_${uuidv4()}`;
}

export async function readUserProfile(userId: string): Promise<UserProfile> {
  const runtime = await getFirebaseRuntimeOrNull();
  if (!runtime) return createEmptyUserProfile();

  const ref = profileDoc(runtime, userId);
  const snap = await runtime.firestore.getDoc(ref);
  if (!snap.exists()) return createEmptyUserProfile();

  const data = snap.data() as Record<string, unknown>;
  return normalizeUserProfile({
    likedTags: sanitizeWeightMap(data.likedTags),
    dislikedTags: sanitizeWeightMap(data.dislikedTags),
    exposureHistory: sanitizeIdList(data.exposureHistory),
    updatedAt: parseDateLike(data.updatedAt) ?? new Date().toISOString(),
  });
}

export async function writeUserProfile(userId: string, profile: UserProfile): Promise<void> {
  const runtime = await getFirebaseRuntimeOrNull();
  if (!runtime) return;
  const safe = normalizeUserProfile(profile);
  const ref = profileDoc(runtime, userId);
  await runtime.firestore.setDoc(
    ref,
    {
      likedTags: safe.likedTags,
      dislikedTags: safe.dislikedTags,
      exposureHistory: safe.exposureHistory,
      updatedAt: runtime.firestore.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function ensureUserSession(
  userId: string,
  sessionId: string,
  category: string,
): Promise<void> {
  const runtime = await getFirebaseRuntimeOrNull();
  if (!runtime) return;
  const ref = sessionDoc(runtime, userId, sessionId);
  await runtime.firestore.setDoc(
    ref,
    {
      category,
      createdAt: runtime.firestore.serverTimestamp(),
      updatedAt: runtime.firestore.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function appendSessionStep(
  userId: string,
  sessionId: string,
  category: string,
  step: SessionStep,
): Promise<void> {
  const runtime = await getFirebaseRuntimeOrNull();
  if (!runtime) return;
  const ref = sessionDoc(runtime, userId, sessionId);
  const payload = normalizeStepPayload(step);
  await runtime.firestore.setDoc(
    ref,
    {
      category,
      updatedAt: runtime.firestore.serverTimestamp(),
      steps: runtime.firestore.arrayUnion(payload),
    },
    { merge: true },
  );
}
