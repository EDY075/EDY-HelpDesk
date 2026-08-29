import { Router } from "express";
import { z } from "zod";

import type { AppConfig } from "@edy/config";
import type { AppendOnlyAuditRepository } from "../audit/audit-repository.js";
import type { DatabaseClient } from "../../platform/prisma.js";
import { HttpError } from "../../platform/errors.js";
import { argon2, cookieValue, CSRF_COOKIE, issueSessionTokens, SESSION_COOKIE, sessionCookieOptions, tokenMatchesHash } from "./auth.js";

const loginSchema = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(512) }).strict();
const failures = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 5 * 60_000;
const MAX_FAILURES = 5;
const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$oYbyDbdo8/Ts67+101Vt6w$wi5J16q585SVDxjgSdwm3ZdQoFAfaoME778iUuQZm9c";

export function createAuthRouter(prisma: DatabaseClient, audit: AppendOnlyAuditRepository, config: AppConfig): Router {
  const router = Router();
  const cookieOptions = sessionCookieOptions(config.NODE_ENV === "production", config.SESSION_ABSOLUTE_HOURS * 3_600_000);

  router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Bad Request", "Username and password are required.");
    const username = parsed.data.username.normalize("NFKC").toLowerCase();
    const key = `${req.ip ?? "unknown"}:${username}`;
    const nowMs = Date.now();
    const current = failures.get(key);
    if (current && current.resetAt > nowMs && current.count >= MAX_FAILURES) {
      await audit.append({ actorType: "anonymous", action: "authentication.rate_limited", resourceType: "session", outcome: "denied", requestId: req.requestId, correlationId: req.correlationId });
      res.setHeader("retry-after", String(Math.max(1, Math.ceil((current.resetAt - nowMs) / 1_000))));
      throw new HttpError(429, "Too Many Requests", "Unable to sign in. Try again later.");
    }
    if (current && current.resetAt <= nowMs) failures.delete(key);

    const account = await prisma.account.findUnique({ where: { username }, include: { user: true } });
    const hashToVerify = account?.credentialHash ?? DUMMY_HASH;
    const passwordMatches = await argon2.verify(hashToVerify, parsed.data.password);
    const valid = Boolean(passwordMatches && account?.credentialHash && !account.archivedAt && !account.user?.archivedAt);
    if (!valid || !account) {
      const existing = failures.get(key);
      failures.set(key, { count: (existing?.count ?? 0) + 1, resetAt: existing?.resetAt ?? nowMs + WINDOW_MS });
      await audit.append({ actorType: "anonymous", action: "authentication.login_failed", resourceType: "session", outcome: "failure", reason: "Invalid credentials", requestId: req.requestId, correlationId: req.correlationId });
      throw new HttpError(401, "Unauthorized", "Invalid username or password.");
    }

    failures.delete(key);
    const issued = issueSessionTokens();
    const expiresAt = new Date(nowMs + config.SESSION_ABSOLUTE_HOURS * 3_600_000);
    await prisma.$transaction(async (tx) => {
      if (req.auth) await tx.session.updateMany({ where: { id: req.auth.sessionId, revokedAt: null }, data: { revokedAt: new Date(nowMs) } });
      await tx.session.create({ data: { tokenHash: issued.tokenHash, csrfTokenHash: issued.csrfTokenHash, accountId: account.id, expiresAt } });
      await tx.auditEvent.create({ data: { actorId: account.id, actorType: "account", actorRoleSnapshot: account.role, action: "authentication.login", resourceType: "session", outcome: "success", requestId: req.requestId, correlationId: req.correlationId } });
    });
    res.cookie(SESSION_COOKIE, issued.token, cookieOptions);
    res.cookie(CSRF_COOKIE, issued.csrf, { ...cookieOptions, httpOnly: false });
    res.status(200).json({ account: { id: account.id, username: account.username, role: account.role, displayName: account.user?.displayName ?? null }, csrfToken: issued.csrf, expiresAt });
  });

  router.post("/logout", async (req, res) => {
    if (req.auth) {
      await prisma.$transaction(async (tx) => {
        await tx.session.updateMany({ where: { id: req.auth!.sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.auditEvent.create({ data: { actorId: req.auth!.accountId, actorType: "account", actorRoleSnapshot: req.auth!.role, action: "authentication.logout", resourceType: "session", resourceId: req.auth!.sessionId, outcome: "success", requestId: req.requestId, correlationId: req.correlationId } });
      });
    }
    const clearOptions = { sameSite: cookieOptions.sameSite, secure: cookieOptions.secure, path: cookieOptions.path };
    res.clearCookie(SESSION_COOKIE, { ...clearOptions, httpOnly: true });
    res.clearCookie(CSRF_COOKIE, { ...clearOptions, httpOnly: false });
    res.status(204).send();
  });

  router.get("/me", async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Unauthorized", "Authentication is required.");
    const csrfToken = cookieValue(req, CSRF_COOKIE);
    if (!csrfToken) throw new HttpError(401, "Unauthorized", "Authentication is required.");
    const session = await prisma.session.findUnique({ where: { id: req.auth.sessionId }, select: { csrfTokenHash: true } });
    if (!session || !tokenMatchesHash(csrfToken, session.csrfTokenHash)) {
      throw new HttpError(401, "Unauthorized", "Authentication is required.");
    }
    res.status(200).json({ account: { id: req.auth.accountId, username: req.auth.username, role: req.auth.role, displayName: req.auth.displayName }, csrfToken });
  });

  return router;
}

export function resetLoginRateLimitsForTests(): void { failures.clear(); }
