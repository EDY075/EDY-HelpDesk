import { z } from "zod";
export * from './diagnostics.js';
export * from './diagnostic-manifest.js';
export * from './diagnostic-fixtures.js';
export * from './diagnostic-json-schema.js';
export * from './security.js';
export * from './analytics.js';
export * from './integrations.js';

export const requestIdSchema = z.string().uuid();
export const correlationIdSchema = z.string().uuid();

export const requestContextSchema = z
  .object({
    requestId: requestIdSchema,
    correlationId: correlationIdSchema,
  })
  .strict();

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("edy-helpdesk-api"),
    version: z.string().min(1),
    timestamp: z.string().datetime({ offset: true }),
    uptimeSeconds: z.number().nonnegative(),
  })
  .strict();

export const readinessChecksSchema = z
  .object({
    configuration: z.object({ status: z.literal("ok") }).strict(),
    database: z
      .object({
        status: z.enum(["ok", "error"]),
        message: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const readyResponseSchema = z
  .object({
    status: z.enum(["ready", "not_ready"]),
    service: z.literal("edy-helpdesk-api"),
    timestamp: z.string().datetime({ offset: true }),
    checks: readinessChecksSchema,
  })
  .strict();

export const readinessResponseSchema = readyResponseSchema;

export const problemDetailsSchema = z
  .object({
    type: z.string().min(1).default("about:blank"),
    title: z.string().min(1),
    status: z.number().int().min(400).max(599),
    detail: z.string().min(1),
    instance: z.string().min(1).optional(),
    requestId: requestIdSchema,
    correlationId: correlationIdSchema,
  })
  .strict();

export type RequestContext = z.infer<typeof requestContextSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadinessChecks = z.infer<typeof readinessChecksSchema>;
export type ReadyResponse = z.infer<typeof readyResponseSchema>;
export type ReadinessResponse = ReadyResponse;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
