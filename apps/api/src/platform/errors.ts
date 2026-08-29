import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import { problemDetailsSchema } from "@edy/contracts";

export class HttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly title: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  const status = Reflect.get(error, "status");
  return typeof status === "number" && Number.isInteger(status) ? status : undefined;
}

function problem(req: Request, status: number, title: string, detail: string) {
  return problemDetailsSchema.parse({
    type: "about:blank",
    title,
    status,
    detail,
    instance: req.originalUrl,
    requestId: req.requestId,
    correlationId: req.correlationId,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res
    .status(404)
    .type("application/problem+json")
    .json(problem(req, 404, "Not Found", "The requested resource was not found."));
}

export function errorHandler(logger: Logger) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (res.headersSent) {
      logger.error({ requestId: req.requestId, correlationId: req.correlationId }, "error after response headers");
      return;
    }

    const isJsonSyntaxError = error instanceof SyntaxError && "body" in error;
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') error = new HttpError(409, 'Conflict', 'A record with this unique identifier already exists.');
    const middlewareStatus = errorStatus(error);
    const isPayloadTooLarge = middlewareStatus === 413;
    const status = error instanceof HttpError ? error.status : isJsonSyntaxError ? 400 : isPayloadTooLarge ? 413 : 500;
    const title = error instanceof HttpError
      ? error.title
      : isJsonSyntaxError
        ? "Bad Request"
        : isPayloadTooLarge
          ? "Payload Too Large"
        : "Internal Server Error";
    const detail = error instanceof HttpError
      ? error.message
      : isJsonSyntaxError
        ? "The request body contains invalid JSON."
        : isPayloadTooLarge
          ? "The request body exceeds the configured limit."
        : "An unexpected error occurred.";

    const log = status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
    const safeError = error instanceof Error
      ? status >= 500
        ? {
            name: error.name,
            code: typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
              ? error.code.slice(0, 64)
              : undefined,
          }
        : { name: error.name, message: error.message }
      : { name: "UnknownError" };
    log(
      {
        requestId: req.requestId,
        correlationId: req.correlationId,
        statusCode: status,
        error: safeError,
      },
      "request failed",
    );

    res.status(status).type("application/problem+json").json(problem(req, status, title, detail));
  };
}
