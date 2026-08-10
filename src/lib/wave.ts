import crypto from "crypto";

export const WAVE_BASE_URL = "https://api.wave.com";

export function getWaveSuccessUrl(origin: string) {
  return `${origin}/dashboard/subscription?payment=success`;
}

export function getWaveErrorUrl(origin: string) {
  return `${origin}/dashboard/subscription?payment=error`;
}

export function parseWaveSignature(signatureHeader: string) {
  return signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) {
      acc[key.trim()] = value.trim();
    }
    return acc;
  }, {});
}

export function verifyWaveSignature(payload: string, signatureHeader: string, secret: string) {
  const { t: timestamp, v1: signature } = parseWaveSignature(signatureHeader);
  if (!timestamp || !signature) {
    return false;
  }

  const timestampInt = Number(timestamp);
  if (Number.isNaN(timestampInt)) {
    return false;
  }

  const toleranceSeconds = 300;
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestampInt);
  if (age > toleranceSeconds) {
    return false;
  }

  const computedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return secureCompare(computedSignature, signature);
}

function secureCompare(a: string, b: string) {
  const aBytes = Buffer.from(a, "utf8");
  const bBytes = Buffer.from(b, "utf8");
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBytes, bBytes);
}
