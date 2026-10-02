import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";

export type CurriculumAssetReader = (key: string) => Promise<{ bytes: Buffer; contentType: string } | undefined>;
const types: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

// Only a block's validated assetKey is passed here, never a client file path.
// Missing runtime assets remain unavailable; no public fallback or upload.
export function createCurriculumAssetReader(root = process.env.CURRICULUM_ASSET_ROOT): CurriculumAssetReader {
  return async (key) => {
    if (!root || !/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(key) || key.split("/").some((p) => !p || p === "." || p === "..")) return undefined;
    const contentType = types[extname(key).toLowerCase()];
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
