#!/usr/bin/env bun
/**
 * Seed two demo accounts for manual testing: an admin and a regular
 * participant. Re-running is safe — existing accounts are left untouched.
 */
import { initAuth } from "@acme/auth";
import { AppAdmin, db, eq, user as User } from "@acme/db";

export const DEMO_ADMIN = {
  email: "demo-admin@sitruk.demo",
  password: "DemoAdmin123!",
  name: "Демо-администратор",
};

export const DEMO_PLAYER = {
  email: "demo-player@sitruk.demo",
  password: "DemoPlayer123!",
  name: "Демо-участник",
};

const auth = initAuth({
  baseUrl: process.env.APP_URL ?? "http://localhost:3000",
  productionUrl: process.env.APP_URL ?? "http://localhost:3000",
  secret: process.env.AUTH_SECRET,
});

async function ensureUser(account: { email: string; password: string; name: string }) {
  const existing = await db.query.user.findFirst({
    where: eq(User.email, account.email),
  });
  if (existing) {
    console.log(`Уже существует: ${account.email}`);
    return existing;
  }

  const result = await auth.api.signUpEmail({
    body: {
      email: account.email,
      password: account.password,
      name: account.name,
    },
  });
  console.log(`Создан: ${account.email}`);
  return result.user;
}

async function main(): Promise<void> {
  const admin = await ensureUser(DEMO_ADMIN);
  await ensureUser(DEMO_PLAYER);

  await db
    .insert(AppAdmin)
    .values({ userId: admin.id, role: "admin" })
    .onConflictDoNothing({ target: AppAdmin.userId });
  console.log(`Роль admin выдана: ${DEMO_ADMIN.email}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
