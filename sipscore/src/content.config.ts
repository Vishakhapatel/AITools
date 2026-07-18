import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Blog posts live as .md / .mdx files in src/content/blog/.
// Add a new article by dropping a file there — no code changes needed.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
