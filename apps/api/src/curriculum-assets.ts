import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { get, BlobNotFoundError } from "@vercel/blob";
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

export function createBlobCurriculumAssetReader(token: string | undefined, readBlob: typeof get = get): CurriculumAssetReader {
  return async (key) => {
    const contentType = assetContentType(key);
    if (!token || !contentType) return undefined;
    try {
      const result = await readBlob(key, { access: "private", token });
      if (!result) return undefined;
      if (result.statusCode !== 200) throw new Error("Unexpected conditional response");
      if (result.blob.pathname !== key || result.blob.contentType !== contentType) {
        await result.stream.cancel();
        return undefined;
      }
      return { bytes: Buffer.from(await new Response(result.stream).arrayBuffer()), contentType };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return undefined;
      // Discard SDK errors and causes: they may contain credentials or storage URLs.
      throw new AppError(503, "INTERNAL_ERROR", "Private asset storage is unavailable");
    }
  };
}

// Runtime priority: Blob token, then local root, then unavailable.
// Explicit filesystem readers remain independent of Blob credentials.
export function createRuntimeCurriculumAssetReader({
  token = process.env.BLOB_READ_WRITE_TOKEN,
  root = process.env.CURRICULUM_ASSET_ROOT,
}: { token?: string; root?: string } = {}, readBlob: typeof get = get): CurriculumAssetReader {
  return token ? createBlobCurriculumAssetReader(token, readBlob) : createCurriculumAssetReader(root);
}
