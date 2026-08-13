// @ts-check
import { defineConfig } from 'astro/config';
import styletrace from 'astro-styletrace';

export default defineConfig({
  integrations: [styletrace()],
});
