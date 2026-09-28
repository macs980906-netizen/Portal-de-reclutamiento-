# Portal de reclutamiento RiderMex · Asesores comerciales

Landing y formulario por pasos para postularse como asesor/a comercial en las agencias RiderMex, con un
**Desafío de ventas** breve, puntaje orientativo transparente calculado en servidor, carga privada de CV,
panel privado para el equipo y notificaciones configurables (WhatsApp).

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
| Puntaje | Reglas deterministas en servidor (`src/server/scoring/`) | Transparente, auditable, sin IA generativa. |
| Notificaciones | Servicio desacoplado: `console` (dev), WhatsApp Cloud API, Twilio | Idempotente, con registro de estado y reintentos. |

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
    admin/(panel)/               Resumen, postulaciones, expediente, notificaciones
    admin/cv/[id]/route.ts       Descarga autenticada de CV
    admin/export/route.ts        Exportación CSV (sólo ADMIN, auditada)
  config/                        ← DATOS EDITABLES DE NEGOCIO Y LEGALES
    agencies.ts  business.ts  legal.ts  statuses.ts  launch.ts
  lib/                           Código compartido (validación, desafío público, permisos)
  server/                        Sólo servidor (BD, auth, almacenamiento, puntuación, notificaciones)
  proxy.ts                       Primera barrera de /admin (la validación real es por página/acción)
prisma/  schema.prisma, migrations/, seed.ts (demo sólo desarrollo)
scripts/ check-launch, create-admin, retention-purge, retry-notifications
tests/   pruebas unitarias (vitest)
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
| `WHATSAPP_CLOUD_*`, `WHATSAPP_TEMPLATE_*` | si usas Meta | |
| `TWILIO_*` | si usas Twilio | |

Ninguna variable lleva prefijo `NEXT_PUBLIC_`: nada de esto llega al navegador.

## Crear un administrador

```bash
npm run admin:create -- --email persona@ridermex.mx --name "Nombre Apellido" --role ADMIN
# o sólo revisión:
npm run admin:create -- --email persona@ridermex.mx --name "Nombre" --role REVIEWER
```

Roles:

- **REVIEWER**: ve expedientes y contacto (queda auditado), descarga CV, califica (1–5) y agrega notas.
- **ADMIN**: además cambia estado y prioridad, exporta CSV, elimina expedientes (ARCO) y reintenta
  notificaciones.

## Almacenamiento de CV

- **local** (por defecto): archivos en `./storage/private/cv/<uuid>.<ext>` con permisos `0600`, fuera de
  `public/` e ignorados por git. En producción requiere disco persistente y respaldado, y declararlo con
  `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true`.
- **s3**: `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION` y credenciales. Compatible con AWS S3,
  Cloudflare R2 o MinIO (`S3_ENDPOINT`). El bucket debe ser **privado** (sin acceso público ni listado).
  El servidor descarga y entrega el archivo tras autenticar; no se generan URLs públicas.

Validaciones: extensión (`pdf`, `doc`, `docx`) **y** firma real de bytes, tamaño máximo, nombre de
almacenamiento aleatorio, descarga siempre como adjunto con `nosniff` y CSP `sandbox`.

## Activar WhatsApp

El mensaje contiene **sólo**: nombre e inicial del apellido, agencia preferida, puntaje orientativo y el
enlace al expediente (que exige iniciar sesión). Nunca CV, respuestas, teléfono ni correo.

1. Define destinatarios (no los subas al repo):
   `NOTIFY_WHATSAPP_RECIPIENTS=Abraham|+52155XXXXXXXX,Verónica|+52155XXXXXXXX`
2. Elige proveedor:
   - **WhatsApp Cloud API (Meta)**: `NOTIFY_PROVIDER=whatsapp_cloud`, `WHATSAPP_CLOUD_TOKEN`,
     `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG=es_MX`.
     Los mensajes iniciados por el negocio requieren una **plantilla aprobada** de categoría *Utility*
     con 4 variables, por ejemplo:
     > Nueva candidatura: {{1}}. Agencia preferida: {{2}}. Puntaje orientativo: {{3}} (requiere revisión
     > humana). Expediente: {{4}}
   - **Twilio**: `NOTIFY_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
     `TWILIO_WHATSAPP_FROM`, y en producción `TWILIO_CONTENT_SID` (plantilla aprobada, variables 1–4).
     Sin plantilla se envía texto libre, que sólo funciona en sandbox o dentro de la ventana de 24 h.
3. Reinicia la app y usa **Panel → Notificaciones → Reintentar** (o `npm run notifications:retry`) para
   enviar las que quedaron como “Requiere configuración”.

Comportamiento sin credenciales: cada postulación deja un registro **“Requiere configuración”** visible en
el panel; no se simula ningún envío. Con `NOTIFY_PROVIDER=console` (sólo desarrollo) el aviso se escribe en
consola y queda como “Registrada en consola (desarrollo)”, nunca como “Enviada”. Cada notificación tiene
una clave única por postulación y destinatario, y se “reclama” antes de enviar para evitar duplicados.
Las postulaciones marcadas como posible duplicado no generan notificación.

## Puntaje orientativo

Calculado en `src/server/scoring/` (sólo servidor; la clave nunca llega al navegador). Función pura y
determinista. Pesos (editables en `key.ts`, total 100):

| Dimensión | Peso | Fuente |
| --- | --- | --- |
| Venta consultiva y descubrimiento | 25 | Ejercicio 1 + pregunta en la respuesta abierta |
| Manejo de objeciones y honestidad | 20 | Ejercicios 2 y 3 |
| Escucha, empatía y orientación al cliente | 20 | Ejercicios 1, 3, 4 y respuesta abierta |
| Seguimiento y criterio comercial | 15 | Ejercicio 4 |
| Comunicación clara | 10 | Respuesta abierta (extensión razonable, ofrece ayuda) |
| Aprendizaje e interés | 10 | Ejercicio 2 + interés en sus propias palabras |

Principios:

- **Orienta la revisión; no decide.** No hay cortes ni rechazos automáticos. El panel muestra el
  desglose, los indicadores explicables y la advertencia en cada expediente.
- “No estoy seguro/a; primero preguntaría al cliente” recibe crédito parcial.
- La respuesta abierta se evalúa con señales simples (hace una pregunta, recibe cordialmente, ofrece
  ayuda, extensión razonable). No se califica ortografía, acentos, vocabulario ni estilo; el equipo debe
  leer la respuesta original.
- La experiencia vendiendo vehículos se muestra como **señal contextual separada** y no suma puntos.
- No se usan edad, género, zona, domicilio, escolaridad ni otros datos ajenos al puesto.
- No es una prueba psicométrica ni está validado científicamente; no debe presentarse como tal.
- Al modificar puntos o pesos, incrementa `SCORING_VERSION` (cada expediente guarda su versión).

## Privacidad y seguridad (resumen)

- Minimización: no se piden edad, género, estado civil, foto, domicilio exacto, salud ni antecedentes.
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

5. **Horario real del puesto** (mientras falte, el formulario usa una pregunta neutral).
6. **Condiciones de compensación** (sueldo, comisiones, prestaciones, tipo de contratación). La cifra
   “hasta $30,000 MXN por comisiones” está oculta (`incomeClaim.enabled = false`) hasta que se valide.
7. **Credenciales y plantilla de WhatsApp** y números de Abraham y Verónica (u otras personas responsables).
8. **Logo oficial** en alta calidad.

## Despliegue

1. Provisiona PostgreSQL y (recomendado) un bucket S3/R2 privado.
2. Configura las variables de entorno con `APP_ENV=production` y `APP_URL=https://…`.
3. `npm ci && npm run db:deploy && npm run build && npm start` (o el equivalente de tu plataforma:
   Vercel, Render, Railway, un VPS con Node, etc.). HTTPS debe terminarse en la plataforma o proxy.
4. Crea las cuentas del panel con `npm run admin:create`.
5. Programa `npm run notifications:retry` (cada 10–15 min) y, una vez aprobada la política,
   `npm run retention:purge -- --apply` (diario).
6. **Nunca** ejecutes `npm run db:seed` en producción (el script lo impide).

## Pruebas

`npm test` cubre: puntuación (determinismo, pesos, crédito parcial, sin penalizar ortografía ni a quien
“está empezando”), validación (teléfono, agencias, consentimiento, campos no previstos, UTM), validación
real de archivos (ejecutable renombrado, ZIP falso, tamaño), permisos por rol, que ningún componente cliente
importe código de servidor, contenido mínimo de la notificación, CSV sin fórmulas y bloqueos de producción.

También se verificó de extremo a extremo con navegador (móvil 390 px y escritorio): postulación completa
con y sin CV, errores de validación accesibles, código de confirmación, `401` sin sesión en CV/exportación,
`403` a revisión para exportar, descarga de CV como adjunto para usuarios autenticados, cambio de estado,
notas, calificación y exportación por un administrador.

## Dependencias con avisos conocidos

`npm audit` reporta `deepmerge-ts` dentro del CLI de Prisma (herramienta de desarrollo/migraciones, no
se ejecuta con datos de usuarios). Revisar al actualizar Prisma.
