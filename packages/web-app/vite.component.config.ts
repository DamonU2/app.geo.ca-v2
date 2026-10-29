import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit(), svelteTesting()],
  // @ts-expect-error - consumed by Vitest; not part of Vite UserConfig typings.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.component.test.ts'],
  },
});
