import { describe, expect, it } from "vitest";

import { createFixedClock, createTestEnvironment } from "./index.js";

describe("test utilities", () => {
  it("creates isolated environment objects with explicit overrides", () => {
    const first = createTestEnvironment({ API_PORT: "4000" });
    const second = createTestEnvironment();

    expect(first.API_PORT).toBe("4000");
    expect(second.API_PORT).toBe("3001");
    expect(first).not.toBe(second);
  });

  it("returns defensive Date instances from a fixed clock", () => {
    const clock = createFixedClock();
    const first = clock.now();
    first.setUTCFullYear(2030);

    expect(clock.now().toISOString()).toBe("2026-08-28T15:00:00.000Z");
  });
});
