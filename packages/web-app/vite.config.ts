import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  // @ts-expect-error - consumed by Vitest; not part of Vite UserConfig typings.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  server: {
    port: 8080,
    strictPort: true,
    allowedHosts: true,
  },
});
