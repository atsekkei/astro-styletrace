// @ts-check
import { defineConfig } from 'astro/config';
import caliper from 'astro-caliper';

export default defineConfig({
  integrations: [caliper()],
});
