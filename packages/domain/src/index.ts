import { z } from "zod";

export const ticketPriorities = ["Low", "Medium", "High", "Critical"] as const;
export const ticketStatuses = [
  "New",
  "Assigned",
  "InProgress",
  "WaitingUser",
  "WaitingThirdParty",
  "Resolved",
  "Closed",
] as const;

export const ticketPrioritySchema = z.enum(ticketPriorities);
export const ticketStatusSchema = z.enum(ticketStatuses);

export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

const plannedTicketTransitions = {
  New: ["Assigned"],
  Assigned: ["InProgress"],
  InProgress: ["WaitingUser", "WaitingThirdParty", "Resolved"],
  WaitingUser: ["InProgress"],
  WaitingThirdParty: ["InProgress"],
  Resolved: ["Closed", "InProgress"],
  Closed: [],
} as const satisfies Record<TicketStatus, readonly TicketStatus[]>;

export class InvalidTicketTransitionError extends Error {
  readonly from: TicketStatus;
  readonly to: TicketStatus;

  constructor(from: TicketStatus, to: TicketStatus) {
    super(`Ticket transition from ${from} to ${to} is not allowed`);
    this.name = "InvalidTicketTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function getAllowedTicketTransitions(status: TicketStatus): readonly TicketStatus[] {
  return plannedTicketTransitions[status];
}

export function isTicketTransitionAllowed(from: TicketStatus, to: TicketStatus): boolean {
  return (plannedTicketTransitions[from] as readonly TicketStatus[]).includes(to);
}

/** Guards the allowlisted lifecycle graph before Phase 2 actor and data invariants. */
export function assertTicketTransitionAllowed(from: TicketStatus, to: TicketStatus): void {
  if (!isTicketTransitionAllowed(from, to)) {
    throw new InvalidTicketTransitionError(from, to);
  }
}

export type AccountRole = "Admin" | "Technician" | "Viewer";
export type TicketTransitionInput = {
  from: TicketStatus;
  to: TicketStatus;
  actorRole: AccountRole;
  assigneeAccountId: string | null;
  reason?: string;
  solution?: string;
};

export class TicketInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TicketInvariantError";
  }
}

export function assertTicketTransition(input: TicketTransitionInput): void {
  assertTicketTransitionAllowed(input.from, input.to);
  if (input.actorRole === "Viewer") throw new TicketInvariantError("Viewer cannot transition tickets");
  if (["Assigned", "InProgress", "WaitingUser", "WaitingThirdParty", "Resolved"].includes(input.to) && !input.assigneeAccountId) {
    throw new TicketInvariantError(`${input.to} requires a technician assignment`);
  }
  if (["WaitingUser", "WaitingThirdParty"].includes(input.to) && !input.reason?.trim()) {
    throw new TicketInvariantError("Waiting transitions require a reason");
  }
  if (input.to === "Resolved" && !input.solution?.trim()) {
    throw new TicketInvariantError("Resolution requires a solution");
  }
  if (input.from === "Resolved" && input.to === "InProgress" && !input.reason?.trim()) {
    throw new TicketInvariantError("Reopen requires a reason");
  }
}

export type SlaClock = {
  resolutionDueAt: Date;
  pausedAt: Date | null;
  resolutionStoppedAt: Date | null;
  totalPausedSeconds: number;
  resolutionBreachedAt: Date | null;
};

export function pauseSla(clock: SlaClock, now: Date): SlaClock {
  if (clock.pausedAt || clock.resolutionStoppedAt) return clock;
  return { ...clock, pausedAt: now };
}

export function resumeSla(clock: SlaClock, now: Date): SlaClock {
  if (!clock.pausedAt) return clock;
  const pausedSeconds = Math.max(0, Math.floor((now.getTime() - clock.pausedAt.getTime()) / 1_000));
  return {
    ...clock,
    pausedAt: null,
    totalPausedSeconds: clock.totalPausedSeconds + pausedSeconds,
    resolutionDueAt: new Date(clock.resolutionDueAt.getTime() + pausedSeconds * 1_000),
  };
}

export function markSlaBreach(clock: SlaClock, now: Date): SlaClock {
  if (clock.resolutionBreachedAt || clock.pausedAt || clock.resolutionStoppedAt || now < clock.resolutionDueAt) {
    return clock;
  }
  return { ...clock, resolutionBreachedAt: now };
}

export const securityCaseStatuses = ["New", "Triaged", "Investigating", "Contained", "Resolved", "Closed", "FalsePositive"] as const;
export type SecurityCaseStatus = (typeof securityCaseStatuses)[number];

const securityCaseTransitions = {
  New: ["Triaged", "Investigating", "FalsePositive"],
  Triaged: ["Investigating", "FalsePositive"],
  Investigating: ["Contained", "Resolved", "FalsePositive"],
  Contained: ["Investigating", "Resolved", "FalsePositive"],
  Resolved: ["Investigating", "Closed"],
  FalsePositive: ["Investigating", "Closed"],
  Closed: ["Investigating"],
} as const satisfies Record<SecurityCaseStatus, readonly SecurityCaseStatus[]>;

export class InvalidSecurityCaseTransitionError extends Error {
  constructor(public readonly from: SecurityCaseStatus, public readonly to: SecurityCaseStatus) {
    super(`Security case transition from ${from} to ${to} is not allowed`);
    this.name = "InvalidSecurityCaseTransitionError";
  }
}

export function getAllowedSecurityCaseTransitions(status: SecurityCaseStatus): readonly SecurityCaseStatus[] {
  return securityCaseTransitions[status];
}

export function assertSecurityCaseTransition(from: SecurityCaseStatus, to: SecurityCaseStatus, reason?: string): void {
  if (!(securityCaseTransitions[from] as readonly SecurityCaseStatus[]).includes(to)) {
    throw new InvalidSecurityCaseTransitionError(from, to);
  }
  if ((from === "Resolved" || from === "FalsePositive" || from === "Closed") && to === "Investigating" && !reason?.trim()) {
    throw new TicketInvariantError("Security case reopen requires a reason");
  }
}
