import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Backend tests (db.ts / ratings.ts / route.ts) run under node:sqlite, so the
// default environment stays "node" -- frontend test files opt into jsdom
// individually via a `// @vitest-environment jsdom` docblock.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
});
