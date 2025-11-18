import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 600000, // 10 minutes for full e2e test
    hookTimeout: 60000, // 1 minute for setup/teardown
  },
});

