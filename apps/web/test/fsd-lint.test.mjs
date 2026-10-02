import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const layers = ["app", "pages", "features", "entities", "shared"];

function lint(files) {
  const root = mkdtempSync(path.join(tmpdir(), "innova-fsd-"));
  const write = (name, content) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  };
  try {
    const config = JSON.parse(readFileSync(path.join(webRoot, ".oxlintrc.json"), "utf8"));
    // Exercise the real config/rule with its package dependencies resolved from Web.
    for (const plugin of config.jsPlugins) {
      if (plugin.name !== "fsd") plugin.specifier = require.resolve(plugin.specifier);
    }
    write(".oxlintrc.json", JSON.stringify(config));
    write("lint/fsd-plugin.mjs", readFileSync(path.join(webRoot, "lint/fsd-plugin.mjs"), "utf8"));
    write("tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }));
    for (const layer of layers) write(`src/${layer}/target.ts`, "export const marker = 1; export type Marker = number;");
    for (const [name, content] of Object.entries(files)) write(name, content);
    const result = spawnSync(path.join(webRoot, "node_modules/.bin/oxlint"), ["--format", "json", "src"], { cwd: root, encoding: "utf8" });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr, diagnostics: JSON.parse(result.stdout).diagnostics };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("Oxlint allows downward/same-layer imports and normalized local paths", () => {
  const files = {};
  for (let from = 0; from < layers.length; from++) {
    for (let to = from; to < layers.length; to++) {
      files[`src/${layers[from]}/slice/valid-${to}.ts`] = `import "@/${layers[to]}/target"; import "../../${layers[to]}/target";`;
    }
  }
  files["src/shared/lib/app/value.ts"] = "export const value = 1;";
  files["src/shared/lib/valid.ts"] = 'import "./app/value"; import "react";';
  const result = lint(files);
  assert.equal(result.status, 0, result.output);
});

test("Oxlint rejects every reverse edge via aliases, relative paths and dot-segment bypasses", () => {
  const files = {};
  for (let from = 1; from < layers.length; from++) {
    for (let to = 0; to < from; to++) {
      const target = layers[to];
      const paths = [`@/${target}/target`, `../../${target}/target`, `@/shared/../${target}/target`, `../slice/../../${target}/target`, `/src/${target}/target`];
      paths.forEach((source, index) => {
        files[`src/${layers[from]}/slice/invalid-${target}-${index}.ts`] = `import "${source}";`;
      });
    }
  }
  files["src/shared/type.ts"] = 'import type { Marker } from "@/entities/target"; export type Value = Marker;';
  files["src/shared/reexport.ts"] = 'export { marker } from "@/entities/target";';
  files["src/shared/reexport-all.ts"] = 'export * from "@/entities/target";';
  files["src/shared/dynamic.ts"] = 'export const load = () => import("../features/target");';
  files["src/shared/require.ts"] = 'export const value = require("../features/target");';
  files["src/shared/import-type.ts"] = 'export type Value = import("@/entities/target").Marker;';
  files["src/shared/import-equals.ts"] = 'import value = require("@/entities/target"); export { value };';
  const result = lint(files);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /layer-direction/);
  // Each fixture must be reported, not just one representative violation.
  for (const filename of Object.keys(files)) {
    assert.ok(result.diagnostics.some(diagnostic => diagnostic.filename === filename && diagnostic.code === "fsd(layer-direction)"), `${filename}\n${result.output}`);
  }
});

test("native import/no-cycle resolves both aliases and relative edges, including type-only cycles", () => {
  const result = lint({
    "src/shared/alias-a.ts": 'import { b } from "@/shared/alias-b"; export const a = () => b();',
    "src/shared/alias-b.ts": 'import { a } from "@/shared/alias-a"; export const b = () => a();',
    "src/shared/relative-a.ts": 'import { b } from "./relative-b"; export const a = () => b();',
    "src/shared/relative-b.ts": 'import { a } from "./relative-a"; export const b = () => a();',
    "src/shared/type-a.ts": 'import type { B } from "@/shared/type-b"; export type A = { b: B };',
    "src/shared/type-b.ts": 'import type { A } from "./type-a"; export type B = { a: A };',
  });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /no-cycle/);
  for (const name of ["alias-a", "relative-a", "type-a"]) {
    assert.ok(result.diagnostics.some(diagnostic => diagnostic.filename === `src/shared/${name}.ts` && diagnostic.code === "import(no-cycle)"), result.output);
  }
});
