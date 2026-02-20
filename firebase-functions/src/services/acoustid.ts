type AcoustIdLookupInput = {
  fingerprint: string;
  durationSec: number;
};

export type AcoustIdLookupResult = {
  success: boolean;
  matchConfidence?: number;
  trackTitle?: string;
  artistName?: string;
  note?: string;
  rawStatus?: string;
};

type AcoustIdApiResponse = {
  status?: string;
  results?: Array<{
    score?: number;
    recordings?: Array<{
      title?: string;
      artists?: Array<{ name?: string }>;
    }>;
  }>;
};

export async function lookupAcoustId(
  input: AcoustIdLookupInput,
): Promise<AcoustIdLookupResult> {
  const apiKey = process.env.ACOUSTID_API_KEY;
  if (!apiKey) {
    return { success: false, note: "missing_acoustid_key" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);

  try {
    const params = new URLSearchParams({
      client: apiKey,
      duration: String(Math.round(input.durationSec)),
      fingerprint: input.fingerprint,
      meta: "recordings",
      format: "json",
    });

    const res = await fetch(`https://api.acoustid.org/v2/lookup?${params.toString()}`, {
      method: "GET",
      signal: controller.signal,
    });

    if (!res.ok) {
      return { success: false, note: `acoustid_http_${res.status}` };
    }

    const body = (await res.json()) as AcoustIdApiResponse;
    const firstResult = body.results?.[0];
    const firstRecording = firstResult?.recordings?.[0];

    return {
      success: true,
      rawStatus: body.status,
      matchConfidence: typeof firstResult?.score === "number" ? firstResult.score : undefined,
      trackTitle: firstRecording?.title,
      artistName: firstRecording?.artists?.[0]?.name,
      note: firstRecording?.title ? "acoustid_match_found" : "acoustid_no_recording",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return { success: false, note: `acoustid_exception_${message}` };
  } finally {
    clearTimeout(timer);
  }
}
