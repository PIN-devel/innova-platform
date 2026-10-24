import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { test, type TestContext } from "node:test";

async function startServer(t: TestContext, mode = "normal") {
  const child = fork(fileURLToPath(new URL("./fixtures/shutdown-server.ts", import.meta.url)), [mode], {
    execArgv: ["--import", "tsx"],
    env: { NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const events = new EventEmitter();
  const messages: { type: string; address?: string }[] = [];
  const logs: { event: string; signal?: string }[] = [];
  let stderr = "";
  let buffer = "";
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  child.on("message", (message) => { messages.push(message as typeof messages[number]); events.emit("change"); });
  child.stdout!.setEncoding("utf8").on("data", (chunk) => {
    buffer += chunk;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      logs.push(JSON.parse(buffer.slice(0, newline)));
      buffer = buffer.slice(newline + 1);
    }
    events.emit("change");
  });
  child.stderr!.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  child.on("error", (error) => { stderr += String(error); events.emit("change"); });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await exited; });
  const waitFor = async (predicate: () => boolean) => {
    if (predicate()) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Child did not reach expected state: ${stderr}`)); }, 5_000);
      const check = () => { if (predicate()) { cleanup(); resolve(); } };
      const cleanup = () => { clearTimeout(timer); events.off("change", check); };
      events.on("change", check);
      check();
    });
  };
  await waitFor(() => messages.some((message) => message.type === "listening"));
  const address = messages.find((message) => message.type === "listening")!.address!;
  return { child, address, logs, exited, waitFor, messages };
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  test(`${signal} closes the real server and exits successfully`, { timeout: 10_000 }, async (t) => {
    const server = await startServer(t);
    assert.equal((await fetch(`${server.address}/health`)).status, 200);
    server.child.kill(signal);
    assert.deepEqual(await server.exited, { code: 0, signal: null });
    assert.equal(server.logs.filter((log) => log.event === "server.shutdown.started").length, 1);
    assert.ok(server.logs.some((log) => log.event === "server.shutdown.completed" && log.signal === signal));
  });
}

test("shutdown drains an active request, rejects new work and ignores a second signal", { timeout: 10_000 }, async (t) => {
  const server = await startServer(t);
  const response = fetch(`${server.address}/slow`);
  await server.waitFor(() => server.messages.some((message) => message.type === "request.started"));
  server.child.kill("SIGTERM");
  await server.waitFor(() => server.logs.some((log) => log.event === "server.shutdown.started"));
  server.child.kill("SIGINT");
  const unavailable = await fetch(`${server.address}/health`).then((result) => result.status, () => 503);
  assert.equal(unavailable, 503);
  server.child.send("release");
  const finished = await response;
  assert.equal(finished.headers.get("connection"), "close");
  assert.deepEqual(await finished.json(), { finished: true });
  assert.deepEqual(await server.exited, { code: 0, signal: null }, JSON.stringify(server.logs));
  assert.equal(server.logs.filter((log) => log.event === "server.shutdown.started").length, 1);
});

test("a request that never finishes is stopped at the shutdown deadline", { timeout: 10_000 }, async (t) => {
  const server = await startServer(t);
  const response = fetch(`${server.address}/hang`).then(() => "completed", () => "interrupted");
  await server.waitFor(() => server.messages.some((message) => message.type === "request.started"));
  server.child.kill("SIGTERM");
  assert.deepEqual(await server.exited, { code: 1, signal: null });
  assert.equal(await response, "interrupted");
  assert.ok(server.logs.some((log) => log.event === "server.shutdown.timeout"));
});

test("a close hook failure produces a failed shutdown and non-zero exit", { timeout: 10_000 }, async (t) => {
  const server = await startServer(t, "close-failure");
  server.child.kill("SIGTERM");
  assert.deepEqual(await server.exited, { code: 1, signal: null });
  assert.ok(server.logs.some((log) => log.event === "server.shutdown.failed"));
  assert.equal(server.logs.some((log) => log.event === "server.shutdown.completed"), false);
});
