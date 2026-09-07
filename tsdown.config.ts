import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  outDir: 'dist',
  format: 'esm',
  platform: 'node',
  dts: false,
  clean: true,
});
