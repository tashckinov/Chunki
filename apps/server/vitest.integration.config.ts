import { defineConfig } from 'vitest/config';

// Real Postgres required — see README "Integration tests" section.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    setupFiles: ['dotenv/config'],
  },
});
