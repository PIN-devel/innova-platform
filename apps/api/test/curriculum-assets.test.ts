import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCurriculumAssetReader } from "../src/curriculum-assets.js";

test("private assets stay within configured real directory, reject traversal and active formats", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "curriculum-assets-"));
  const outside = await mkdtemp(join(tmpdir(), "curriculum-outside-"));
  t.after(async () => { await rm(root, { recursive: true }); await rm(outside, { recursive: true }); });
  await writeFile(join(root, "sample.png"), "invented image"); await writeFile(join(outside, "other.png"), "outside");
  await symlink(join(outside, "other.png"), join(root, "escape.png"));
  const read = createCurriculumAssetReader(root);
  assert.equal((await read("sample.png"))?.contentType, "image/png");
  for (const key of ["../other.png", "/sample.png", "./sample.png", "missing.png", "escape.png", "sample.svg", "sample.html", "a//sample.png"]) assert.equal(await read(key), undefined);
  assert.equal(await createCurriculumAssetReader("")("sample.png"), undefined);
});
