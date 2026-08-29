import { describe, expect, it } from "vitest";
import { DateRangeError, resolveDateRange, saoPauloMidnightUtc } from "./date-range.js";

describe("Phase 6 date ranges", () => {
  it("maps São Paulo midnight to the correct UTC instant", () => expect(saoPauloMidnightUtc("2026-08-28").toISOString()).toBe("2026-08-28T03:00:00.000Z"));
  it("uses inclusive local dates and an exclusive UTC upper boundary", () => expect(resolveDateRange({ range: "custom", from: "2026-08-01", to: "2026-08-02" })).toMatchObject({ displayFrom: "2026-08-01", displayTo: "2026-08-02", timeZone: "America/Sao_Paulo" }));
  it("covers Today without an off-by-one error", () => { const value=resolveDateRange({range:"today"},new Date("2026-08-28T15:00:00.000Z"));expect(value.from.toISOString()).toBe("2026-08-28T03:00:00.000Z");expect(value.toExclusive.toISOString()).toBe("2026-08-29T03:00:00.000Z"); });
  it("covers exactly seven local calendar days", () => { const value=resolveDateRange({range:"7d"},new Date("2026-08-28T15:00:00.000Z"));expect(value.displayFrom).toBe("2026-08-22");expect(value.displayTo).toBe("2026-08-28"); });
  it("covers exactly thirty local calendar days", () => expect(resolveDateRange({range:"30d"},new Date("2026-08-28T15:00:00.000Z")).displayFrom).toBe("2026-07-30"));
  it("rejects reversed, invalid and oversized custom ranges", () => { expect(()=>resolveDateRange({range:"custom",from:"2026-08-03",to:"2026-08-02"})).toThrow(DateRangeError);expect(()=>resolveDateRange({range:"custom",from:"2026-02-30",to:"2026-03-01"})).toThrow(DateRangeError);expect(()=>resolveDateRange({range:"custom",from:"2024-01-01",to:"2026-01-01"})).toThrow(DateRangeError); });
});
