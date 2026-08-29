import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function safeHeaderId(value: string | undefined): string {
  return value && UUID.test(value) ? value : randomUUID();
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = safeHeaderId(req.header("x-request-id"));
  const correlationId = safeHeaderId(req.header("x-correlation-id"));

  req.requestId = requestId;
  req.correlationId = correlationId;
  res.setHeader("x-request-id", requestId);
  res.setHeader("x-correlation-id", correlationId);
  next();
}
