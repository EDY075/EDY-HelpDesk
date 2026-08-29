import pino, { type Logger } from "pino";

const REDACTED_PATHS = [
  "password",
  "credentialHash",
  "token",
  "authorization",
  "cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "headers.authorization",
  "headers.cookie",
  "headers['x-api-key']",
] as const;

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: "edy-helpdesk-api" },
    redact: {
      paths: [...REDACTED_PATHS],
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
