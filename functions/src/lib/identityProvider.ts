import { createHmac } from "node:crypto";

type VerifyInput = {
  uid: string;
  ci: string;
  verificationToken: string;
};

type VerifyResult = {
  verified: boolean;
  reason?: string;
};

type ProviderResponse = {
  verified?: boolean;
  ci?: string;
};

const DEFAULT_MOCK_TOKEN = "mock-success-token";

export async function verifyIdentityWithProvider(input: VerifyInput): Promise<VerifyResult> {
  const mode = process.env.IDENTITY_PROVIDER_MODE ?? "mock";
  if (mode === "mock") {
    return { verified: input.verificationToken === DEFAULT_MOCK_TOKEN };
  }

  const verifyUrl = process.env.IDENTITY_PROVIDER_VERIFY_URL;
  if (!verifyUrl) {
    return { verified: false, reason: "missing_provider_url" };
  }

  const apiKey = process.env.IDENTITY_PROVIDER_API_KEY;
  const apiSecret = process.env.IDENTITY_PROVIDER_API_SECRET;
  const payload = JSON.stringify({
    uid: input.uid,
    ci: input.ci,
    verification_token: input.verificationToken,
  });
  const signature = apiSecret
    ? createHmac("sha256", apiSecret).update(payload).digest("hex")
    : undefined;

  const response = await fetch(verifyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(signature ? { "X-Signature": signature } : {}),
    },
    body: payload,
  });

  if (!response.ok) {
    return { verified: false, reason: `provider_http_${response.status}` };
  }

  const data = (await response.json()) as ProviderResponse;
  if (!data.verified) {
    return { verified: false, reason: "provider_rejected" };
  }
  if (data.ci && data.ci !== input.ci) {
    return { verified: false, reason: "ci_mismatch" };
  }

  return { verified: true };
}
