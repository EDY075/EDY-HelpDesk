import { performance } from "node:perf_hooks";

import type { Logger } from "pino";
import type { NextFunction, Request, Response } from "express";

export function requestLogging(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = performance.now();

    res.once("finish", () => {
      logger.info({
        requestId: req.requestId,
        correlationId: req.correlationId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
      }, "request completed");
    });

    next();
  };
}
