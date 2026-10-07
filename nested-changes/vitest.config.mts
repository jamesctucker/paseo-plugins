import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // git subprocesses on macOS can be slow to spawn under load.
    testTimeout: 20000,
  },
});
