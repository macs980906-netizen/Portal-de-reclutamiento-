import { AuthError, assertPermission } from "@/server/auth";
import { prisma } from "@/server/db";
import { storage } from "@/server/storage";
import { logEvent } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Descarga de CV: sólo usuarios autenticados con permiso. El archivo se entrega como
 * adjunto (nunca en línea), con tipo verificado al subirlo y sin caché.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = (await assertPermission("cv:download")).id;
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    return new Response(status === 401 ? "No autenticado" : "Sin permiso", { status });
  }

  const { id } = await params;
  const cv = await prisma.cvFile.findUnique({
    where: { applicationId: id },
    include: { application: { select: { code: true } } },
  });
  if (!cv) return new Response("No encontrado", { status: 404 });

  const bytes = await storage().get(cv.storageKey);
  await logEvent(id, userId, "CV_DOWNLOAD");

  const ext = cv.storageKey.split(".").pop();
  const filename = `CV-${cv.application.code}.${ext}`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": cv.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
