import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["ts/__tests__/**/*.test.ts"],
  },
});
