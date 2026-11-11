import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { AppError } from "./errors.js";

export type CurriculumAssetReader = (key: string) => Promise<{ bytes: Buffer; contentType: string } | undefined>;
const types: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function assetContentType(key: string): string | undefined {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(key) || key.split("/").some((p) => !p || p === "." || p === "..")) return undefined;
  return types[extname(key).toLowerCase()];
}

// Only a block's validated assetKey is passed here, never a client file path.
// Missing runtime assets remain unavailable; no public fallback or upload.
export function createCurriculumAssetReader(root = process.env.CURRICULUM_ASSET_ROOT): CurriculumAssetReader {
  return async (key) => {
    if (!root) return undefined;
    const contentType = assetContentType(key);
    if (!contentType) return undefined;
    try {
      const directory = await realpath(root);
      const path = await realpath(resolve(directory, key));
      if (!path.startsWith(directory + sep)) return undefined;
      return { bytes: await readFile(path), contentType };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  };
}

export type GcsFetch = typeof fetch;
export type GcsTokenProvider = () => Promise<string | undefined>;

const METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const TOKEN_EXPIRY_SAFETY_MS = 60_000;
const METADATA_TIMEOUT_MS = 2_000;

export interface MetadataTokenProviderOptions {
  metadataUrl?: string;
  fetchFn?: GcsFetch;
  now?: () => number;
}

export function createMetadataTokenProvider({
  metadataUrl = METADATA_TOKEN_URL,
  fetchFn = fetch,
  now = () => Date.now(),
}: MetadataTokenProviderOptions = {}): GcsTokenProvider & { reset: () => void } {
  let cachedToken: string | undefined;
  let expiresAtMs = 0;

  const provider: GcsTokenProvider & { reset: () => void } = async () => {
    if (cachedToken && now() < expiresAtMs) {
      return cachedToken;
    }
    const response = await fetchFn(metadataUrl, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Metadata server error: status ${response.status}`);
    }
    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) {
      throw new Error("Metadata server returned empty access_token");
    }
    cachedToken = payload.access_token;
    const ttlMs = Math.max(0, (payload.expires_in ?? 300) * 1000 - TOKEN_EXPIRY_SAFETY_MS);
    expiresAtMs = now() + ttlMs;
    return cachedToken;
  };

  provider.reset = () => {
    cachedToken = undefined;
    expiresAtMs = 0;
  };

  return provider;
}

export interface GcsAssetReaderOptions {
  bucket?: string;
  token?: string;
  tokenProvider?: GcsTokenProvider & { reset?: () => void };
  fetchFn?: GcsFetch;
}

export function createGcsCurriculumAssetReader({
  bucket = process.env.CURRICULUM_ASSET_BUCKET,
  token = process.env.GCP_STORAGE_TOKEN,
  tokenProvider,
  fetchFn = fetch,
}: GcsAssetReaderOptions = {}): CurriculumAssetReader {
  const effectiveTokenProvider = token ? undefined : (tokenProvider ?? createMetadataTokenProvider({ fetchFn }));

  return async (key) => {
    const contentType = assetContentType(key);
    if (!bucket || !contentType) return undefined;
    try {
      const activeToken = token ?? (effectiveTokenProvider ? await effectiveTokenProvider() : undefined);
      const encodedKey = encodeURIComponent(key);
      const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodedKey}?alt=media`;
      const headers: Record<string, string> = {};
      if (activeToken) headers["Authorization"] = `Bearer ${activeToken}`;

      const response = await fetchFn(url, { headers });
      if (response.status === 404) return undefined;
      if (response.status === 401 && effectiveTokenProvider?.reset) {
        effectiveTokenProvider.reset();
      }
      if (!response.ok) {
        throw new Error(`GCS response error: status ${response.status}`);
      }
      const responseContentType = response.headers.get("content-type")?.split(";")[0]?.trim();
      if (responseContentType && responseContentType !== contentType) {
        return undefined;
      }
      const arrayBuffer = await response.arrayBuffer();
      return { bytes: Buffer.from(arrayBuffer), contentType };
    } catch {
      // Discard SDK/HTTP errors and causes: they may contain credentials or storage URLs.
      throw new AppError(503, "INTERNAL_ERROR", "Private asset storage is unavailable");
    }
  };
}

// Runtime priority: GCS bucket, then local root, then unavailable.
// Explicit filesystem readers remain independent of cloud credentials.
export function createRuntimeCurriculumAssetReader({
  bucket = process.env.CURRICULUM_ASSET_BUCKET,
  token = process.env.GCP_STORAGE_TOKEN,
  tokenProvider,
  root = process.env.CURRICULUM_ASSET_ROOT,
  fetchFn = fetch,
}: {
  bucket?: string;
  token?: string;
  tokenProvider?: GcsTokenProvider & { reset?: () => void };
  root?: string;
  fetchFn?: GcsFetch;
} = {}): CurriculumAssetReader {
  if (bucket) {
    return createGcsCurriculumAssetReader({ bucket, token, tokenProvider, fetchFn });
  }
  return createCurriculumAssetReader(root);
}
