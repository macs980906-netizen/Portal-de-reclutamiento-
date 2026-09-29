import type { Metadata } from "next";
import { isLegalComplete } from "@/config/legal";
import { privacyConfig } from "@/config/privacy";
import { SiteFooter, SiteHeader } from "@/components/brand";

export const metadata: Metadata = { title: "Aviso de privacidad · Reclutamiento RiderMex" };
export const dynamic = "force-dynamic";

const PENDING = "[PENDIENTE DE APROBACIÓN POR RIDERMEX]";

/**
 * Aviso de privacidad. Mientras `src/config/legal.ts` esté incompleto se muestra como
 * PLACEHOLDER de desarrollo; en producción el build está bloqueado en ese caso.
 * El texto describe lo que la plataforma realmente hace, pero no sustituye la revisión legal.
 */
export default function PrivacidadPage() {
  const LEGAL = privacyConfig();
  const complete = LEGAL.sheetsMode ? LEGAL.complete : isLegalComplete();
  const v = (value: string | null) => value ?? PENDING;

  return (
    <div className="min-h-dvh bg-ink">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6">
        {!complete && (
          <div role="alert" className="mb-8 rounded-xl border-2 border-yellow-400 bg-yellow-300 p-5 text-black">
            <p className="text-lg font-bold">Placeholder de desarrollo — no publicar</p>
            <p className="mt-1">
              Este aviso aún no ha sido aprobado. RiderMex debe completar y validar responsable, domicilio, canal y
              procedimiento ARCO, medios para limitar el uso o divulgación, plazos de conservación, versión y fecha.
            </p>
          </div>
        )}

        <h1 className="display text-4xl sm:text-5xl">
          <span className="text-chrome">Aviso de</span> <span className="text-fire">privacidad</span>
        </h1>
        <p className="mt-2 text-mute">
          Reclutamiento de asesores comerciales · Versión {LEGAL.noticeVersion}
          {LEGAL.noticeUpdatedAt ? ` · Actualizado el ${LEGAL.noticeUpdatedAt}` : ""}
        </p>

        {LEGAL.fullNoticeUrl && (
          <p className="mt-6">
            <a href={LEGAL.fullNoticeUrl} className="font-semibold text-red-text underline underline-offset-4" rel="noopener noreferrer">
              Consulta el aviso de privacidad integral
            </a>
          </p>
        )}

        <div className="mt-8 space-y-8 text-fog [&_h2]:display [&_h2]:text-2xl [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc">
          <section>
            <h2>Responsable</h2>
            <p className="mt-2">
              {v(LEGAL.controllerName)}, con domicilio en {v(LEGAL.controllerAddress)}, es responsable del tratamiento de los
              datos personales que proporcionas en este sitio.
            </p>
          </section>

          <section>
            <h2>Datos que recabamos</h2>
            <ul className="mt-2 space-y-1">
              <li>Identificación y contacto: nombre, apellido, celular/WhatsApp y, si lo proporcionas, correo electrónico.</li>
              <li>Preferencias: agencias de interés, zona general de traslado (opcional) y disponibilidad para entrevista.</li>
              <li>Experiencia e interés: respuestas sobre tu experiencia en ventas o atención y tu interés en la vacante.</li>
              <li>Respuestas al “Desafío de ventas RiderMex”.</li>
              <li>CV, sólo si decides adjuntarlo.</li>
              <li>Datos de campaña (origen del anuncio o enlace), separados de tus respuestas.</li>
            </ul>
            <p className="mt-3">
              No solicitamos datos personales sensibles (por ejemplo, salud, religión, origen étnico u opiniones políticas), ni
              edad exacta, estado civil, fotografía o domicilio exacto.
            </p>
          </section>

          <section>
            <h2>Finalidades</h2>
            <p className="mt-2">Finalidades necesarias para esta postulación:</p>
            <ul className="mt-2 space-y-1">
              <li>Evaluar tu perfil para vacantes de asesor/a comercial en las agencias RiderMex.</li>
              <li>Contactarte para dar seguimiento al proceso de selección y, en su caso, agendar una entrevista.</li>
            </ul>
            <p className="mt-3">Finalidad opcional (sólo si la autorizas con la casilla correspondiente):</p>
            <ul className="mt-2 space-y-1">
              <li>Conservar tus datos para considerarte en futuras vacantes.</li>
            </ul>
            <p className="mt-3">
              El resultado del desafío es un puntaje orientativo que ayuda al equipo a organizar su revisión. No es una evaluación
              psicológica y no se toman decisiones de contratación de forma automática: siempre las revisa una persona.
            </p>
          </section>

          <section>
            <h2>Evaluación del desafío</h2>
            <p className="mt-2">
              Las respuestas del “Desafío de ventas RiderMex” se califican contra una rúbrica de trabajo para ordenar la
              revisión. Cuando la evaluación asistida por inteligencia artificial está activa, sólo se envían al proveedor las
              respuestas del desafío, sin tu nombre, teléfono, correo, zona ni CV. El resultado es orientativo: una persona
              del equipo lo revisa y decide. No se investigan tus redes sociales ni se consultan fuentes externas sobre ti.
            </p>
            <p className="mt-2">Proveedor y condiciones del tratamiento: {v(LEGAL.aiProcessingText)}</p>
          </section>

          <section>
            <h2>Conservación</h2>
            <p className="mt-2">{v(LEGAL.retentionText)}</p>
          </section>

          <section>
            <h2>Transferencias y encargados</h2>
            <p className="mt-2">{v(LEGAL.transfersText)}</p>
          </section>

          <section>
            <h2>Derechos ARCO y revocación del consentimiento</h2>
            <p className="mt-2">
              Puedes solicitar el acceso, rectificación, cancelación u oposición al tratamiento de tus datos, así como revocar tu
              consentimiento, a través de: {v(LEGAL.arcoContact)}.
            </p>
            <p className="mt-2">Procedimiento: {v(LEGAL.arcoProcedure)}</p>
            <p className="mt-2">Te sugerimos incluir tu código de postulación (RMX-…) para localizar tu registro.</p>
          </section>

          <section>
            <h2>Limitación del uso o divulgación</h2>
            <p className="mt-2">{v(LEGAL.limitUseMechanism)}</p>
          </section>

          <section>
            <h2>Seguridad</h2>
            <p className="mt-2">
              Tu información se transmite de forma cifrada, se guarda con acceso restringido a personal autorizado del equipo de
              reclutamiento y tu CV se almacena de forma privada. No compartimos tus respuestas ni tu CV con plataformas de
              publicidad.
            </p>
          </section>

          <section>
            <h2>Cambios al aviso</h2>
            <p className="mt-2">{v(LEGAL.changesMechanism)}</p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
