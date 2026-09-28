import { NextResponse, after } from "next/server";
import { applicationSchema, fieldErrors } from "@/lib/validation";
import { createApplication, type CvUpload } from "@/server/applications";
import { checkCv, safeDisplayName } from "@/server/file-validation";
import { env } from "@/server/env";
import { rateLimit } from "@/server/rate-limit";
import { clientIp, isSameOrigin } from "@/server/request";
import { notifyNewApplication } from "@/server/notifications/service";
import { getLaunchBlockers } from "@/config/launch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_FILL_SECONDS = 20;

const fail = (status: number, message: string, errors?: Record<string, string>) =>
  NextResponse.json({ ok: false, message, errors }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!isSameOrigin(req.headers)) return fail(403, "Solicitud no permitida.");

  const e = env();
  // Salvaguarda en tiempo de ejecución: producción no recibe datos sin aviso legal aprobado.
  if (e.APP_ENV === "production" && getLaunchBlockers().length) {
    return fail(503, "El registro aún no está disponible. Intenta más tarde.");
  }

  const maxBytes = e.CV_MAX_MB * 1024 * 1024;
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes + 256 * 1024) return fail(413, `El CV supera el máximo de ${e.CV_MAX_MB} MB.`);

  const ip = clientIp(req.headers);
  // Sin IP confiable (TRUST_PROXY_HEADERS=false) el límite es global y más holgado,
  // para no bloquear a todas las personas por igual.
  const known = ip !== "unknown";
  const burst = await rateLimit("apply:10m", ip, known ? 5 : 200, 600);
  const daily = await rateLimit("apply:day", ip, known ? 20 : 2000, 86_400);
  if (!burst.allowed || !daily.allowed) {
    return fail(429, "Recibimos demasiados intentos desde esta conexión. Espera unos minutos e inténtalo de nuevo.");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "No pudimos leer tu solicitud. Intenta de nuevo.");
  }

  // Antiabuso sin CAPTCHA: campo trampa invisible y tiempo mínimo de llenado.
  const honeypot = form.get("website");
  const startedAt = Number(form.get("startedAt"));
  if ((typeof honeypot === "string" && honeypot.trim() !== "") ||
      (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < MIN_FILL_SECONDS * 1000)) {
    return fail(400, "No pudimos procesar tu postulación. Revisa tus datos e inténtalo de nuevo.");
  }

  let payload: unknown;
  try {
    const raw = form.get("payload");
    if (typeof raw !== "string" || raw.length > 60_000) throw new Error();
    payload = JSON.parse(raw);
  } catch {
    return fail(400, "No pudimos leer tu postulación. Intenta de nuevo.");
  }

  const parsed = applicationSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(422, "Revisa los campos marcados.", fieldErrors(parsed.error));
  }

  let cv: CvUpload | null = null;
  const file = form.get("cv");
  if (file instanceof File && file.size > 0) {
    if (file.size > maxBytes) return fail(413, `El CV supera el máximo de ${e.CV_MAX_MB} MB.`, { cv: `Máximo ${e.CV_MAX_MB} MB.` });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkCv(file.name, bytes, maxBytes);
    if (!check.ok) return fail(422, check.error, { cv: check.error });
    cv = { bytes, kind: check.kind, displayName: safeDisplayName(file.name) };
  }

  try {
    const result = await createApplication(parsed.data, cv);
    if (result.notify) after(() => notifyNewApplication(result.id));
    return NextResponse.json({ ok: true, code: result.code }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // No se registran datos de la postulación: sólo el tipo de error.
    console.error("[postulación] error al guardar", err instanceof Error ? err.name : "desconocido");
    return fail(500, "Tuvimos un problema al guardar tu postulación. Tus respuestas siguen en este dispositivo; intenta de nuevo en unos minutos.");
  }
}
