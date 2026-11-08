import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { AppError } from "./errors.js";

export type CurriculumAssetReader = (key: string) => Promise<{ bytes: Buffer; contentType: string } | undefined>;
const types: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

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

export function createGcsCurriculumAssetReader({
  bucket = process.env.CURRICULUM_ASSET_BUCKET,
  token = process.env.GCP_STORAGE_TOKEN,
  fetchFn = fetch,
}: { bucket?: string; token?: string; fetchFn?: GcsFetch } = {}): CurriculumAssetReader {
  return async (key) => {
    const contentType = assetContentType(key);
    if (!bucket || !contentType) return undefined;
    try {
      const encodedKey = encodeURIComponent(key);
      const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodedKey}?alt=media`;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetchFn(url, { headers });
      if (response.status === 404) return undefined;
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
  root = process.env.CURRICULUM_ASSET_ROOT,
  fetchFn = fetch,
}: { bucket?: string; token?: string; root?: string; fetchFn?: GcsFetch } = {}): CurriculumAssetReader {
  if (bucket) {
    return createGcsCurriculumAssetReader({ bucket, token, fetchFn });
  }
  return createCurriculumAssetReader(root);
}
