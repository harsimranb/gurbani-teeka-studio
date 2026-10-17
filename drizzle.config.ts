import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/server/db/schema.ts",
  out: "./lib/server/db/migrations",
});
