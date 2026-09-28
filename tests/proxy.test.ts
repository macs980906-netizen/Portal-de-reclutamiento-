import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("protección del panel", () => {
  it("el enlace del aviso de shortlist exige iniciar sesión", () => {
    const res = proxy(new NextRequest("https://portal.example.com/admin/convocatorias/cabc123"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://portal.example.com/admin/login?next=%2Fadmin%2Fconvocatorias%2Fcabc123");
  });

  it("CV y exportación responden 401 sin sesión", () => {
    expect(proxy(new NextRequest("https://portal.example.com/admin/cv/cabc123")).status).toBe(401);
    expect(proxy(new NextRequest("https://portal.example.com/admin/export")).status).toBe(401);
  });
});
