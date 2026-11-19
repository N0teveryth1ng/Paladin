import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Timing bounds are pre-registered for a single Node process. Running test
    // files sequentially keeps the performance measurement free of contention
    // from other layout work, without changing any threshold.
    fileParallelism: false,
    reporters: ['default'],
  },
});
