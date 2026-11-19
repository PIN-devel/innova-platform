import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { createServer } from "vite";
import {
  SYNTHETIC_PDF_PASSWORD,
  buildSyntheticBankPdf,
  buildSyntheticCardXlsx,
} from "../e2e/fixtures/synthetic-finance-files.ts";

const require = createRequire(import.meta.url);
const webRoot = fileURLToPath(new URL("../../", import.meta.url));

test("pure-JS synthetic XLSX and plain/encrypted PDFs pass the real parseRawDocument parser", async (t) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "e2e-synthetic-fixtures-"));
  let vite;
  t.after(async () => {
    await vite?.close();
    await rm(cacheDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const legacyPdfPath = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
  const legacyWorkerFileUrl = pathToFileURL(
    require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
  ).href;

  vite = await createServer({
    root: webRoot,
    cacheDir,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    ssr: { noExternal: ["pdfjs-dist"] },
    plugins: [
      {
        name: "node-pdf-legacy-build",
        enforce: "pre",
        resolveId(id) {
          if (id === "pdfjs-dist/build/pdf.worker.min.mjs?url") {
            return "\0pdf-worker-url";
          }
          if (id === "pdfjs-dist") {
            return legacyPdfPath;
          }
        },
        load(id) {
          if (id === "\0pdf-worker-url") {
            return `export default ${JSON.stringify(legacyWorkerFileUrl)};`;
          }
        },
      },
    ],
  });

  const { parseRawDocument } = await vite.ssrLoadModule(
    "/src/features/finance-raw-import/parse-document.ts",
  );

  const toArrayBuffer = (bytes) =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  const cardBytes = buildSyntheticCardXlsx();
  const cardDoc = await parseRawDocument(toArrayBuffer(cardBytes));
  assert.equal(cardDoc.kind, "kb-card-xlsx");
  const cardTx = cardDoc.rows.filter((r) => r.kind === "transaction");
  assert.equal(cardTx.length, 2);
  assert.equal(cardTx[0].cells[4].value, "합성커피");
  assert.equal(cardTx[0].cells[6].value, "12500");
  assert.equal(cardTx[1].cells[4].value, "합성마트");
  assert.equal(cardTx[1].cells[6].value, "35000");

  const plainBytes = buildSyntheticBankPdf();
  const plainDoc = await parseRawDocument(toArrayBuffer(plainBytes));
  assert.equal(plainDoc.kind, "kb-bank-pdf");
  assert.equal(plainDoc.rows.length, 3);
  assert.equal(plainDoc.rows[0].cells[1].value, "급여");
  assert.equal(plainDoc.rows[0].cells[5].value, "4000000");
  assert.equal(plainDoc.rows[2].cells[5].value, "2500000");

  const protectedBytes = buildSyntheticBankPdf({ password: SYNTHETIC_PDF_PASSWORD });

  await assert.rejects(
    parseRawDocument(toArrayBuffer(protectedBytes), ""),
    (err) => err instanceof Error && err.name === "PasswordException",
  );
  await assert.rejects(
    parseRawDocument(toArrayBuffer(protectedBytes), "wrong-password"),
    (err) => err instanceof Error && err.name === "PasswordException",
  );

  let unlocked = false;
  const unlockedDoc = await parseRawDocument(
    toArrayBuffer(protectedBytes),
    SYNTHETIC_PDF_PASSWORD,
    undefined,
    () => {
      unlocked = true;
    },
  );
  assert.equal(unlocked, true);
  assert.equal(unlockedDoc.kind, "kb-bank-pdf");
  assert.equal(unlockedDoc.rows.length, 3);
  assert.equal(unlockedDoc.rows[0].cells[4].value, "3000000");
});
