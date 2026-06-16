import { defineConfig } from "drizzle-kit";

// Loaded by drizzle-kit CLI; reads DATABASE_URL from the environment.
// Run migrations with: npm run db:push  (or db:generate + db:migrate)
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
