import pino, { type Logger, type LoggerOptions } from "pino";

const redactedPaths = [
  "password",
  "*.password",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "DATABASE_URL",
  "*.DATABASE_URL",
];

export function createWorkerLogger(level: string): Logger {
  const options: LoggerOptions = {
    name: "edy-helpdesk-diagnostics-worker",
    level,
    base: {
      service: "diagnostics-worker",
    },
    redact: {
      paths: redactedPaths,
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return pino(options);
}
