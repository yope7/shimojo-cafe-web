import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

const TOKEN_BYTES = 32;
const sessions = new Map<string, number>(); // token -> expiry ms
const TTL_MS = 12 * 60 * 60 * 1000; // 12h

function prune() {
  const now = Date.now();
  for (const [t, exp] of sessions) {
    if (exp <= now) sessions.delete(t);
  }
}

export function createSession(): string {
  prune();
  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  sessions.set(token, Date.now() + TTL_MS);
  return token;
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  prune();
  const exp = sessions.get(token);
  return !!exp && exp > Date.now();
}

const COOKIE = "shimojo_admin";

export function adminLoginHandler(getPassword: () => string | undefined) {
  return (req: Request, res: Response) => {
    const pw = (req.body as { password?: string })?.password;
    const expected = getPassword();
    if (!expected || pw !== expected) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    const token = createSession();
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: TTL_MS,
      path: "/",
    });
    res.json({ ok: true });
  };
}

export function adminLogout(_req: Request, res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE] as string | undefined;
  if (!isValidSession(token)) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }
  next();
}
