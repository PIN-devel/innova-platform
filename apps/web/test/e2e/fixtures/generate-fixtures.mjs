import {
  cleanE2eArtifacts,
  ensureSyntheticFixtures,
} from "./synthetic-finance-files.ts";

const args = new Set(process.argv.slice(2));

if (args.has("--clean")) {
  cleanE2eArtifacts();
  console.log("Cleaned local E2E fixtures cache and failure artifacts.");
  process.exit(0);
}

const force = args.has("--force");
const result = ensureSyntheticFixtures({ force });
console.log(
  JSON.stringify(
    {
      reused: result.reused,
      directory: result.directory,
      cardXlsx: result.cardXlsx,
      bankPlainPdf: result.bankPlainPdf,
      bankProtectedPdf: result.bankProtectedPdf,
    },
    null,
    2,
  ),
);
