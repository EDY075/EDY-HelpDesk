import { describe, expect, it } from "vitest";

import { ConfigValidationError, loadConfig } from "./index.js";

const validEnvironment = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: "3001",
  WEB_ORIGIN: "http://127.0.0.1:5173",
  DATABASE_PROVIDER: "sqlite",
  DATABASE_URL: "file:./test.db",
  LOG_LEVEL: "silent",
  PORTFOLIO_DEMO: "true",
};

describe("loadConfig", () => {
  it("parses and freezes a valid injected environment", () => {
    const config = loadConfig(validEnvironment);

    expect(config.API_PORT).toBe(3001);
    expect(config.PORTFOLIO_DEMO).toBe(true);
    expect(config.DATABASE_PROVIDER).toBe("sqlite");
    expect(config.INTEGRATION_SENTINEL_ENABLED).toBe(false);
    expect(config.INTEGRATION_SIEM_ENABLED).toBe(false);
    expect(config.INTEGRATION_ANALYTICS_ENABLED).toBe(false);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("does not coerce the string false to true", () => {
    const config = loadConfig({ ...validEnvironment, PORTFOLIO_DEMO: "false" });

    expect(config.PORTFOLIO_DEMO).toBe(false);
  });

  it("fails closed when a required variable is missing", () => {
    expect(() => loadConfig({ ...validEnvironment, DATABASE_URL: undefined })).toThrow(
      ConfigValidationError,
    );
  });

  it("rejects an origin containing a path", () => {
    expect(() =>
      loadConfig({ ...validEnvironment, WEB_ORIGIN: "http://127.0.0.1:5173/app" }),
    ).toThrow(ConfigValidationError);
  });

  it("rejects ports outside the TCP range", () => {
    expect(() => loadConfig({ ...validEnvironment, API_PORT: "70000" })).toThrow(
      ConfigValidationError,
    );
  });

  it("permanently disables external integrations in Portfolio Demo", () => {
    expect(() => loadConfig({ ...validEnvironment, INTEGRATION_ANALYTICS_ENABLED: "true" })).toThrow(
      ConfigValidationError,
    );
  });

  it("rejects public integration endpoints", () => {
    expect(() => loadConfig({
      ...validEnvironment,
      PORTFOLIO_DEMO: "false",
      INTEGRATION_SIEM_ENABLED: "true",
      INTEGRATION_SIEM_URL: "https://example.com",
      INTEGRATION_SIEM_TOKEN: "synthetic-local-test-token-32-characters",
    })).toThrow(ConfigValidationError);
  });

  it("accepts private integration configuration while delivery remains disabled", () => {
    const config = loadConfig({
      ...validEnvironment,
      PORTFOLIO_DEMO: "false",
      INTEGRATION_SIEM_URL: "http://127.0.0.1:8090",
      INTEGRATION_SIEM_TOKEN: "synthetic-local-test-token-32-characters",
    });

    expect(config.INTEGRATION_SIEM_ENABLED).toBe(false);
    expect(config.INTEGRATION_SIEM_URL).toBe("http://127.0.0.1:8090");
  });

  it("fails closed when an incompatible adapter is activated", () => {
    expect(() => loadConfig({
      ...validEnvironment,
      PORTFOLIO_DEMO: "false",
      INTEGRATION_SIEM_ENABLED: "true",
      INTEGRATION_SIEM_URL: "http://127.0.0.1:8090",
      INTEGRATION_SIEM_TOKEN: "synthetic-local-test-token-32-characters",
    })).toThrow(ConfigValidationError);
  });

  it("rejects a database URL that does not match its provider", () => {
    expect(() => loadConfig({
      ...validEnvironment,
      DATABASE_PROVIDER: "postgresql",
      DATABASE_URL: "file:./wrong-provider.db",
    })).toThrow(ConfigValidationError);
  });
});
