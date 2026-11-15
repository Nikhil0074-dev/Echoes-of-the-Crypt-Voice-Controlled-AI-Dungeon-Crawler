import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@dungeon/shared': p('./packages/shared/src/index.ts'),
      '@dungeon/game-core': p('./packages/game-core/src/index.ts'),
      phaser: p('./node_modules/phaser/dist/phaser.js'),
      '@dungeon/ai-engine': p('./packages/ai-command-engine/src/index.ts')
    }
  },
  test: {
    include: ['packages/**/tests/**/*.test.{ts,tsx}', 'apps/**/tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 15000
  }
});
