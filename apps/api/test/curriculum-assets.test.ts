import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BlobNotFoundError, type get, type GetBlobResult } from "@vercel/blob";
import { createCurriculumAssetReader, createBlobCurriculumAssetReader, createRuntimeCurriculumAssetReader } from "../src/curriculum-assets.js";
import { AppError } from "../src/errors.js";

test("private assets stay within configured real directory, reject traversal and active formats", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "curriculum-assets-"));
  const outside = await mkdtemp(join(tmpdir(), "curriculum-outside-"));
  t.after(async () => { await rm(root, { recursive: true }); await rm(outside, { recursive: true }); });
  await writeFile(join(root, "sample.png"), "invented image"); await writeFile(join(outside, "other.png"), "outside");
  await symlink(join(outside, "other.png"), join(root, "escape.png"));
  const read = createCurriculumAssetReader(root);
  assert.deepEqual(await read("sample.png"), { bytes: Buffer.from("invented image"), contentType: "image/png" });
  for (const key of ["../other.png", "/sample.png", "./sample.png", "missing.png", "escape.png", "sample.svg", "sample.html", "a//sample.png"]) assert.equal(await read(key), undefined);
  assert.equal(await createCurriculumAssetReader("")("sample.png"), undefined);
});

function blobResult(pathname = "synthetic/sample.png", contentType = "image/png"): GetBlobResult {
  return {
    statusCode: 200,
    stream: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from("synthetic image")); controller.close(); } }),
    headers: new Headers(),
    blob: { pathname, contentType, size: 15, url: "https://synthetic.private.blob.vercel-storage.com/sample.png", downloadUrl: "unused", contentDisposition: "inline", cacheControl: "unused", uploadedAt: new Date(0), etag: "synthetic" },
  };
}

test("Blob reader sends only validated pathnames with private access and returns bytes", async () => {
  const calls: unknown[] = [];
  const readBlob: typeof get = async (key, options) => { calls.push([key, options]); return blobResult(); };
  const read = createBlobCurriculumAssetReader("synthetic-token", readBlob);
  assert.deepEqual(await read("synthetic/sample.png"), { bytes: Buffer.from("synthetic image"), contentType: "image/png" });
  assert.deepEqual(calls, [["synthetic/sample.png", { access: "private", token: "synthetic-token" }]]);
  for (const key of ["../sample.png", "/sample.png", "./sample.png", "a/../sample.png", "a//sample.png", "a\\sample.png", "a/%2e%2e/sample.png", "https://host/sample.png", "sample.png?token=x", "sample.svg", "sample.html", ""]) assert.equal(await read(key), undefined);
  assert.equal(await createBlobCurriculumAssetReader(undefined, readBlob)("synthetic/sample.png"), undefined);
  assert.equal(calls.length, 1);
});

test("missing blobs are unavailable, invalid metadata is rejected, SDK and stream failures are sanitized", async () => {
  assert.equal(await createBlobCurriculumAssetReader("synthetic", async () => null)("synthetic/sample.png"), undefined);
  assert.equal(await createBlobCurriculumAssetReader("synthetic", async () => { throw new BlobNotFoundError(); })("synthetic/sample.png"), undefined);
  for (const [path, type] of [["synthetic/sample.png", "text/html"], ["synthetic/sample.png", "image/svg+xml"], ["other.png", "image/png"]]) {
    assert.equal(await createBlobCurriculumAssetReader("synthetic", async () => blobResult(path, type))("synthetic/sample.png"), undefined);
  }
  const failedStream = blobResult();
  if (failedStream.statusCode === 200) failedStream.stream = new ReadableStream({ start(controller) { controller.error(new Error("synthetic credential in stream error")); } });
  for (const readBlob of [async () => { throw new Error("synthetic credential in SDK error"); }, async () => failedStream]) {
    await assert.rejects(createBlobCurriculumAssetReader("synthetic", readBlob)("synthetic/sample.png"), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 503);
      assert.equal(error.message, "Private asset storage is unavailable");
      assert.equal(error.cause, undefined);
      assert.equal(error.stack?.includes("credential"), false);
      return true;
    });
  }
});

test("runtime chooses Blob before filesystem, filesystem without credentials, otherwise unavailable", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "curriculum-runtime-"));
  t.after(() => rm(root, { recursive: true }));
  await writeFile(join(root, "sample.png"), "synthetic local image");
  let calls = 0;
  const readBlob: typeof get = async () => { calls++; return blobResult("sample.png"); };
  assert.equal((await createRuntimeCurriculumAssetReader({ token: "synthetic", root }, readBlob)("sample.png"))?.bytes.toString(), "synthetic image");
  assert.equal((await createRuntimeCurriculumAssetReader({ token: "", root }, readBlob)("sample.png"))?.bytes.toString(), "synthetic local image");
  assert.equal(await createRuntimeCurriculumAssetReader({ token: "", root: "" }, readBlob)("sample.png"), undefined);
  assert.equal(calls, 1);
});
