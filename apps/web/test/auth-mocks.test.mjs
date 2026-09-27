import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { apiErrorResponseSchema, authResponseSchema } from "@innova/contracts";
import { setupServer } from "msw/node";
import { handlers, resetAuthMock } from "../src/mocks/handlers.ts";

const server = setupServer(...handlers);
const baseUrl = "http://localhost";

before(() => server.listen({ onUnhandledRequest: "error" }));
after(() => server.close());
beforeEach(() => resetAuthMock());

function authRequest(path, method = "GET", body) {
  return fetch(`${baseUrl}/api/auth${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

async function errorCode(response) {
  return apiErrorResponseSchema.parse(await response.json()).error.code;
}

test("MSW signup validates, prevents duplicates, auto-authenticates, and resets", async () => {
  const signup = await authRequest("/signup", "POST", { email: "New@Example.com", password: "password123" });
  assert.equal(signup.status, 201);
  const user = authResponseSchema.parse(await signup.json()).user;
  assert.equal(user.email, "new@example.com");
  assert.deepEqual(Object.keys(user).sort(), ["email", "id"]);

  const duplicate = await authRequest("/signup", "POST", { email: "new@example.com", password: "password123" });
  assert.equal(duplicate.status, 409);
  assert.equal(await errorCode(duplicate), "EMAIL_ALREADY_EXISTS");

  const me = await authRequest("/me");
  assert.deepEqual(authResponseSchema.parse(await me.json()).user, user);

  const invalid = await authRequest("/signup", "POST", { email: "bad", password: "short" });
  assert.equal(invalid.status, 400);
  const invalidPayload = apiErrorResponseSchema.parse(await invalid.json());
  assert.equal(invalidPayload.error.code, "INVALID_INPUT");
  assert.ok(invalidPayload.error.details.some((detail) => detail.field === "email" && detail.reason === "invalid_format"));

  resetAuthMock();
  const signedOut = await authRequest("/me");
  assert.equal(signedOut.status, 401);
  assert.equal(await errorCode(signedOut), "UNAUTHORIZED");
});

test("MSW login returns the same credential error for unknown email and wrong password", async () => {
  const success = await authRequest("/login", "POST", { email: "TEST@example.com", password: "password123" });
  assert.equal(success.status, 200);
  const user = authResponseSchema.parse(await success.json()).user;

  const me = await authRequest("/me");
  assert.deepEqual(authResponseSchema.parse(await me.json()).user, user);

  for (const credentials of [
    { email: "test@example.com", password: "incorrect123" },
    { email: "missing@example.com", password: "password123" },
  ]) {
    const failed = await authRequest("/login", "POST", credentials);
    assert.equal(failed.status, 401);
    assert.equal(await errorCode(failed), "INVALID_CREDENTIALS");
  }
});

test("MSW logout is idempotent and clears the current mock user", async () => {
  await authRequest("/login", "POST", { email: "test@example.com", password: "password123" });
  const logout = await authRequest("/logout", "POST", {});
  assert.equal(logout.status, 204);
  assert.equal(await authRequest("/me").then((response) => response.status), 401);
  assert.equal((await authRequest("/logout", "POST", {})).status, 204);
});

test("MSW exam bank requires a signed-in user", async () => {
  const bankUrl = `${baseUrl}/api/exam/banks/default`;
  const signedOut = await fetch(bankUrl);
  assert.equal(signedOut.status, 401);
  assert.equal(await errorCode(signedOut), "UNAUTHORIZED");

  await authRequest("/login", "POST", { email: "test@example.com", password: "password123" });
  const signedIn = await fetch(bankUrl);
  assert.equal(signedIn.status, 200);
  const bank = await signedIn.json();
  assert.equal(bank.id, "aws-sap");

  await authRequest("/logout", "POST", {});
  const signedOutAgain = await fetch(bankUrl);
  assert.equal(signedOutAgain.status, 401);
});

test("MSW exam bank not-found and validation errors use the shared envelope", async () => {
  await authRequest("/login", "POST", { email: "test@example.com", password: "password123" });
  const missing = await fetch(`${baseUrl}/api/exam/banks/missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(apiErrorResponseSchema.parse(await missing.json()).error, {
    code: "NOT_FOUND",
    message: "Exam bank not found",
  });

  const invalid = await fetch(`${baseUrl}/api/exam/banks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schema: "unknown" }),
  });
  assert.equal(invalid.status, 400);
  const body = apiErrorResponseSchema.parse(await invalid.json());
  assert.equal(body.error.code, "INVALID_INPUT");
  assert.ok(body.error.details?.length);
  assert.equal("issues" in body, false);

  const unknownRoute = await fetch(`${baseUrl}/api/unknown`);
  assert.equal(unknownRoute.status, 404);
  assert.equal(await errorCode(unknownRoute), "NOT_FOUND");
});
