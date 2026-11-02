import { defineConfig } from "vitest/config";

// Unit run: offline, in-memory repos. Integration tests hit the real Supabase (`pnpm test:int`).
export default defineConfig({ test: { exclude: ["**/*.int.test.ts", "**/node_modules/**"] } });
