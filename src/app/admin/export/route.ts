import { agencyName } from "@/config/agencies";
import { statusLabel } from "@/config/statuses";
import { toCsv } from "@/lib/csv";
import { AuthError, assertPermission } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { buildOrder, buildWhere, parseFilters } from "@/server/admin-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

/** Exportación CSV (sólo ADMIN) con columnas mínimas; cada exportación queda auditada. */
export async function GET(req: Request) {
  let userId: string;
  try {
    userId = (await assertPermission("export:csv")).id;
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    return new Response(status === 401 ? "No autenticado" : "Sin permiso", { status });
  }

  const url = new URL(req.url);
  const filters = parseFilters(Object.fromEntries(url.searchParams));
  const rows = await prisma.application.findMany({
    where: buildWhere(filters),
    orderBy: buildOrder(filters),
    take: MAX_ROWS,
    select: {
      code: true,
      createdAt: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      agencyFirst: true,
      agencySecond: true,
      anyAgency: true,
      status: true,
      scoreTotal: true,
      humanRating: true,
    },
  });

  const { page: _page, ...auditFilters } = filters;
  void _page;
  await audit("EXPORT_CSV", { actorId: userId, meta: { filters: auditFilters, rows: rows.length } });

  const csv = toCsv(
    ["Código", "Fecha", "Nombre", "Apellido", "Celular", "Correo", "Agencia 1", "Agencia 2", "Cualquier agencia", "Estado", "Puntaje orientativo", "Calificación humana"],
    rows.map((r) => [
      r.code,
      r.createdAt.toISOString(),
      r.firstName,
      r.lastName,
      r.phone,
      r.email ?? "",
      r.agencyFirst ? agencyName(r.agencyFirst) : "",
      r.agencySecond ? agencyName(r.agencySecond) : "",
      r.anyAgency ? "Sí" : "No",
      statusLabel(r.status),
      r.scoreTotal != null ? String(r.scoreTotal) : "",
      r.humanRating ? String(r.humanRating) : "",
    ]),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="postulaciones-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
