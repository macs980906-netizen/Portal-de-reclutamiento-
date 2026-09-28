/**
 * Crea o actualiza una cuenta del panel.
 *   npm run admin:create -- --email persona@ridermex.mx --name "Nombre" --role ADMIN
 * La contraseña se pide por consola (no queda en el historial) o vía ADMIN_PASSWORD.
 */
import { createInterface } from "node:readline/promises";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { passwordProblem } from "../src/lib/password";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const role = (arg("role") ?? "REVIEWER").toUpperCase() as Role;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
    console.error('Uso: npm run admin:create -- --email correo@dominio --name "Nombre" [--role ADMIN|REVIEWER]');
    process.exit(1);
  }
  if (!Object.values(Role).includes(role)) {
    console.error("Rol inválido. Usa ADMIN o REVIEWER.");
    process.exit(1);
  }
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Contraseña (mín. 12 caracteres, letras y números): ");
    rl.close();
  }
  const problem = passwordProblem(password);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, role, passwordHash },
    update: { name, role, passwordHash, active: true, failedLogins: 0, lockedUntil: null },
  });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(`✔ Cuenta ${user.email} lista con rol ${user.role}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
