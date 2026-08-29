import { z } from "zod";

const originSchema = z.string().url().superRefine((value, context) => {
  const parsed = new URL(value);

  if (parsed.origin !== value || parsed.username || parsed.password) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "WEB_ORIGIN must be an exact origin without credentials, path, query or fragment",
    });
  }
});

const portfolioDemoSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const switchSchema = z.enum(["true", "false"]).default("false").transform((value) => value === "true");
const optionalSecretSchema = z.preprocess((value) => value === "" ? undefined : value, z.string().trim().min(32).max(512).optional());
const privateIntegrationOriginSchema = z.preprocess((value) => value === "" ? undefined : value, originSchema.optional()).superRefine((value, context) => {
  if (!value) return;
  const parsed = new URL(value);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const privateHost = hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.") ||
    hostname.startsWith("10.") || hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  if (!privateHost) context.addIssue({ code: z.ZodIssueCode.custom, message: "Integration origins must use localhost or a private IP address" });
});

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    API_HOST: z.string().trim().min(1),
    API_PORT: z.coerce.number().int().min(1).max(65_535),
    WEB_ORIGIN: originSchema,
    DATABASE_PROVIDER: z.enum(["sqlite", "postgresql"]).default("sqlite"),
    DATABASE_URL: z.string().trim().min(1),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
    PORTFOLIO_DEMO: portfolioDemoSchema,
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1_440).default(30),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(720).default(12),
    INTEGRATION_SENTINEL_ENABLED: switchSchema,
    INTEGRATION_SENTINEL_URL: privateIntegrationOriginSchema,
    INTEGRATION_SENTINEL_TOKEN: optionalSecretSchema,
    INTEGRATION_SIEM_ENABLED: switchSchema,
    INTEGRATION_SIEM_URL: privateIntegrationOriginSchema,
    INTEGRATION_SIEM_TOKEN: optionalSecretSchema,
    INTEGRATION_ANALYTICS_ENABLED: switchSchema,
    INTEGRATION_TIMEOUT_MS: z.coerce.number().int().min(500).max(10_000).default(3_000),
    INTEGRATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    INTEGRATION_BACKOFF_BASE_MS: z.coerce.number().int().min(250).max(60_000).default(1_000),
  })
  .strict()
  .superRefine((value, context) => {
    const databaseMatches = value.DATABASE_PROVIDER === "sqlite"
      ? value.DATABASE_URL.startsWith("file:")
      : /^(postgres|postgresql):\/\//.test(value.DATABASE_URL);
    if (!databaseMatches) context.addIssue({ code: z.ZodIssueCode.custom, path: ["DATABASE_URL"], message: "DATABASE_URL does not match DATABASE_PROVIDER" });
    if (value.PORTFOLIO_DEMO && (value.INTEGRATION_SENTINEL_ENABLED || value.INTEGRATION_SIEM_ENABLED || value.INTEGRATION_ANALYTICS_ENABLED)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["PORTFOLIO_DEMO"], message: "Portfolio Demo permanently disables external integrations" });
    }
    if (value.INTEGRATION_SENTINEL_ENABLED && (!value.INTEGRATION_SENTINEL_URL || !value.INTEGRATION_SENTINEL_TOKEN)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["INTEGRATION_SENTINEL_ENABLED"], message: "Sentinel requires a private origin and scoped token" });
    }
    if (value.INTEGRATION_SIEM_ENABLED && (!value.INTEGRATION_SIEM_URL || !value.INTEGRATION_SIEM_TOKEN)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["INTEGRATION_SIEM_ENABLED"], message: "SIEM requires a private origin and scoped token" });
    }
    if (!value.PORTFOLIO_DEMO && value.INTEGRATION_SENTINEL_ENABLED) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["INTEGRATION_SENTINEL_ENABLED"], message: "Sentinel cannot be enabled until a compatible adapter contract is approved" });
    }
    if (!value.PORTFOLIO_DEMO && value.INTEGRATION_SIEM_ENABLED) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["INTEGRATION_SIEM_ENABLED"], message: "SIEM cannot be enabled while the discovered endpoint contract is incompatible" });
    }
    if (!value.PORTFOLIO_DEMO && value.INTEGRATION_ANALYTICS_ENABLED) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["INTEGRATION_ANALYTICS_ENABLED"], message: "Analytics connection cannot be enabled without an approved compatible pipeline" });
    }
  });

export type AppConfig = z.infer<typeof environmentSchema>;
export type EnvironmentInput = Record<string, string | undefined>;

export class ConfigValidationError extends Error {
  readonly issues: readonly z.ZodIssue[];

  constructor(issues: readonly z.ZodIssue[]) {
    super("Application configuration is invalid");
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

/**
 * Validates an explicitly injected environment object.
 * This package intentionally does not load .env files or mutate process.env.
 */
export function loadConfig(environment: EnvironmentInput = process.env): AppConfig {
  const selectedEnvironment = {
    NODE_ENV: environment.NODE_ENV,
    API_HOST: environment.API_HOST,
    API_PORT: environment.API_PORT,
    WEB_ORIGIN: environment.WEB_ORIGIN,
    DATABASE_PROVIDER: environment.DATABASE_PROVIDER,
    DATABASE_URL: environment.DATABASE_URL,
    LOG_LEVEL: environment.LOG_LEVEL,
    PORTFOLIO_DEMO: environment.PORTFOLIO_DEMO,
    SESSION_IDLE_MINUTES: environment.SESSION_IDLE_MINUTES,
    SESSION_ABSOLUTE_HOURS: environment.SESSION_ABSOLUTE_HOURS,
    INTEGRATION_SENTINEL_ENABLED: environment.INTEGRATION_SENTINEL_ENABLED,
    INTEGRATION_SENTINEL_URL: environment.INTEGRATION_SENTINEL_URL,
    INTEGRATION_SENTINEL_TOKEN: environment.INTEGRATION_SENTINEL_TOKEN,
    INTEGRATION_SIEM_ENABLED: environment.INTEGRATION_SIEM_ENABLED,
    INTEGRATION_SIEM_URL: environment.INTEGRATION_SIEM_URL,
    INTEGRATION_SIEM_TOKEN: environment.INTEGRATION_SIEM_TOKEN,
    INTEGRATION_ANALYTICS_ENABLED: environment.INTEGRATION_ANALYTICS_ENABLED,
    INTEGRATION_TIMEOUT_MS: environment.INTEGRATION_TIMEOUT_MS,
    INTEGRATION_MAX_ATTEMPTS: environment.INTEGRATION_MAX_ATTEMPTS,
    INTEGRATION_BACKOFF_BASE_MS: environment.INTEGRATION_BACKOFF_BASE_MS,
  };
  const result = environmentSchema.safeParse(selectedEnvironment);

  if (!result.success) {
    throw new ConfigValidationError(result.error.issues);
  }

  return Object.freeze(result.data);
}
