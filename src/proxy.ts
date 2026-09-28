import { NextResponse, type NextRequest } from "next/server";

/**
 * Primera barrera del panel: sin cookie de sesión, /admin redirige al login.
 * La validación real de la sesión y los permisos ocurre en el servidor en cada página,
 * acción y ruta (`requireUser` / `assertPermission`).
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isLogin = pathname === "/admin/login";
  const hasSession = Boolean(req.cookies.get("rmx_session")?.value);

  if (!isLogin && !hasSession) {
    if (pathname.startsWith("/admin/cv/") || pathname.startsWith("/admin/export")) {
      return new NextResponse("No autenticado", { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export const config = {
  matcher: ["/admin/:path*"],
};
