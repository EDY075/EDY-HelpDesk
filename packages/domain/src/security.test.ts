import { describe, expect, it } from "vitest";
import { assertSecurityCaseTransition, getAllowedSecurityCaseTransitions, InvalidSecurityCaseTransitionError, TicketInvariantError } from "./index.js";

describe("Phase 5 security workflow", () => {
  it("allows the documented investigation path", () => {
    expect(() => assertSecurityCaseTransition("New", "Triaged")).not.toThrow();
    expect(() => assertSecurityCaseTransition("Triaged", "Investigating")).not.toThrow();
    expect(() => assertSecurityCaseTransition("Investigating", "Contained")).not.toThrow();
    expect(() => assertSecurityCaseTransition("Contained", "Resolved")).not.toThrow();
    expect(() => assertSecurityCaseTransition("Resolved", "Closed")).not.toThrow();
  });

  it("rejects invalid status jumps", () => {
    expect(() => assertSecurityCaseTransition("New", "Closed")).toThrow(InvalidSecurityCaseTransitionError);
  });

  it("requires a reason to reopen a terminal case", () => {
    expect(() => assertSecurityCaseTransition("Closed", "Investigating")).toThrow(TicketInvariantError);
    expect(() => assertSecurityCaseTransition("Closed", "Investigating", "New evidence received")).not.toThrow();
  });

  it("keeps Contained as a process state", () => {
    expect(getAllowedSecurityCaseTransitions("Contained")).toEqual(["Investigating", "Resolved", "FalsePositive"]);
  });
});
