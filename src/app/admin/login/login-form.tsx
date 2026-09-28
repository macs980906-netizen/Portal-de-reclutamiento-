"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="email" className="block font-semibold">
          Correo
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className="a-input mt-1" />
      </div>
      <div>
        <label htmlFor="password" className="block font-semibold">
          Contraseña
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="a-input mt-1" />
      </div>
      {state.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">
          {state.error}
        </p>
      )}
      <button type="submit" className="a-btn a-btn-red w-full" disabled={pending} aria-busy={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
