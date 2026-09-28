/** Política mínima de contraseñas para cuentas del panel. */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return "La contraseña debe tener al menos 12 caracteres.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Usa letras y números.";
  return null;
}
