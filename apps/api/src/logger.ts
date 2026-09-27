import pino, { type DestinationStream, type Logger } from "pino";

const supportedLogLevels = new Set(["trace", "debug", "info", "warn", "error", "fatal", "silent"]);

const sensitivePaths = [
  "authorization",
  "Authorization",
  "headers.authorization",
  "headers.Authorization",
  "req.headers.authorization",
  "req.headers.Authorization",
  "cookie",
  "Cookie",
  "headers.cookie",
  "headers.Cookie",
  "req.headers.cookie",
  "req.headers.Cookie",
  'headers["set-cookie"]',
  'req.headers["set-cookie"]',
  "set-cookie",
  "Set-Cookie",
  "password",
  "passwordHash",
  "*.password",
  "*.passwordHash",
  "req.body.password",
  "req.body.passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "jwt",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.jwt",
  "req.body.token",
];

export function createApplicationLogger({
  level = process.env.LOG_LEVEL ?? "info",
  destination,
}: {
  level?: string;
  destination?: DestinationStream;
} = {}): Logger {
  if (!supportedLogLevels.has(level)) {
    throw new Error(`Invalid LOG_LEVEL "${level}". Expected one of: ${[...supportedLogLevels].join(", ")}`);
  }

  return pino({ level, redact: { paths: sensitivePaths, censor: "[REDACTED]" } }, destination);
}
