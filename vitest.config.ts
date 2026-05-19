import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "packages/**/*.test.ts", "apps/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@kansha/db": "/packages/db/src/index.ts",
      "@kansha/agent": "/packages/agent/src/index.ts",
      "@kansha/types": "/packages/types/src/index.ts",
      "@kansha/ui": "/packages/ui/src/index.ts"
    }
  }
});
