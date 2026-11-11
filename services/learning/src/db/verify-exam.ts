import "dotenv/config";
import assert from "node:assert/strict";
import { ExamBankSchema } from "@innova/contracts";
import { createDatabase } from "./client.js";
import { createExamRepository, DEFAULT_EXAM_BANK_ID } from "./exam.js";

const stored = await createExamRepository(createDatabase()).find(DEFAULT_EXAM_BANK_ID);
assert.ok(stored, "default exam bank missing");
ExamBankSchema.parse(stored.bank);
assert.ok(stored.bank.concepts.length > 0);
assert.ok(stored.bank.scenarios.length > 0);
console.log(`Verified DB bank: ${stored.bank.concepts.length} concepts, ${stored.bank.scenarios.length} scenarios`);
