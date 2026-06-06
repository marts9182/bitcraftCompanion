import { z } from "zod";

export const frontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  date: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be a parseable date"),
  tags: z.array(z.string()).default([]),
  author: z.string().default("BitCraft Companion"),
  draft: z.boolean().default(false),
  cover: z.string().optional(),
});

export type Frontmatter = z.infer<typeof frontmatterSchema>;

/** Validate raw frontmatter; throws loudly (fails the build) on invalid content. */
export function parseFrontmatter(raw: unknown): Frontmatter {
  const r = frontmatterSchema.safeParse(raw);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`Invalid post frontmatter: ${issues}`);
  }
  return r.data;
}
