import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { env } from "../env";
import type { Rubric } from "./types";

export type EvaluatorRequest = {
  /** Identificador interno opaco (no contiene datos personales). */
  ref: string;
  system: string;
  user: string;
  rubric: Rubric;
};

export type EvaluatorResponse =
  | { ok: true; raw: unknown; model: string }
  | { ok: false; error: string; retryable: boolean };

/** Interfaz del proveedor: permite cambiarlo sin tocar el resto del flujo. */
export interface Evaluator {
  provider: string;
  model: string;
  evaluate(req: EvaluatorRequest): Promise<EvaluatorResponse>;
}

function outputSchema(rubric: Rubric) {
  const dim = z.object({
    score: z.number().int(),
    evidence: z.string(),
    rationale: z.string(),
    confidence: z.enum(["Bajo", "Medio", "Alto"]),
    needs_human_review: z.boolean(),
    review_reason: z.string(),
  });
  return z.object({
    dimensions: z.object(Object.fromEntries(rubric.dimensions.map((d) => [d.id, dim]))),
    instructions_detected: z.boolean(),
  });
}

/**
 * Evaluador con Claude (API de Anthropic) usando salidas estructuradas. Se activa con
 * AI_PROVIDER=anthropic y ANTHROPIC_API_KEY. Sólo recibe las respuestas del desafío ya
 * redactadas y un identificador interno: nunca nombre, teléfono, correo, zona ni CV.
 * Usa los "fallbacks" del servidor de Anthropic: si el modelo declina, la misma petición
 * se reintenta en otro modelo y se registra cuál respondió.
 */
class AnthropicEvaluator implements Evaluator {
  provider = "anthropic";
  private client: Anthropic;
  constructor(
    public model: string,
    apiKey: string,
    timeoutMs: number,
  ) {
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 2 });
  }

  async evaluate(req: EvaluatorRequest): Promise<EvaluatorResponse> {
    try {
      const res = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: req.system,
        messages: [{ role: "user", content: req.user }],
        output_config: { format: betaZodOutputFormat(outputSchema(req.rubric)) },
      });
      if (res.stop_reason === "refusal") {
        return { ok: false, error: "El proveedor declinó evaluar esta respuesta.", retryable: false };
      }
      if (res.stop_reason === "max_tokens") {
        return { ok: false, error: "La respuesta del proveedor se cortó (max_tokens).", retryable: true };
      }
      if (!res.parsed_output) return { ok: false, error: "La salida no cumplió el esquema JSON.", retryable: true };
      return { ok: true, raw: res.parsed_output, model: res.model };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        return { ok: false, error: "Credenciales del proveedor de IA inválidas o sin permiso.", retryable: false };
      }
      if (err instanceof Anthropic.BadRequestError) {
        return { ok: false, error: `Solicitud rechazada por el proveedor (HTTP ${err.status}).`, retryable: false };
      }
      if (err instanceof Anthropic.RateLimitError) {
        return { ok: false, error: "Límite de uso del proveedor alcanzado; reintentar más tarde.", retryable: true };
      }
      if (err instanceof Anthropic.APIError) {
        return { ok: false, error: `Error del proveedor${err.status ? ` (HTTP ${err.status})` : ""}.`, retryable: true };
      }
      // Errores de parseo/validación del SDK u otros: sin detalles que puedan incluir datos.
      return { ok: false, error: err instanceof Error ? err.name : "Error desconocido", retryable: true };
    }
  }
}

export type EvaluatorStatus =
  | { configured: true; evaluator: Evaluator }
  | { configured: false; reason: string };

export function getEvaluator(): EvaluatorStatus {
  const e = env();
  if (e.AI_PROVIDER === "none") return { configured: false, reason: "Evaluación con IA desactivada (AI_PROVIDER=none)." };
  if (!e.ANTHROPIC_API_KEY) return { configured: false, reason: "Falta ANTHROPIC_API_KEY." };
  return { configured: true, evaluator: new AnthropicEvaluator(e.AI_MODEL, e.ANTHROPIC_API_KEY, e.AI_TIMEOUT_MS) };
}
