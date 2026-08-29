import { describe, expect, it } from "vitest";

import {
  InvalidTicketTransitionError,
  assertTicketTransitionAllowed,
  getAllowedTicketTransitions,
  isTicketTransitionAllowed,
  assertTicketTransition,
  pauseSla,
  resumeSla,
  markSlaBreach,
} from "./index.js";

describe("ticket transition allowlist", () => {
  it("allows a planned lifecycle transition", () => {
    expect(isTicketTransitionAllowed("New", "Assigned")).toBe(true);
    expect(() => assertTicketTransitionAllowed("InProgress", "Resolved")).not.toThrow();
  });

  it("rejects unrestricted status changes", () => {
    expect(isTicketTransitionAllowed("New", "Closed")).toBe(false);
    expect(() => assertTicketTransitionAllowed("New", "Closed")).toThrow(
      InvalidTicketTransitionError,
    );
  });

  it("does not permit transitions out of Closed", () => {
    expect(getAllowedTicketTransitions("Closed")).toEqual([]);
  });
});

describe("Phase 2 ticket invariants", () => {
  it("requires a reason for waiting and reopen", () => {
    expect(() => assertTicketTransition({ from: "InProgress", to: "WaitingUser", actorRole: "Technician", assigneeAccountId: "tech" })).toThrow(/reason/u);
    expect(() => assertTicketTransition({ from: "Resolved", to: "InProgress", actorRole: "Admin", assigneeAccountId: "tech" })).toThrow(/reason/u);
  });

  it("requires an assignment and solution", () => {
    expect(() => assertTicketTransition({ from: "New", to: "Assigned", actorRole: "Technician", assigneeAccountId: null })).toThrow(/assignment/u);
    expect(() => assertTicketTransition({ from: "InProgress", to: "Resolved", actorRole: "Technician", assigneeAccountId: "tech" })).toThrow(/solution/u);
  });

  it("pauses, resumes and preserves a breach", () => {
    const due = new Date("2026-01-01T01:00:00Z");
    const base = { resolutionDueAt: due, pausedAt: null, resolutionStoppedAt: null, totalPausedSeconds: 0, resolutionBreachedAt: null };
    const paused = pauseSla(base, new Date("2026-01-01T00:30:00Z"));
    const resumed = resumeSla(paused, new Date("2026-01-01T00:40:00Z"));
    expect(resumed.totalPausedSeconds).toBe(600);
    expect(resumed.resolutionDueAt.toISOString()).toBe("2026-01-01T01:10:00.000Z");
    const breached = markSlaBreach(resumed, new Date("2026-01-01T01:11:00Z"));
    expect(breached.resolutionBreachedAt).not.toBeNull();
    expect(markSlaBreach(breached, new Date("2026-01-01T02:00:00Z")).resolutionBreachedAt).toEqual(breached.resolutionBreachedAt);
  });
});
