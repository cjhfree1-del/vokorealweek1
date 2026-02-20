import { getStorage } from "firebase-admin/storage";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

function parseGsPath(gsUri: string): { bucket: string; filePath: string } | null {
  if (!gsUri.startsWith("gs://")) return null;
  const raw = gsUri.replace("gs://", "");
  const slashIndex = raw.indexOf("/");
  if (slashIndex < 0) return null;

  const bucket = raw.slice(0, slashIndex);
  const filePath = raw.slice(slashIndex + 1);
  if (!bucket || !filePath) return null;
  return { bucket, filePath };
}

async function deleteExpiredDocs(collectionName: string, now: Timestamp): Promise<number> {
  const db = getFirestore();
  const snap = await db
    .collection(collectionName)
    .where("expires_at", "<=", now)
    .limit(200)
    .get();

  if (snap.empty) return 0;

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

export const cleanupExpiredFiles = onSchedule("every 60 minutes", async () => {
  const db = getFirestore();
  const now = Timestamp.now();

  const requestSnap = await db
    .collection("analysis_requests")
    .where("expires_at", "<=", now)
    .where("status", "in", ["done", "failed"])
    .limit(100)
    .get();

  for (const doc of requestSnap.docs) {
    const fileRef = doc.data().file_ref as string | undefined;
    if (fileRef) {
      const parsed = parseGsPath(fileRef);
      if (parsed) {
        try {
          await getStorage().bucket(parsed.bucket).file(parsed.filePath).delete();
        } catch {
          // ignore missing/deleted files
        }
      }
    }

    await doc.ref.update({
      file_ref: "",
      file_purged_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  const deletedFingerprints = await deleteExpiredDocs("sample_fingerprints", now);
  const deletedProviderLogs = await deleteExpiredDocs("provider_logs", now);

  console.log("cleanupExpiredFiles", {
    purgedRequestFiles: requestSnap.size,
    deletedFingerprints,
    deletedProviderLogs,
  });
});
