# Modo simple: landing en Vercel + Google Sheets

Esta es la forma más rápida de publicar la convocatoria. **No necesitas base de datos ni panel.**

```
Candidato (celular) ──► Landing en Vercel ──► tu Google Sheet (una fila por postulación)
                               │                     ▲
                               └── Claude evalúa ────┘  (puntaje, desglose y evidencia en la misma fila)
                                                        Pestaña "Top 5" se ordena sola
```

- La landing y el formulario son los mismos del portal (diseño de los artes, 6 preguntas, CV opcional).
- Cada postulación queda como una fila en la pestaña **Postulaciones**. El CV (si lo suben) se guarda en
  una carpeta **privada** de tu Google Drive y la fila tiene el enlace.
- En segundo plano, Claude califica las 6 respuestas con la rúbrica y escribe en la fila el **puntaje
  (0–100)**, el desglose por dimensión y la evidencia (cita textual + justificación).
- La pestaña **Top 5** muestra en vivo a quienes están "Evaluada" y alcanzan el umbral, ordenados por
  puntaje. Si hay empate en el último lugar, aparecen todas las personas empatadas con un aviso.
- Menú **RiderMex** dentro de la hoja: reintentar evaluaciones y **enviar el Top por correo** a Abraham y
  Verónica.

Tiempo de configuración: ~20 minutos. Necesitas: una cuenta de Google, una cuenta de Vercel (gratis), y
una clave de la API de Anthropic para la evaluación automática.

---

## Paso 1 · Crea la hoja y pega el script (5 min)

1. Crea un Google Sheet nuevo, por ejemplo “RiderMex · Postulaciones asesores”.
2. Menú **Extensiones → Apps Script**. Borra lo que haya y pega **todo** el contenido de
   [`google-apps-script/Code.gs`](../google-apps-script/Code.gs). Guarda (ícono de disco).
3. Inventa un **secreto** largo (mínimo 24 caracteres; por ejemplo, genera una contraseña de 32
   caracteres con tu gestor de contraseñas). Lo usarás dos veces: aquí y en Vercel.
4. Regresa a la hoja y recárgala. Aparece el menú **RiderMex**. Elige **1. Configurar** y pega el secreto.
   En la URL de la landing puedes poner cualquier cosa por ahora; la cambias en el paso 4.
   (La primera vez Google pedirá permisos: acéptalos con tu cuenta.)
5. En el editor de Apps Script: **Implementar → Nueva implementación → tipo: Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona** (el script rechaza todo lo que no traiga el secreto).
   - Copia la **URL de la aplicación web** (termina en `/exec`).

> Si luego cambias el código del script, vuelve a **Implementar → Administrar implementaciones →
> Editar → Nueva versión** para que la URL use el código nuevo.

## Paso 2 · Clave de Anthropic (3 min)

En [console.anthropic.com](https://console.anthropic.com) crea una API key y agrega saldo. Costo
aproximado: alrededor de 1–2 pesos por postulación evaluada (varía con la longitud de las respuestas).
Sin clave, la landing funciona igual pero las filas quedan en “Pendiente” y el Top 5 no se llena.

## Paso 3 · Publica en Vercel (10 min)

1. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repositorio
   `Portal-de-reclutamiento-` y elige la rama `claude/ridermex-recruitment-portal-b8m23a`
   (o fusiónala a `main` antes).
2. En **Environment Variables** agrega:

| Variable | Valor |
| --- | --- |
| `DATA_BACKEND` | `sheets` |
| `SHEETS_WEBHOOK_URL` | la URL `/exec` del paso 1 |
| `SHEETS_WEBHOOK_SECRET` | el mismo secreto del paso 1 |
| `APP_URL` | la URL de tu proyecto, p. ej. `https://ridermex-asesores.vercel.app` |
| `TRUST_PROXY_HEADERS` | `true` |
| `AI_PROVIDER` | `anthropic` |
| `ANTHROPIC_API_KEY` | tu clave del paso 2 |
| `RIDERMEX_RESPONSABLE` | razón social del responsable de los datos (p. ej. “Motos X, S.A. de C.V.”) |
| `RIDERMEX_DOMICILIO` | domicilio del responsable |
| `RIDERMEX_CORREO_PRIVACIDAD` | correo para dudas de privacidad y derechos ARCO |
| `RIDERMEX_PLAZO_CONSERVACION` | cuánto tiempo conservarán las postulaciones (lo deciden ustedes) |

3. **Deploy**. Cuando termine, abre la URL. Si ves una franja amarilla “Registro aún no disponible”,
   te falta alguna de las variables de arriba (la franja dice cuál). **Mientras falten, el formulario no
   acepta postulaciones.**
4. Regresa a la hoja → **RiderMex → 1. Configurar** y ahora sí pon la URL real de la landing (para que
   “Reintentar evaluaciones” funcione).

> Cambiar una variable en Vercel requiere volver a desplegar (Deployments → Redeploy).

## Paso 4 · Prueba antes de publicar el post

1. Desde tu celular, abre la landing y completa una postulación de prueba (con y sin CV).
2. En la hoja debe aparecer la fila en segundos, con Estado “Pendiente”, y en 1–2 minutos pasar a
   “Evaluada” con puntaje y evidencia.
3. Revisa la pestaña **Top 5** y la pestaña **Config** (umbral 70 y tamaño 5; puedes cambiarlos ahí).
4. Borra las filas de prueba (y sus CV en la carpeta de Drive) antes de publicar.

---

## Uso diario

- **Top 5**: ranking en vivo. Es provisional mientras sigan llegando postulaciones.
- **Config**: `B1` umbral mínimo (70 es un valor inicial por validar, no un estándar), `B2` tamaño del
  Top, `B3` correos de Abraham y Verónica separados por coma.
- **Revisión manual**: la IA manda a “Revisión manual” las respuestas vacías, ambiguas, de baja confianza
  o con texto que intenta dar instrucciones al evaluador. No entran al Top hasta que alguien las lea: si
  estás de acuerdo con el puntaje, cambia su “Estado evaluación” a `Evaluada`; si no, corrige el puntaje.
- **Pendiente / Falló**: RiderMex → **Reintentar evaluaciones pendientes** (hasta 10 por clic). Puedes
  programarlo: en Apps Script → Activadores → `reintentarEvaluaciones` cada 15 minutos.
- **Enviar el Top**: RiderMex → **Enviar Top por correo al equipo**. Manda nombres, puntaje y agencia, con
  el enlace a la hoja (no manda teléfonos ni respuestas).
- Columnas **Estado del proceso** y **Notas del equipo**: para que el equipo anote “Invitar a
  entrevista”, “No continúa en esta ronda”, etc.
- **Posible duplicado = Sí**: el mismo teléfono ya había enviado otra postulación.

## Qué NO cambia respecto al portal completo

- La rúbrica, las preguntas, la redacción de datos personales antes de enviar a la IA, la validación
  de la salida y la verificación de la evidencia son las mismas.
- El puntaje orienta la revisión: **la decisión de entrevistar o contratar es del equipo**. La
  experiencia en motos, el CV, la zona o los años de experiencia **no suman puntos**.

## Privacidad (importante)

- La hoja y la carpeta de CV son **privadas** en tu cuenta de Google. Compártelas sólo con quien deba
  revisar (Abraham, Verónica). No publiques la URL del script ni el secreto.
- El aviso de privacidad de la landing (`/privacidad`) se arma con los 4 datos que capturas en Vercel y
  describe lo que el sistema hace de verdad (proveedores: Vercel, Google y, si está activa, Anthropic).
  Es un mínimo operativo: **que lo revise su asesoría legal**.
- Para una solicitud de eliminación (derechos ARCO): borra la fila y el CV de la carpeta de Drive.

## Limitaciones de este modo (frente al portal completo con base de datos)

- No hay panel web con cuentas por persona: la hoja es el panel y los permisos son los de Google Sheets.
- El límite antiabuso es por servidor (en memoria); el campo trampa y el tiempo mínimo de llenado siguen
  activos.
- El Top es en vivo; no hay “cierre de convocatoria” con instantánea. Cuando decidan cerrar, envíen el
  Top por correo y guarden una copia de la pestaña.
- Los avisos por WhatsApp no están en este modo; se usa el correo desde la hoja.
- CV de hasta 4 MB (límite de Vercel).
