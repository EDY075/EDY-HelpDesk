import type { NextFunction, Request, Response } from "express";
import type { AccountRole } from "@edy/domain";

import type { AppendOnlyAuditRepository } from "../audit/audit-repository.js";
import { HttpError } from "../../platform/errors.js";

export type Permission =
  | "tickets.read" | "tickets.create" | "tickets.update" | "tickets.assign" | "tickets.transition"
  | "comments.public" | "comments.internal" | "directory.read" | "directory.manage" | "audit.read"
  | 'assets.read' | 'assets.manage' | 'assets.archive' | 'knowledge.read' | 'knowledge.draft' | 'knowledge.publish' | 'knowledge.link' | 'diagnostics.read' | 'diagnostics.execute' | 'diagnostics.configure'
  | 'security.read' | 'security.manage'
  | 'dashboard.read' | 'reports.read' | 'reports.create'
  | 'integrations.read' | 'integrations.manage' | 'settings.read';

const permissions: Record<AccountRole, readonly Permission[]> = {
  Admin: ["tickets.read", "tickets.create", "tickets.update", "tickets.assign", "tickets.transition", "comments.public", "comments.internal", "directory.read", "directory.manage", "audit.read", 'assets.read','assets.manage','assets.archive','knowledge.read','knowledge.draft','knowledge.publish','knowledge.link'],
  Technician: ["tickets.read", "tickets.create", "tickets.update", "tickets.assign", "tickets.transition", "comments.public", "comments.internal", "directory.read", 'assets.read','assets.manage','knowledge.read','knowledge.draft','knowledge.link'],
  Viewer: ["tickets.read", "directory.read", 'assets.read','knowledge.read'],
};

export function can(role: AccountRole, permission: Permission): boolean {
  if(permission==='diagnostics.read')return ['Admin','Technician','Viewer'].includes(role);
  if(permission==='diagnostics.execute')return role==='Admin'||role==='Technician';
  if(permission==='diagnostics.configure')return role==='Admin';
  if(permission==='security.read')return ['Admin','Technician','Viewer'].includes(role);
  if(permission==='security.manage')return role==='Admin'||role==='Technician';
  if(permission==='dashboard.read'||permission==='reports.read'||permission==='reports.create')return true;
  if(permission==='integrations.read'||permission==='settings.read')return true;
  if(permission==='integrations.manage')return role==='Admin';
  return permissions[role].includes(permission);
}

export function authorize(permission: Permission, audit: AppendOnlyAuditRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) return next(new HttpError(401, "Unauthorized", "Authentication is required."));
    if (can(req.auth.role, permission)) return next();
    await audit.append({
      actorId: req.auth.accountId,
      actorType: "account",
      actorRoleSnapshot: req.auth.role,
      action: permission.startsWith('diagnostics.') ? 'diagnostic.denied' : permission.startsWith('security.') ? 'security.authorization_denied' : "authorization.denied",
      resourceType: "api",
      resourceId: req.originalUrl,
      outcome: "denied",
      reason: `Missing permission: ${permission}`,
      requestId: req.requestId,
      correlationId: req.correlationId,
    });
    next(new HttpError(403, "Forbidden", "You do not have permission to perform this action."));
  };
}
