"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, currentUser, verifyCredentials } from "@/server/auth";
import { rateLimit } from "@/server/rate-limit";
import { clientIp } from "@/server/request";
import { audit } from "@/server/audit";

export type LoginState = { error?: string };

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

function safeNext(next: string | undefined): string {
  // Sólo rutas internas del panel: evita redirecciones abiertas.
  return next && /^\/admin(\/[\w\-/]*)?(\?[\w=&%\-.]*)?$/.test(next) && !next.startsWith("//") ? next : "/admin";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: "Correo o contraseña incorrectos." };

  const ip = clientIp(await headers());
  const byIp = await rateLimit("login:ip", ip, ip === "unknown" ? 200 : 20, 900);
  const byEmail = await rateLimit("login:email", parsed.data.email, 10, 900);
  if (!byIp.allowed || !byEmail.allowed) {
    return { error: "Demasiados intentos. Espera 15 minutos antes de volver a intentar." };
  }

  const result = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    await audit("LOGIN_FAILED", { meta: { reason: result.reason } });
    return {
      error:
        result.reason === "locked"
          ? "La cuenta está bloqueada temporalmente por intentos fallidos. Intenta más tarde."
          : "Correo o contraseña incorrectos.",
    };
  }
  await createSession(result.user.id);
  await audit("LOGIN", { actorId: result.user.id });
  redirect(safeNext(parsed.data.next));
}

export async function logoutAction() {
  const user = await currentUser();
  await destroySession();
  if (user) await audit("LOGOUT", { actorId: user.id });
  redirect("/admin/login");
}
