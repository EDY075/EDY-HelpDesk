import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import argon2 from "argon2";
import type { NextFunction, Request, Response } from "express";

import type { DatabaseClient } from "../../platform/prisma.js";
import { HttpError } from "../../platform/errors.js";

export const SESSION_COOKIE = "edy_session";
export const CSRF_COOKIE = "edy_csrf";

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

function parseCookies(value: string | undefined): Record<string, string> {
  if (!value) return {};
  return Object.fromEntries(value.split(";").map((part) => {
    const [name, ...rest] = part.trim().split("=");
    try { return [name ?? "", decodeURIComponent(rest.join("="))]; }
    catch { return [name ?? "", ""]; }
  }));
}

export function cookieValue(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name];
}

export function tokenMatchesHash(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sessionCookieOptions(production: boolean, maxAge: number) {
  return { httpOnly: true, sameSite: "strict" as const, secure: production, path: "/", maxAge };
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
}

export function createAuthMiddleware(prisma: DatabaseClient, idleMinutes: number) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = cookieValue(req, SESSION_COOKIE);
      if (!raw) return next();
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashToken(raw) },
        include: { account: { include: { user: true } } },
      });
      const now = new Date();
      const idleLimit = new Date(now.getTime() - idleMinutes * 60_000);
      if (!session || session.revokedAt || session.expiresAt <= now || session.lastSeenAt < idleLimit || session.account.archivedAt || session.account.user?.archivedAt) {
        return next();
      }
      req.auth = {
        accountId: session.account.id,
        username: session.account.username,
        role: session.account.role,
        displayName: session.account.user?.displayName ?? null,
        sessionId: session.id,
      };
      await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(new HttpError(401, "Unauthorized", "Authentication is required."));
  next();
}

export function enforceOrigin(webOrigin: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.get("origin") !== webOrigin) return next(new HttpError(403, "Forbidden", "Request origin is not allowed."));
    next();
  };
}

export function enforceCsrf(prisma: DatabaseClient) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.path === "/api/v1/auth/login") return next();
      if (!req.auth) return next();
      const csrfHeader = req.get("x-csrf-token");
      const csrfCookie = cookieValue(req, CSRF_COOKIE);
      if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
        return next(new HttpError(403, "Forbidden", "CSRF validation failed."));
      }
      const session = await prisma.session.findUnique({ where: { id: req.auth.sessionId }, select: { csrfTokenHash: true } });
      if (!session || !tokenMatchesHash(csrfHeader, session.csrfTokenHash)) {
        return next(new HttpError(403, "Forbidden", "CSRF validation failed."));
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function issueSessionTokens(): { token: string; tokenHash: string; csrf: string; csrfTokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  const csrf = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashToken(token), csrf, csrfTokenHash: hashToken(csrf) };
}

export { argon2 };
