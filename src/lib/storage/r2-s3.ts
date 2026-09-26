import { createHmac, createHash } from "node:crypto";

export interface R2S3Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Uint8Array | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(encodePathSegment).join("/");
}

function canonicalHeaders(headers: Record<string, string>): { canonical: string; signed: string } {
  const entries = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase().trim(), value.trim().replace(/\s+/g, " ")] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    canonical: entries.map(([name, value]) => name + ":" + value + "\n").join(""),
    signed: entries.map(([name]) => name).join(";"),
  };
}

function authorization(params: {
  method: string;
  key: string;
  payloadHash: string;
  config: R2S3Config;
  contentType?: string;
  cacheControl?: string;
  bodyLength?: number;
}): { url: string; headers: Record<string, string> } {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const date = amzDate.slice(0, 8);
  const region = params.config.region ?? "auto";
  const service = "s3";
  const host = params.config.accountId + ".r2.cloudflarestorage.com";
  const uri = "/" + encodeObjectKey(params.key);
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": params.payloadHash,
    "x-amz-date": amzDate,
  };
  if (params.contentType) headers["content-type"] = params.contentType;
  if (params.cacheControl) headers["cache-control"] = params.cacheControl;
  if (params.bodyLength != null) headers["content-length"] = String(params.bodyLength);

  const { canonical, signed } = canonicalHeaders(headers);
  const canonicalRequest = [params.method.toUpperCase(), uri, "", canonical, signed, params.payloadHash].join("\n");
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac("AWS4" + params.config.secretAccessKey, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return {
    url: "https://" + host + uri,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${params.config.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
    },
  };
}

export function createR2S3Client(config: R2S3Config) {
  const request = async (method: "PUT" | "DELETE", key: string, body?: Uint8Array, contentType?: string, cacheControl?: string) => {
    const payload = body ?? new Uint8Array();
    const payloadHash = sha256Hex(payload);
    const signed = authorization({ method, key, payloadHash, config, contentType, cacheControl, bodyLength: method === "PUT" ? payload.byteLength : 0 });
    const response = await fetch(signed.url, {
      method,
      headers: signed.headers,
      body: method === "PUT" ? payload : undefined,
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error("R2 " + method + " failed (" + response.status + ")" + (detail ? ": " + detail.slice(0, 300) : ""));
    }
  };

  return {
    putObject: (key: string, body: Uint8Array, contentType?: string, cacheControl?: string) => request("PUT", key, body, contentType, cacheControl),
    deleteObject: (key: string) => request("DELETE", key),
  };
}
