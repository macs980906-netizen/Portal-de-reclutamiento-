# Portal de reclutamiento RiderMex · Asesores comerciales

Landing y formulario por pasos para postularse como asesor/a comercial en las agencias RiderMex, con un
**Desafío de ventas** de 6 situaciones abiertas evaluado contra una rúbrica versionada (con apoyo de IA
configurable y revisión humana), **convocatorias** con ranking provisional y **shortlist** de hasta 5
perfiles recomendados al cerrar, carga privada de CV, panel privado y avisos al equipo (WhatsApp / correo).

> La herramienta **recomienda a quién revisar para entrevista**; no identifica objetivamente “a los
> mejores vendedores” ni es una prueba validada científicamente. Contactar, entrevistar o contratar es
> siempre decisión del equipo.

> ⚠️ **No está listo para producción.** Faltan datos legales y comerciales que sólo RiderMex puede
> aprobar (ver [Bloqueadores de lanzamiento](#bloqueadores-de-lanzamiento)). El build de producción se
> bloquea automáticamente mientras falten.

---

## Stack y decisiones

| Área | Elección | Por qué |
| --- | --- | --- |
| App | **Next.js 16** (App Router) + React 19 + TypeScript | Un solo despliegue para landing, API y panel; SSR rápido en móviles. |
| Estilos | Tailwind CSS 4 + tokens propios (`src/app/globals.css`) | Sistema visual tomado de los artes de campaña (`docs/brand/`). |
| Tipografía | Anton (titulares) + Barlow (texto), autoalojadas con `@fontsource` | Sin llamadas a Google Fonts ni terceros. |
| Datos | **PostgreSQL** + Prisma 6 (migraciones en `prisma/migrations`) | Esquema reproducible, búsquedas y filtros eficientes. |
| Auth del panel | Sesiones propias en BD (token aleatorio, cookie HttpOnly, hash SHA-256), bcrypt, bloqueo por intentos | Sin dependencia externa; roles ADMIN / REVIEWER. |
| CV | Almacenamiento privado `local` (fuera de `public/`) o `s3` (bucket privado) | Nunca hay URL pública; descarga sólo vía `/admin/cv/[id]` autenticado. |
| Evaluación | Rúbrica versionada (`src/server/evaluation/`) + Claude (SDK oficial `@anthropic-ai/sdk`, salida estructurada validada) | Evidencia y justificación por dimensión; sin puntajes inventados si falla. |
| Convocatorias | `RecruitmentCycle` + shortlist como función pura | Ranking provisional, cierre auditable, instantánea inmutable. |
| Notificaciones | Servicio desacoplado: WhatsApp Cloud API / Twilio, correo SMTP de respaldo, `console` (dev) | Idempotente, con registro de estado y reintentos. |

### Diseño

La interfaz replica el lenguaje de los artes publicitarios (copias de referencia en `docs/brand/`):
fondo negro de sala de exhibición, rojo intenso con brillo, titulares condensados en mayúsculas
(blanco cromado + rojo), líneas diagonales de luz, trama de puntos en esquinas, recuadro de CTA con
borde rojo luminoso e icono de documento, y la leyenda “Registro sujeto a evaluación de perfil”.
Frases de campaña reutilizadas: “No importa de dónde vienes. Importa lo que sabes hacer.” y
“Tu próxima oportunidad puede empezar aquí.”

- `public/brand/ridermex-logo.png` es un **recorte provisional del arte**. Sustitúyelo por el archivo
  oficial (idealmente SVG/PNG transparente) con el mismo nombre.
- `public/brand/showroom.(webp|jpg)` es una franja de motocicletas recortada del arte (sin personas).
- El panel usa un tema claro para lectura prolongada.

## Estructura

```
src/
  app/
    page.tsx                     Landing
    postular/                    Formulario por pasos + confirmación (gracias/)
    privacidad/                  Aviso de privacidad (placeholder hasta aprobarse)
    api/applications/route.ts    Recepción de postulaciones (validación, antiabuso, CV)
    api/funnel/route.ts          Contador anónimo de formularios iniciados
    admin/login/                 Acceso al panel
    admin/(panel)/               Resumen, convocatorias, postulaciones, expediente, notificaciones
    admin/cv/[id]/route.ts       Descarga autenticada de CV
    admin/export/route.ts        Exportación CSV (sólo ADMIN, auditada)
  config/                        ← DATOS EDITABLES DE NEGOCIO Y LEGALES
    agencies.ts  business.ts  legal.ts  statuses.ts  launch.ts
  lib/                           Código compartido (validación, desafío público v2 y v1 histórico, permisos)
  server/                        Sólo servidor (BD, auth, almacenamiento, notificaciones)
    evaluation/                  Rúbricas versionadas, prompt, proveedor IA, validación, shortlist
    cycles.ts                    Convocatorias: ranking, cierre, avisos, versiones
  proxy.ts                       Primera barrera de /admin (la validación real es por página/acción)
prisma/  schema.prisma, migrations/, seed.ts (demo sólo desarrollo)
scripts/ check-launch, create-admin, retention-purge, retry-notifications, process-evaluations,
         eval-rubric (casos dorados con el modelo real), smoke-public
tests/   unitarias (vitest) · tests/integration/ contra PostgreSQL real
```

## Instalación local

Requisitos: Node 20.9+ (probado con 22), PostgreSQL 14+.

```bash
npm install
cp .env.example .env              # ajusta DATABASE_URL y HASH_SECRET
npm run db:migrate                # crea el esquema
npm run db:seed                   # opcional: datos DEMO y cuentas de prueba (nunca en producción)
npm run dev                       # http://localhost:3000
```

Cuentas demo (sólo si corriste el seed): `admin@demo.local` y `revisor@demo.local`, contraseña
`demo-ridermex-2026`.

### Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` / `npm run build` / `npm start` | Desarrollo, build (ejecuta `check:launch` antes) y servidor. |
| `npm run lint` · `npm run typecheck` · `npm test` | ESLint, TypeScript y pruebas. |
| `npm run check:launch` | Lista pendientes de lanzamiento; con `APP_ENV=production` falla si hay bloqueadores. |
| `npm run db:deploy` | Aplica migraciones en producción. |
| `npm run admin:create -- --email x@y --name "Nombre" --role ADMIN` | Crea/actualiza una cuenta (pide la contraseña). |
| `npm run notifications:retry` | Reintenta notificaciones pendientes/fallidas (programable en cron). |
| `npm run evaluations:process` | Evalúa postulaciones pendientes o fallidas (programable en cron cada 5–10 min). |
| `npm run test:integration` | Pruebas de integración contra una BD de pruebas (`TEST_DATABASE_URL`). |
| `npm run eval:rubric` | Casos dorados contra el proveedor de IA real (requiere `ANTHROPIC_API_KEY`). |
| `npm run smoke -- <url>` | Verifica que expedientes, puntajes y CV no sean accesibles sin sesión. |
| `npm run retention:purge [-- --apply]` | Aplica la política de retención (no hace nada mientras el plazo sea `null`). |

## Variables de entorno

Ver `.env.example` (todas documentadas). Resumen:

| Variable | Obligatoria | Notas |
| --- | --- | --- |
| `APP_ENV` | sí | `development`, `staging` o `production` (activa bloqueos). |
| `APP_URL` | sí | En producción debe ser `https://…` (también se usa en el enlace de la notificación). |
| `DATABASE_URL` | sí | PostgreSQL. |
| `HASH_SECRET` | sí | Aleatorio, 32+ caracteres en producción (`openssl rand -base64 48`). |
| `TRUST_PROXY_HEADERS` | recomendado | `true` detrás de un proxy/CDN confiable para limitar por IP. |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`, `S3_*` | según almacenamiento | Ver abajo. |
| `CV_MAX_MB` | no | Tamaño máximo del CV (5 MB por defecto). |
| `NOTIFY_PROVIDER`, `NOTIFY_WHATSAPP_RECIPIENTS` | para notificar | Ver abajo. |
| `WHATSAPP_CLOUD_*`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_SHORTLIST_TEMPLATE_NAME` | si usas Meta | |
| `TWILIO_*`, `TWILIO_SHORTLIST_CONTENT_SID` | si usas Twilio | |
| `NOTIFY_EMAIL_RECIPIENTS`, `SMTP_*` | respaldo opcional | Correo sólo para quien no tenga WhatsApp configurado. |
| `NOTIFY_EACH_APPLICATION` | no | `true` (por defecto): aviso por cada postulación además del de shortlist. |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `AI_MODEL` | para evaluar con IA | `none` por defecto: evaluaciones pendientes / manuales. |

Ninguna variable lleva prefijo `NEXT_PUBLIC_`: nada de esto llega al navegador.

## Crear un administrador

```bash
npm run admin:create -- --email persona@ridermex.mx --name "Nombre Apellido" --role ADMIN
# o sólo revisión:
npm run admin:create -- --email persona@ridermex.mx --name "Nombre" --role REVIEWER
```

Roles:

- **REVIEWER**: ve expedientes, convocatorias y contacto (queda auditado), descarga CV, califica (1–5),
  agrega notas y gestiona evaluaciones (reintentar, enviar a revisión manual, confirmar o calificar con la
  rúbrica).
- **ADMIN**: además abre/cierra convocatorias, ajusta umbral y tamaño de shortlist, cambia estado y
  prioridad (Invitar a entrevista / Revisar manualmente / No continúa en esta ronda…), reenvía avisos,
  exporta CSV, elimina expedientes (ARCO) y reintenta notificaciones.

Abraham y Verónica deben tener **cuentas individuales** (no hay código compartido ni autorregistro). Las
rutas del panel son visibles; su protección depende de sesión y permisos verificados en servidor en cada
página, acción y descarga.

## Almacenamiento de CV

- **local** (por defecto): archivos en `./storage/private/cv/<uuid>.<ext>` con permisos `0600`, fuera de
  `public/` e ignorados por git. En producción requiere disco persistente y respaldado, y declararlo con
  `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true`.
- **s3**: `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION` y credenciales. Compatible con AWS S3,
  Cloudflare R2 o MinIO (`S3_ENDPOINT`). El bucket debe ser **privado** (sin acceso público ni listado).
  El servidor descarga y entrega el archivo tras autenticar; no se generan URLs públicas.

Validaciones: extensión (`pdf`, `doc`, `docx`) **y** firma real de bytes, tamaño máximo, nombre de
almacenamiento aleatorio, descarga siempre como adjunto con `nosniff` y CSP `sandbox`.

## Avisos al equipo (WhatsApp y correo)

Hay dos avisos:

1. **Nueva candidatura** (si `NOTIFY_EACH_APPLICATION=true`): nombre corto, agencia preferida y enlace
   al expediente.
2. **Shortlist lista** (al cerrar una convocatoria, una sola vez por destinatario):
   > Shortlist RiderMex lista: 5 perfiles recomendados para entrevista. Convocatoria: [nombre]. Revisa
   > puntajes, evidencia y datos de contacto en el portal: [enlace privado]

Nunca se envían CV, respuestas, teléfonos ni correos de candidatos: los enlaces llevan al panel y exigen
iniciar sesión.

Configuración (no hay números ni correos en el repositorio):

1. Destinatarios: `NOTIFY_WHATSAPP_RECIPIENTS=Abraham|+52155XXXXXXXX,Verónica|+52155XXXXXXXX`.
2. Proveedor:
   - **WhatsApp Cloud API (Meta)**: `NOTIFY_PROVIDER=whatsapp_cloud`, `WHATSAPP_CLOUD_TOKEN`,
     `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, y dos **plantillas aprobadas** (categoría *Utility*, `es_MX`):
     - `WHATSAPP_TEMPLATE_NAME` (nueva candidatura): `Nueva candidatura: {{1}}. Agencia preferida: {{2}}. Expediente: {{3}}`
     - `WHATSAPP_SHORTLIST_TEMPLATE_NAME`: `Shortlist RiderMex lista: {{1}} para entrevista. Convocatoria: {{2}}. Revisa puntajes, evidencia y datos de contacto en el portal: {{3}}`
   - **Twilio**: `NOTIFY_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
     `TWILIO_WHATSAPP_FROM`, y `TWILIO_CONTENT_SID` / `TWILIO_SHORTLIST_CONTENT_SID` (variables 1–3).
     Sin plantilla se envía texto libre (sólo sandbox o ventana de 24 h).
3. Respaldo opcional por correo: `NOTIFY_EMAIL_RECIPIENTS=Abraham|correo,Verónica|correo` + `SMTP_*`.
   Sólo se usa para quien no tenga WhatsApp configurado.
4. Tras configurar: **Panel → Notificaciones → Reintentar** (o `npm run notifications:retry`) convierte
   los avisos “Pendiente de configuración” en envíos reales.

Garantías: cada aviso tiene una clave única por convocatoria/versión/destinatario y se “reclama” antes de
enviar, así que reintentar el cierre no duplica mensajes. “Reenviar aviso” usa un contador con control de
concurrencia (un doble clic no genera dos reenvíos) y queda auditado. Se registran proveedor,
destinatario enmascarado, fecha, estado y error, nunca tokens. `NOTIFY_PROVIDER=console` (desarrollo) sólo
escribe en consola y se muestra como “Sólo registrada en consola (desarrollo, no enviada)”, nunca como
enviada. El panel muestra si cada canal está configurado y la fecha del último envío.

## Desafío de ventas y evaluación

**Desafío v2** (`src/lib/challenge.ts`, versión `desafio-2026-10-v2`): 6 situaciones abiertas, una por
pantalla, sin cronómetro, ~5–7 minutos. No es una prueba psicológica ni requiere saber de mecánica o del
catálogo. La pregunta 6 acepta experiencia informal o un plan hipotético. Los expedientes del desafío v1
(opción múltiple) se conservan con su puntaje histórico y se muestran como tales.

**Rúbrica v1** (`src/server/evaluation/rubrics/v1.ts`, `rubrica-2026-10-v1`), escala 0–4 por dimensión
convertida a su peso (total 100):

| Dimensión | Peso | Preguntas |
| --- | --- | --- |
| Descubrimiento de necesidades | 20 | Q1, Q5 |
| Manejo de objeciones y resolución | 20 | Q3 |
| Comunicación y orientación al cliente | 15 | Q5, Q1, Q4 |
| Honestidad, criterio y aprendizaje del producto | 15 | Q2, Q3 |
| Seguimiento e iniciativa comercial | 15 | Q4 |
| Calidad de la evidencia conductual aportada | 15 | Q6 |

Anclas: 0 sin respuesta evaluable o contradicción clara · 1 poco desarrollo, presión, engaño o invención ·
2 razonable pero incompleta · 3 sólida y aplicable · 4 especialmente sólida (criterio, empatía, iniciativa y
seguimiento con honestidad y respeto). Puntos = calificación/4 × peso (`toPoints`, función pura).

No suman puntos: experiencia en motos o agencias, marcas, años de experiencia, CV (opcional; su ausencia
no resta), zona, escolaridad. No hay trivia de producto en esta versión.

### Cómo se evalúa (`src/server/evaluation/service.ts`)

1. Al recibir la postulación se crea una evaluación **Pendiente** con la rúbrica de su convocatoria.
2. En segundo plano se redactan las respuestas (se quitan nombre, correo, teléfono, enlaces y usuarios) y
   se envían **sólo las 6 respuestas** con un identificador interno al proveedor. Nunca nombre, teléfono,
   correo, zona ni CV. No se consulta internet ni redes sociales sobre la persona.
3. El prompt trata las respuestas como datos no confiables (delimitadas; `<`/`>` neutralizados); pide no
   premiar longitud, gramática, palabras clave ni estilo, respetar variantes del español, distinguir
   falta de conocimiento técnico de falta de criterio y no inferir rasgos personales.
4. La salida estructurada (por dimensión: `score` 0–4, `evidence`, `rationale`, `confidence`,
   `needs_human_review`, `review_reason`) se valida contra el esquema; además se verifica que la
   evidencia citada **exista textualmente** en las respuestas. Si no cumple, no se guarda.
5. Pasa a **Revisión manual** (fuera del ranking automático) si hay confianza baja, evidencia no
   verificable, respuestas vacías, instrucciones incrustadas o el evaluador lo pide. Una persona puede
   confirmar el resultado o calificar manualmente con la rúbrica (se conserva el resultado previo de la IA).
6. Sin clave o con fallo del proveedor: queda **Pendiente** o **Falló** con el motivo visible, reintentable;
   nunca se fabrica un puntaje. Se registran proveedor, modelo, rúbrica, fecha, intentos, error y un hash de
   la entrada (sin secretos ni respuestas en logs).

**Proveedor**: `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` (modelo por defecto `claude-opus-5`,
configurable con `AI_MODEL`). Se usan salidas estructuradas y los *fallbacks* del servidor de Anthropic
(`fallbacks: "default"`): si el modelo declina una petición, se reintenta en otro modelo y se guarda cuál
respondió; si todos declinan, la evaluación pasa a revisión manual.

**Versionado**: cada convocatoria congela su rúbrica; cada evaluación guarda rúbrica, versión de preguntas
y pesos. Para cambiarla, crea `rubrics/v2.ts`, regístrala y cambia `CURRENT_RUBRIC_VERSION`: sólo las
convocatorias nuevas la usan y nada se recalcula retroactivamente.

## Convocatorias y shortlist (`src/server/cycles.ts`)

- **Panel → Convocatorias**: nombre interno, inicio, fecha límite opcional, recomendaciones objetivo (5) y
  umbral (70, **parámetro inicial por validar**, no un estándar). Una convocatoria activa a la vez.
- Abierta: cada postulación se evalúa automáticamente y se ve un **ranking provisional** con el aviso
  persistente “Ranking provisional — la convocatoria sigue abierta”. No se envía aviso final.
- **Cerrar y calcular shortlist** (ADMIN): reintenta pendientes; si alguna sigue pendiente o fallida el
  cierre **se detiene** y lista esas candidaturas con “Reintentar” y “Enviar a revisión manual” (nunca se
  cuentan como 0 ni se excluyen en silencio). Luego calcula la shortlist, guarda una instantánea inmutable
  con la rúbrica usada, cambia a “Cerrada” (un solo cierre aunque dos personas pulsen a la vez), envía un
  aviso por destinatario y registra en auditoría quién cerró, cuándo, versión y estado de los avisos.
- Reglas (`src/server/evaluation/shortlist.ts`): sólo candidaturas completas y elegibles (6 respuestas
  contestadas y aviso aceptado); las de revisión manual se muestran aparte; se recomiendan hasta N que
  alcancen el umbral; si sólo 3 lo alcanzan se recomiendan 3; **empate en el último lugar** → se incluyen
  todas las empatadas y se avisa para que el equipo decida. No hay desempate por orden de llegada, nombre ni
  datos personales.
- Postulaciones que llegan con la convocatoria cerrada (o pasada la fecha límite) quedan marcadas como
  **posteriores al cierre**; el admin puede **abrir una nueva versión** que las recibe.
- Acciones por candidatura: Invitar a entrevista · Revisar manualmente · No continúa en esta ronda · nota
  interna (con registro de quién cambió qué). “Marcar resto como no continúa” sólo con confirmación
  explícita; nunca se rechaza, borra ni notifica automáticamente a candidatos.

## Privacidad y seguridad (resumen)

- Minimización: no se piden edad, género, estado civil, foto, domicilio exacto, salud ni antecedentes.
- Al proveedor de IA sólo van las respuestas del desafío redactadas; se registra en cada expediente si la
  persona fue informada de la evaluación asistida (`aiEvaluationNotice`) y la versión del aviso aceptado.
- La autorización se verifica en servidor en cada página, acción de servidor y ruta de descarga (no sólo
  en la interfaz). La base de datos no está expuesta: se recomienda un usuario de PostgreSQL propio de la
  app sin privilegios de superusuario y sin acceso de red público. No hay RLS de PostgreSQL.
- Validación cliente + servidor con esquemas estrictos (sin asignación masiva). Prisma evita inyección SQL;
  React escapa la salida (sin `dangerouslySetInnerHTML`).
- CSRF: verificación de `Origin` en la API; las Server Actions del panel validan origen; cookie `SameSite`.
- Antiabuso sin CAPTCHA: campo trampa invisible, tiempo mínimo de llenado y límites por IP (hash).
- CSP estricta sin scripts de terceros ni píxeles; cabeceras `X-Frame-Options`, `nosniff`, HSTS en prod.
- No se registran respuestas ni CV en logs. Las IP y contactos para duplicados se guardan como HMAC.
- Consentimiento registrado: versión del aviso, fecha y autorización (opcional y separada) para futuras
  vacantes.
- UTM/referrer se guardan en una tabla separada; el referrer se guarda sin query string. Nada se envía a
  Meta/Google.
- Auditoría: inicios de sesión, vistas de expediente, exportaciones, borrados. Registro de cambios por
  expediente (estado, prioridad, calificación, descargas de CV).
- ARCO: búsqueda por nombre, correo, teléfono o código `RMX-…`; borrado definitivo con confirmación
  (datos, respuestas y CV), auditado sin datos personales.

Esta plataforma implementa principios de finalidad, proporcionalidad, seguridad y aviso de privacidad
conforme a la LFPDPPP, pero **no constituye asesoría legal**.

## Configuración de negocio y legal (`src/config/`)

| Archivo | Qué contiene | Estado actual |
| --- | --- | --- |
| `agencies.ts` | 4 agencias seleccionables, horarios de **atención al público**; la 5ª “en preparación” no es seleccionable | `AGENCIES_CONFIRMED = false` |
| `business.ts` | Horario del puesto, sueldo, comisiones, prestaciones, contratación, cifra de ingreso potencial (oculta), plazo de contacto | Todo `null` → no se muestra; se usa un mensaje honesto |
| `legal.ts` | Responsable, domicilio, canal y procedimiento ARCO, limitación de uso, retención, transferencias, versión y fecha del aviso | Todo `null` → aviso placeholder |
| `statuses.ts` | Estados del proceso y prioridades | Editables |

## Bloqueadores de lanzamiento

`npm run check:launch` y el panel (Resumen) muestran la lista viva. Con `APP_ENV=production` el build y el
arranque fallan mientras exista algún **bloqueador**, y la API rechaza postulaciones.

Bloquean producción:

1. **Aviso de privacidad integral aprobado**: responsable, domicilio, canal y procedimiento ARCO, medios
   para limitar uso/divulgación, transferencias, medio para comunicar cambios, versión y fecha.
2. **Política de retención** aprobada (`RETENTION` y `retentionText`).
3. **Validación de sucursales**: direcciones, operación actual y horarios.
4. **Infraestructura**: `APP_URL` con HTTPS, `HASH_SECRET` robusto, almacenamiento privado persistente.

Pendientes (no bloquean el build, pero deben confirmarse):

5. **Aviso sobre evaluación con proveedor externo de IA** (bloquea sólo si `AI_PROVIDER` está activo):
   texto aprobado en `aiProcessingText` y `aiProcessingDisclosed = true` en `src/config/legal.ts`.
6. **Horario real del puesto** (mientras falte, el formulario usa una pregunta neutral).
7. **Condiciones de compensación** (sueldo, comisiones, prestaciones, tipo de contratación). La cifra
   “hasta $30,000 MXN por comisiones” está oculta (`incomeClaim.enabled = false`) hasta que se valide.
8. **Credenciales y dos plantillas de WhatsApp** (nueva candidatura y shortlist) y números de Abraham y
   Verónica (u otras personas responsables); correo de respaldo opcional.
9. **Clave del proveedor de IA** (`ANTHROPIC_API_KEY`) y ejecución de `npm run eval:rubric` con resultado
   satisfactorio; mientras tanto las evaluaciones quedan pendientes o se califican manualmente.
10. **Validar el umbral (70) y el tamaño de shortlist (5)** con el equipo tras una primera convocatoria.
11. **Cuentas individuales** para Abraham y Verónica (`npm run admin:create`).
12. **Logo oficial** en alta calidad.

## Despliegue

1. Provisiona PostgreSQL y (recomendado) un bucket S3/R2 privado.
2. Configura las variables de entorno con `APP_ENV=production` y `APP_URL=https://…`.
3. `npm ci && npm run db:deploy && npm run build && npm start` (o el equivalente de tu plataforma:
   Vercel, Render, Railway, un VPS con Node, etc.). HTTPS debe terminarse en la plataforma o proxy.
4. Crea las cuentas del panel con `npm run admin:create`.
5. Programa `npm run evaluations:process` (cada 5–10 min), `npm run notifications:retry` (cada 10–15 min) y, una vez aprobada la política,
   `npm run retention:purge -- --apply` (diario).
6. **Nunca** ejecutes `npm run db:seed` en producción (el script lo impide).

## Pruebas

- `npm test` (unitarias): shortlist (máximo N, umbral sin relleno, empates, bloqueo por pendientes,
  revisión manual separada, invariancia al orden con 50 candidaturas), conversión 0–4 → puntos, validación
  de la salida de IA (esquema, evidencia verificable, confianza baja, instrucciones incrustadas),
  redacción de datos personales, elegibilidad neutral, validación del formulario, archivos, permisos,
  protección del enlace del aviso, contenido mínimo de avisos, CSV y bloqueos de producción.
- `npm run test:integration` (PostgreSQL real, evaluador de prueba determinista inyectado sólo en tests):
  50 postulaciones guardadas con evaluación o error visible; cierre bloqueado por fallos hasta revisión
  manual; ranking provisional sin aviso; máximo 5 sobre umbral; sólo 3 → 3 y el aviso dice 3; empate en 5.º
  lugar; orden de envío sin efecto; CV opcional sin efecto en la evaluación; un aviso por destinatario, sin
  duplicados en reintentos ni doble clic; “pendiente de configuración” sin credenciales; postulaciones
  posteriores al cierre y nueva versión; una rúbrica nueva no altera convocatorias anteriores.
- `npm run eval:rubric` (proveedor real): respuesta sólida sin experiencia en motos ≥ 70; inventar datos o
  presionar ≤ 1 en honestidad/objeciones/seguimiento; sin acentos/mayúsculas ±10 puntos; instrucciones
  incrustadas → revisión. **Requiere clave; no se ha ejecutado en este entorno.**
- `npm run smoke -- <url>`: rutas públicas no exponen expedientes, puntajes ni CV.

## Dependencias con avisos conocidos

`npm audit` reporta `deepmerge-ts` dentro del CLI de Prisma (herramienta de desarrollo/migraciones, no
se ejecuta con datos de usuarios). Revisar al actualizar Prisma.
