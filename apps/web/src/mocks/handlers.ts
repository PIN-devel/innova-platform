import {
  authResponseSchema,
  ExamBankRecordSchema,
  ExamBankSchema,
  loginRequestSchema,
  signupRequestSchema,
} from "@innova/contracts";
import type { AuthUser, ExamBankRecord } from "@innova/contracts";
import { http, HttpResponse } from "msw";

const seedBank = ExamBankSchema.parse({
  schema: "sap-drill-bank.v1",
  subject: "Exam Drill sample bank",
  source: "MSW synthetic sample",
  generatedAt: "2026-09-27T00:00:00.000Z",
  notes: "Synthetic content for exercising the Exam Drill interface.",
  concepts: Array.from({ length: 20 }, (_, index) => {
    const task = Math.floor(index / 2) + 1;
    return {
      id: `mock-concept-${index + 1}`,
      chapter: task,
      deck: "Synthetic sample",
      term: `Sample concept ${index + 1}`,
      definition: `Synthetic definition for sample concept ${index + 1}.`,
      rationale: "This placeholder exists only to exercise the local mock interface.",
      mcqStem: `Which option identifies sample concept ${index + 1}?`,
      mcqChoices: [`Sample concept ${index + 1}`, "Unrelated sample option A", "Unrelated sample option B"],
      mcqAnswerIndex: 0,
      trap: `Sample concept ${index + 1} is a synthetic placeholder.`,
      trapAnswer: true,
      trapWhy: "The sample statement is marked true for this synthetic exercise.",
      tags: [`T${task}.1`],
    };
  }),
  scenarios: Array.from({ length: 10 }, (_, index) => {
    const task = index + 1;
    return {
      id: `mock-scenario-${task}`,
      chapter: task,
      stem: `Synthetic scenario ${task}: choose the placeholder response for this sample task.`,
      choices: ["Sample response A", "Sample response B", "Sample response C"],
      answerIndex: 0,
      rationale: "This synthetic answer is provided only for local UI testing.",
      tags: [`T${task}.1`],
    };
  }),
});

const banks = new Map<string, ExamBankRecord>([
  ["aws-sap", ExamBankRecordSchema.parse({ id: "aws-sap", bank: seedBank })],
]);

const headers = { "Cache-Control": "no-store" };

const defaultMockUser: AuthUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "test@example.com",
};
type MockCredential = { user: AuthUser; password: string };
let mockUsers = new Map<string, MockCredential>();
let currentMockUser: AuthUser | null = null;

export function resetAuthMock() {
  mockUsers = new Map([[defaultMockUser.email, { user: defaultMockUser, password: "password123" }]]);
  currentMockUser = null;
}

resetAuthMock();

function authError(code: "INVALID_INPUT" | "EMAIL_ALREADY_EXISTS" | "INVALID_CREDENTIALS" | "UNAUTHORIZED", message: string, status: number) {
  return HttpResponse.json({ error: { code, message } }, { status, headers });
}

function authSuccess(user: AuthUser, status = 200) {
  return HttpResponse.json(authResponseSchema.parse({ user }), { status, headers });
}

export const handlers = [
  http.post("*/api/auth/signup", async ({ request }) => {
    let body: unknown;
    try { body = await request.json(); } catch { return authError("INVALID_INPUT", "Invalid signup input", 400); }
    const parsed = signupRequestSchema.safeParse(body);
    if (!parsed.success) return authError("INVALID_INPUT", "Invalid signup input", 400);
    if (mockUsers.has(parsed.data.email)) return authError("EMAIL_ALREADY_EXISTS", "Email already exists", 409);
    const user: AuthUser = { id: crypto.randomUUID(), email: parsed.data.email };
    mockUsers.set(user.email, { user, password: parsed.data.password });
    currentMockUser = user;
    return authSuccess(user, 201);
  }),

  http.post("*/api/auth/login", async ({ request }) => {
    let body: unknown;
    try { body = await request.json(); } catch { return authError("INVALID_INPUT", "Invalid login input", 400); }
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) return authError("INVALID_INPUT", "Invalid login input", 400);
    const credential = mockUsers.get(parsed.data.email);
    if (!credential || credential.password !== parsed.data.password) {
      return authError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }
    currentMockUser = credential.user;
    return authSuccess(credential.user);
  }),

  http.get("*/api/auth/me", () => currentMockUser
    ? authSuccess(currentMockUser)
    : authError("UNAUTHORIZED", "Authentication required", 401)),

  http.post("*/api/auth/logout", () => {
    currentMockUser = null;
    return new HttpResponse(null, { status: 204, headers });
  }),

  http.get("*/api/exam/banks/:id", ({ params }) => {
    if (!currentMockUser) return authError("UNAUTHORIZED", "Authentication required", 401);
    const id = String(params.id) === "default" ? "aws-sap" : String(params.id);
    const record = banks.get(id);
    return record
      ? HttpResponse.json(record, { headers })
      : HttpResponse.json({ message: "Exam bank not found" }, { status: 404, headers });
  }),

  http.post("*/api/exam/banks", async ({ request }) => {
    if (!currentMockUser) return authError("UNAUTHORIZED", "Authentication required", 401);
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return HttpResponse.json({ message: "Invalid exam bank" }, { status: 400, headers });
    }

    const parsed = ExamBankSchema.safeParse(payload);
    if (!parsed.success) {
      return HttpResponse.json({ message: "Invalid exam bank" }, { status: 400, headers });
    }

    const record = ExamBankRecordSchema.parse({ id: crypto.randomUUID(), bank: parsed.data });
    banks.set(record.id, record);
    return HttpResponse.json(record, { status: 201, headers });
  }),
];
