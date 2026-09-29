import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { z } from "zod";
import { env } from "@/server/env";
import { evaluateAnswers } from "@/server/evaluation/run";
import { writeEvaluation } from "@/server/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const answer = z.string().max(2000);
const schema = z.object({
  secret: z.string(),
  items: z
    .array(
      z.object({
        code: z.string().regex(/^RMX-[A-Z0-9]{4}-[A-Z0-9]{4}$/),
        firstName: z.string().max(80).optional(),
        lastName: z.string().max(80).optional(),
        answers: z.object({ q1: answer, q2: answer, q3: answer, q4: answer, q5: answer, q6: answer }),
      }),
    )
    .min(1)
    .max(10),
});

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Lo llama el Apps Script de la hoja ("Reintentar evaluaciones pendientes"). Sólo modo sheets.
 * Responde de inmediato (202) y evalúa en segundo plano; cada resultado se escribe en su fila
 * mediante el mismo Apps Script. Así no depende del tiempo máximo de espera de Google.
 */
export async function POST(req: Request) {
  const e = env();
  if (e.DATA_BACKEND !== "sheets" || !e.SHEETS_WEBHOOK_SECRET) return new NextResponse("No encontrado", { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success || !sameSecret(parsed.data.secret, e.SHEETS_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const items = parsed.data.items;
  after(async () => {
    for (let i = 0; i < items.length; i += 5) {
      await Promise.all(
        items.slice(i, i + 5).map(async (it) => {
          const r = await evaluateAnswers(`EV-${it.code}`, it.answers, { firstName: it.firstName, lastName: it.lastName });
          const res = await writeEvaluation(it.code, r);
          if (!res.ok) console.error("[sheets] no se pudo escribir la evaluación", res.error);
        }),
      );
    }
  });
  return NextResponse.json({ ok: true, queued: items.length }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
