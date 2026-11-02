import { defineConfig } from "vitest/config";

// Unit run: integration tests hit the real Supabase project and run with `pnpm test:int`.
export default defineConfig({ test: { exclude: ["**/*.int.test.ts", "**/node_modules/**"] } });
