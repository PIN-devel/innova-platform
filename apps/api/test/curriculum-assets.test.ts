import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCurriculumAssetReader, createGcsCurriculumAssetReader, createRuntimeCurriculumAssetReader, type GcsFetch } from "../src/curriculum-assets.js";
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

function fakeGcsResponse({ status = 200, contentType = "image/png", body = "synthetic image" } = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": contentType },
  });
}

test("GCS reader sends only validated pathnames with Authorization and returns bytes", async () => {
  const calls: [string, RequestInit | undefined][] = [];
  const fakeFetch: GcsFetch = async (input, init) => {
    calls.push([String(input), init]);
    return fakeGcsResponse();
  };
  const read = createGcsCurriculumAssetReader({ bucket: "test-bucket", token: "synthetic-token", fetchFn: fakeFetch });
  assert.deepEqual(await read("synthetic/sample.png"), { bytes: Buffer.from("synthetic image"), contentType: "image/png" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://storage.googleapis.com/storage/v1/b/test-bucket/o/synthetic%2Fsample.png?alt=media");
  assert.deepEqual(calls[0][1]?.headers, { Authorization: "Bearer synthetic-token" });

  for (const key of ["../sample.png", "/sample.png", "./sample.png", "a/../sample.png", "a//sample.png", "a\\sample.png", "a/%2e%2e/sample.png", "https://host/sample.png", "sample.png?token=x", "sample.svg", "sample.html", ""]) {
    assert.equal(await read(key), undefined);
  }
  assert.equal(await createGcsCurriculumAssetReader({ bucket: "", fetchFn: fakeFetch })("synthetic/sample.png"), undefined);
});

test("missing GCS objects return undefined, mismatched content-type is rejected, and fetch errors are sanitized", async () => {
  const fake404: GcsFetch = async () => fakeGcsResponse({ status: 404 });
  assert.equal(await createGcsCurriculumAssetReader({ bucket: "test-bucket", fetchFn: fake404 })("synthetic/sample.png"), undefined);

  for (const type of ["text/html", "image/svg+xml", "application/json"]) {
    const fakeWrongType: GcsFetch = async () => fakeGcsResponse({ contentType: type });
    assert.equal(await createGcsCurriculumAssetReader({ bucket: "test-bucket", fetchFn: fakeWrongType })("synthetic/sample.png"), undefined);
  }

  const failingFetches: GcsFetch[] = [
    async () => { throw new Error("synthetic credential in network error"); },
    async () => fakeGcsResponse({ status: 500, body: "sensitive internal error" }),
    async () => fakeGcsResponse({ status: 403, body: "access denied to gs://test-bucket/secret" }),
  ];

  for (const fetchFn of failingFetches) {
    await assert.rejects(createGcsCurriculumAssetReader({ bucket: "test-bucket", fetchFn })("synthetic/sample.png"), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 503);
      assert.equal(error.message, "Private asset storage is unavailable");
      assert.equal(error.cause, undefined);
      assert.equal(error.stack?.includes("credential"), false);
      assert.equal(error.stack?.includes("secret"), false);
      return true;
    });
  }
});

test("runtime chooses GCS before filesystem, filesystem when bucket unset, otherwise unavailable", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "curriculum-runtime-"));
  t.after(() => rm(root, { recursive: true }));
  await writeFile(join(root, "sample.png"), "synthetic local image");

  let gcsCalls = 0;
  const fakeFetch: GcsFetch = async () => { gcsCalls++; return fakeGcsResponse({ body: "gcs image" }); };

  assert.equal((await createRuntimeCurriculumAssetReader({ bucket: "test-bucket", root, fetchFn: fakeFetch })("sample.png"))?.bytes.toString(), "gcs image");
  assert.equal((await createRuntimeCurriculumAssetReader({ bucket: "", root, fetchFn: fakeFetch })("sample.png"))?.bytes.toString(), "synthetic local image");
  assert.equal(await createRuntimeCurriculumAssetReader({ bucket: "", root: "", fetchFn: fakeFetch })("sample.png"), undefined);
  assert.equal(gcsCalls, 1);
});
