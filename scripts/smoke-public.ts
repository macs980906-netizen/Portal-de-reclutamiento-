/**
 * Verifica que expedientes, puntajes y CV no sean accesibles sin sesión.
 *   npm run smoke -- http://localhost:3000
 */
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

type Check = { name: string; path: string; method?: string; expect: (r: Response, body: string) => boolean };

const checks: Check[] = [
  { name: "Landing pública", path: "/", expect: (r) => r.status === 200 },
  { name: "La API no lista postulaciones", path: "/api/applications", expect: (r) => r.status === 405 },
  { name: "POST sin Origin rechazado", path: "/api/applications", method: "POST", expect: (r) => r.status === 403 },
  { name: "Panel → login", path: "/admin", expect: (r) => r.status === 307 && (r.headers.get("location") ?? "").includes("/admin/login") },
  { name: "Convocatoria → login", path: "/admin/convocatorias/cxxxxxxxxxxxxxxxxxxxxxxxx", expect: (r) => r.status === 307 },
  { name: "Expediente → login", path: "/admin/postulaciones/cxxxxxxxxxxxxxxxxxxxxxxxx", expect: (r) => r.status === 307 },
  { name: "CV sin sesión", path: "/admin/cv/cxxxxxxxxxxxxxxxxxxxxxxxx", expect: (r) => r.status === 401 },
  { name: "Exportación sin sesión", path: "/admin/export", expect: (r) => r.status === 401 },
  { name: "Almacenamiento no expuesto", path: "/storage/private/cv", expect: (r) => r.status === 404 },
  { name: "Cookie falsa no da acceso", path: "/admin/convocatorias", expect: (r, body) => !body.includes("Ranking") },
];

async function main() {
  let failed = 0;
  for (const c of checks) {
    const headers: Record<string, string> = c.name.startsWith("Cookie") ? { cookie: "rmx_session=falsa" } : {};
    const r = await fetch(base + c.path, { method: c.method ?? "GET", redirect: "manual", headers });
    const body = await r.text();
    const ok = c.expect(r, body) && !/scoreTotal|challengeAnswers|"phone"/.test(body);
    console.log(`${ok ? "✔" : "✖"} ${c.name} (${r.status})`);
    if (!ok) failed++;
  }
  process.exit(failed ? 1 : 0);
}

main();
