import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { clientIp, isSameOrigin } from "@/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cuenta inicios del formulario por día (sin datos personales) para medir el embudo. */
export async function POST(req: Request) {
  if (!isSameOrigin(req.headers)) return new NextResponse(null, { status: 403 });
  const ip = clientIp(req.headers);
  const { allowed } = await rateLimit("funnel:day", ip, ip === "unknown" ? 5000 : 10, 86_400);
  if (allowed) {
    const day = new Date().toISOString().slice(0, 10);
    await prisma.funnelDaily.upsert({
      where: { day },
      create: { day, started: 1 },
      update: { started: { increment: 1 } },
    });
  }
  return new NextResponse(null, { status: 204 });
}
