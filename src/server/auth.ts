import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { isProduction } from "./env";
import { can, type Permission, type Role } from "@/lib/permissions";

export const SESSION_COOKIE = "rmx_session";
const SESSION_HOURS = 10;
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export type SessionUser = { id: string; email: string; name: string; role: Role };

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Hash ficticio para igualar tiempos cuando el usuario no existe.
const DUMMY_HASH = "$2b$12$5RkPKtiSaqZoYZakuTaRGuaQep6EDRZUuRPs8T.rH56VgjiqymFtW";

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; reason: "invalid" | "locked" };

export async function verifyCredentials(emailRaw: string, password: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    await bcrypt.compare(password, DUMMY_HASH);
    return { ok: false, reason: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, reason: "locked" };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    return { ok: false, reason: failed >= MAX_FAILED ? "locked" : "invalid" };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  return { ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await prisma.session.create({ data: { id: sha256(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Usuario de la sesión actual o `null`. Valida el token contra la BD en cada petición. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const session = await prisma.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  const { user } = session;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Para páginas: redirige al login si no hay sesión o si falta el permiso. */
export async function requireUser(permission: Permission = "applications:view"): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  if (!can(user.role, permission)) redirect("/admin?error=permiso");
  return user;
}

/** Para acciones y rutas: lanza error en lugar de redirigir. */
export async function assertPermission(permission: Permission): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new AuthError(401);
  if (!can(user.role, permission)) throw new AuthError(403);
  return user;
}

export class AuthError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? "No autenticado" : "Sin permiso");
  }
}
