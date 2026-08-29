import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.postgresql.prisma",
  migrations: { path: "prisma/migrations-postgresql" },
  // Generation and static validation do not require a credential. A live push
  // uses POSTGRES_TEST_DATABASE_URL supplied only by the operator/CI runtime.
  datasource: { url: process.env.POSTGRES_TEST_DATABASE_URL ?? "postgresql://127.0.0.1/edy_helpdesk_test" },
});
