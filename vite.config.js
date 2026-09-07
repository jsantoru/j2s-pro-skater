import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // QA screenshots must not reload the disposable page halfway through its pose sweep.
    watch: { ignored: ['**/screenshots/**', '**/dist/**'] },
  },
});
