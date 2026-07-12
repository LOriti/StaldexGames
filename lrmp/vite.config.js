import { defineConfig } from 'vite';

export default defineConfig({
  // Served unlisted at staldex.com/lrmp. The built output is committed to ../site/lrmp so it
  // deploys with the rest of the static site — after changing src/, run `npm run build` and
  // commit the result (see DEPLOY.md at the repo root).
  base: '/lrmp/',
  build: { outDir: '../site/lrmp', emptyOutDir: true, target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
