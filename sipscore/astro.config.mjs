// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  // Keep in sync with SITE.url in src/consts.ts. Drives sitemap.xml and absolute URLs.
  site: 'https://kitnasip.in',
  integrations: [sitemap(), mdx()],
});