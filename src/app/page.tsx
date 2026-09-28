import Link from "next/link";
import { AGENCIES, UPCOMING_AGENCY_NOTE, mapsUrl } from "@/config/agencies";
import { BUSINESS, COMPENSATION_FALLBACK, hasConfirmedOffer } from "@/config/business";
import { ApplyIcon, LogoLockup, Showroom, SiteFooter, SiteHeader } from "@/components/brand";
import { AttributionCapture } from "@/components/attribution-capture";
import { DevBanner } from "@/components/dev-banner";

const ROLE_TASKS = [
  {
    title: "Orientar",
    text: "Recibir a quien llega buscando una motocicleta y ayudarle a ubicar por dónde empezar.",
  },
  {
    title: "Entender",
    text: "Preguntar y escuchar: para qué la quiere, cuánto piensa invertir y qué es lo más importante para esa persona.",
  },
  {
    title: "Explicar",
    text: "Presentar opciones reales con claridad, sin inventar datos ni prometer lo que no está confirmado.",
  },
  {
    title: "Acompañar",
    text: "Dar seguimiento con respeto y acompañar el proceso de compra hasta que la persona decida.",
  },
];

const TRAITS = [
  "Comunicación clara",
  "Escucha y curiosidad por entender al cliente",
  "Iniciativa y seguimiento",
  "Apertura para aprender",
  "Interés en ventas, motos o movilidad",
];

const STEPS = [
  { title: "Postulación", text: "Nos compartes tus datos de contacto, tus agencias de interés y tu experiencia (de cualquier giro)." },
  { title: "Desafío de ventas", text: "Resuelves 5 situaciones breves de atención y venta. Sin cronómetro y sin respuestas “de memoria”." },
  { title: "Revisión del equipo", text: "Una persona del equipo RiderMex lee tu postulación completa." },
  { title: "Posible entrevista", text: "Si tu perfil coincide con una vacante, te contactamos para conversar." },
];

function faqs() {
  return [
    { q: "¿Necesito haber vendido motos?", a: "No. Buscamos habilidades para atender y vender; lo demás se aprende." },
    {
      q: "¿Puedo postularme si mi experiencia de ventas es de otra industria?",
      a: "Sí. Nos interesa la experiencia en ventas de cualquier sector, incluida la venta empírica (tienda, catálogo, redes, mercado, servicios, etc.).",
    },
    { q: "¿Cuánto dura el registro?", a: `Alrededor de ${BUSINESS.estimatedMinutes}, incluyendo el desafío de ventas. Puedes volver a pasos anteriores sin perder tus respuestas.` },
    { q: "¿Debo subir mi CV?", a: "Es opcional. Si lo tienes a la mano, puedes adjuntarlo en PDF, DOC o DOCX; si no, puedes terminar tu registro sin él." },
    BUSINESS.contactTimeframe
      ? { q: "¿Cuándo me contactan?", a: BUSINESS.contactTimeframe }
      : {
          q: "¿Cuándo me contactan?",
          a: "El equipo revisa las postulaciones y, si tu perfil coincide con una vacante, se pone en contacto contigo por teléfono o WhatsApp.",
        },
    {
      q: "¿La evaluación es psicométrica?",
      a: "No. Es un ejercicio práctico con situaciones de atención y venta. No es un diagnóstico psicológico ni decide automáticamente una contratación: siempre la revisa una persona.",
    },
    {
      q: "¿Tengo que escribir o ir a una agencia para completar mi registro?",
      a: "No. Tu registro termina en este sitio. El equipo RiderMex revisará tu postulación y, si tu perfil coincide con una vacante, te contactará.",
    },
  ];
}

export default function LandingPage() {
  const offerConfirmed = hasConfirmedOffer();
  return (
    <>
      <DevBanner />
      <AttributionCapture />

      {/* ============ HERO ============ */}
      <section className="stage">
        <span className="halftone left-0 top-0" style={{ ["--hx" as string]: "0%", ["--hy" as string]: "0%" }} aria-hidden="true" />
        <span className="halftone bottom-0 right-0" style={{ ["--hx" as string]: "100%", ["--hy" as string]: "100%" }} aria-hidden="true" />
        <SiteHeader />

        <div className="mx-auto max-w-4xl px-4 pb-4 pt-4 text-center sm:pt-8">
          <LogoLockup size={96} />
          <p className="kicker mt-8">RiderMex busca asesores comerciales</p>
          <h1 className="display mt-4 text-[3.1rem] sm:text-7xl md:text-8xl">
            <span className="text-chrome block">Tu talento para vender</span>
            <span className="text-fire block pb-1">puede llevarte más lejos</span>
          </h1>
          <div className="glow-rule mx-auto mt-6 w-40" aria-hidden="true" />
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-fog sm:text-xl">
            Si sabes escuchar, recomendar y dar seguimiento, esta oportunidad puede ser para ti.{" "}
            <strong className="font-semibold text-white">No necesitas haber vendido motos</strong>: la experiencia en
            ventas de cualquier giro —o las ganas de aprender— cuentan.
          </p>

          {BUSINESS.incomeClaim.enabled && (
            <p className="mx-auto mt-5 max-w-xl rounded-lg border border-line bg-coal/80 px-4 py-3 text-sm text-fog">
              <strong className="text-white">{BUSINESS.incomeClaim.text}.</strong> {BUSINESS.incomeClaim.disclaimer}
            </p>
          )}

          <Link href="/postular" className="cta-box mx-auto mt-9 max-w-xl px-5 py-4 text-left sm:px-6">
            <ApplyIcon className="h-12 w-12 flex-none text-red-hot" />
            <span className="h-12 w-0.5 flex-none bg-red-hot/80" aria-hidden="true" />
            <span>
              <span className="display block text-2xl text-red-hot sm:text-3xl">Iniciar mi postulación</span>
              <span className="mt-1 block text-fog">
                Toma {BUSINESS.estimatedMinutes}. El CV es opcional.
              </span>
            </span>
          </Link>
          <p className="fineprint mt-6">Registro sujeto a evaluación de perfil</p>
        </div>
        <Showroom className="mt-2 h-40 sm:h-56" />
      </section>

      <main>
        {/* ============ QUÉ HACE UN ASESOR ============ */}
        <section aria-labelledby="rol" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <p className="kicker">El puesto</p>
          <h2 id="rol" className="display mt-3 text-4xl sm:text-5xl">
            <span className="text-chrome">Asesor / asesora</span> <span className="text-fire">comercial</span>
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-fog">
            Acompañas a las personas que buscan una motocicleta. La venta consultiva, la escucha y la constancia
            importan tanto como conocer el producto.
          </p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROLE_TASKS.map((t, i) => (
              <li key={t.title} className="panel p-6">
                <span className="display text-3xl text-red-hot" aria-hidden="true">
                  0{i + 1}
                </span>
                <h3 className="display mt-2 text-2xl">{t.title}</h3>
                <p className="mt-2 text-fog">{t.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ============ QUÉ BUSCAMOS ============ */}
        <section aria-labelledby="buscamos" className="stage border-y border-line">
          <span className="halftone right-0 top-0" style={{ ["--hx" as string]: "100%", ["--hy" as string]: "0%" }} aria-hidden="true" />
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-20 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 id="buscamos" className="display text-5xl sm:text-6xl">
                <span className="text-chrome block">No importa de dónde vienes.</span>
                <span className="text-fire block">Importa lo que sabes hacer.</span>
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-fog">
                Tal vez ya vendiste antes —en una tienda, por catálogo, en redes o en cualquier industria—. Tal vez apenas
                estás buscando una oportunidad. Si tienes iniciativa y sabes tratar con la gente,{" "}
                <strong className="text-white">queremos conocerte</strong>.
              </p>
            </div>
            <div className="panel panel-hot p-6 sm:p-8">
              <h3 className="kicker">Qué buscamos</h3>
              <ul className="mt-5 space-y-3">
                {TRAITS.map((t) => (
                  <li key={t} className="flex items-start gap-3 text-lg">
                    <svg viewBox="0 0 20 20" className="mt-1 h-5 w-5 flex-none text-red-hot" fill="currentColor" aria-hidden="true">
                      <path d="M7.6 14.2 3.4 10l1.4-1.4 2.8 2.8 7.6-7.6L16.6 5z" />
                    </svg>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 border-t border-line pt-5 text-fog">
                La experiencia en ventas puede ser de cualquier sector. No pedimos experiencia previa en motos ni en
                agencias.
              </p>
            </div>
          </div>
        </section>

        {/* ============ QUÉ OFRECE ============ */}
        <section aria-labelledby="oferta" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <p className="kicker">La oportunidad</p>
          <h2 id="oferta" className="display mt-3 text-4xl sm:text-5xl">
            <span className="text-chrome">Qué ofrece</span> <span className="text-fire">la vacante</span>
          </h2>
          {offerConfirmed ? (
            <dl className="mt-8 grid gap-4 sm:grid-cols-2">
              {BUSINESS.baseSalary && <OfferItem label="Sueldo base" value={BUSINESS.baseSalary} />}
              {BUSINESS.commissionScheme && <OfferItem label="Comisiones" value={BUSINESS.commissionScheme} />}
              {BUSINESS.contractType && <OfferItem label="Tipo de contratación" value={BUSINESS.contractType} />}
              {BUSINESS.jobSchedule && <OfferItem label="Horario del puesto" value={BUSINESS.jobSchedule} />}
              {BUSINESS.benefits?.length ? <OfferItem label="Prestaciones" value={BUSINESS.benefits.join(" · ")} /> : null}
            </dl>
          ) : (
            <div className="panel mt-8 max-w-3xl p-6 sm:p-8">
              <p className="text-lg text-fog">{COMPENSATION_FALLBACK}</p>
            </div>
          )}
        </section>

        {/* ============ UBICACIONES ============ */}
        <section aria-labelledby="agencias" className="border-t border-line bg-coal/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <p className="kicker">Agencias</p>
            <h2 id="agencias" className="display mt-3 text-4xl sm:text-5xl">
              <span className="text-chrome">Elige dónde</span> <span className="text-fire">te gustaría estar</span>
            </h2>
            <p className="mt-4 max-w-3xl text-lg text-fog">
              En tu postulación puedes elegir una primera y una segunda opción, o decirnos que te interesa cualquiera. La
              asignación final depende de las vacantes disponibles y del proceso de selección.
            </p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {AGENCIES.map((a) => (
                <li key={a.id} className="panel flex flex-col p-6">
                  <p className="kicker text-[0.7rem]">{a.zone}</p>
                  <h3 className="display mt-2 text-3xl">{a.name}</h3>
                  <p className="mt-3 text-fog">{a.address}</p>
                  <div className="mt-4 text-sm text-mute">
                    <p className="font-semibold text-fog">Horario de atención al público</p>
                    <ul className="mt-1">
                      {a.publicHours.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  </div>
                  <a
                    href={mapsUrl(a)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex w-fit items-center gap-2 font-semibold text-red-text underline underline-offset-4 hover:text-white"
                  >
                    Ver en Google Maps <span className="sr-only">(se abre en otra pestaña)</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-mute">
              Los horarios mostrados son de atención al público de cada agencia, no el horario del puesto. {UPCOMING_AGENCY_NOTE}
            </p>
          </div>
        </section>

        {/* ============ PROCESO ============ */}
        <section aria-labelledby="proceso" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <p className="kicker">Paso a paso</p>
          <h2 id="proceso" className="display mt-3 text-4xl sm:text-5xl">
            <span className="text-chrome">Así es</span> <span className="text-fire">el proceso</span>
          </h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="panel relative p-6">
                <span className="display text-5xl text-red-hot" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="display mt-2 text-2xl">{s.title}</h3>
                <p className="mt-2 text-fog">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="panel panel-hot mt-8 p-6 text-lg text-fog">
            <p>
              <strong className="text-white">El equipo RiderMex revisará tu postulación</strong> y, si tu perfil coincide
              con una vacante, te contactará. No necesitas escribir a una agencia para terminar el registro.
            </p>
            <p className="mt-3 text-base text-mute">
              Completar el desafío no garantiza una entrevista ni una contratación.
            </p>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section aria-labelledby="faq" className="border-t border-line bg-coal/60">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
            <h2 id="faq" className="display text-4xl sm:text-5xl">
              <span className="text-chrome">Preguntas</span> <span className="text-fire">frecuentes</span>
            </h2>
            <div className="mt-8 space-y-3">
              {faqs().map((f) => (
                <details key={f.q} className="panel group p-0">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl p-5 text-lg font-semibold">
                    {f.q}
                    <span className="display text-2xl text-red-hot transition-transform group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-fog">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ============ CTA FINAL ============ */}
        <section aria-labelledby="final" className="stage">
          <div className="mx-auto max-w-4xl px-4 pt-16 text-center sm:pt-20">
            <h2 id="final" className="display text-5xl sm:text-7xl">
              <span className="text-chrome block">Tu próxima</span>
              <span className="text-fire block">oportunidad</span>
            </h2>
            <p className="slash-banner display mx-auto mt-4 w-fit px-10 py-2 text-xl text-black sm:text-2xl">
              Puede empezar aquí.
            </p>
            <Link href="/postular" className="btn btn-primary mt-10 px-8 text-lg">
              Iniciar mi postulación
            </Link>
            <p className="mt-4 text-fog">Te toma {BUSINESS.estimatedMinutes}.</p>
          </div>
          <Showroom className="mt-10 h-36 sm:h-52" />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function OfferItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-6">
      <dt className="kicker text-[0.7rem]">{label}</dt>
      <dd className="mt-2 text-lg">{value}</dd>
    </div>
  );
}
