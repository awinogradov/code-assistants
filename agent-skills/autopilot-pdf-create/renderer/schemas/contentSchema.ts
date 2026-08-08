import { z } from "zod";

import { blockSchema } from "./blockSchema";

export const metadataSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  authors: z.array(z.string()).default([]),
  date: z.string().optional(),
  org: z.string().optional(),
  confidentiality: z.string().optional(),
});
export type Metadata = z.infer<typeof metadataSchema>;

export const coverSchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  footnote: z.string().optional(),
});
export type Cover = z.infer<typeof coverSchema>;

export const sectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Heading depth in the table of contents (1 = top level, 2 = nested). */
  tocLevel: z.union([z.literal(1), z.literal(2)]).default(1),
  blocks: z.array(blockSchema).min(1),
});
export type Section = z.infer<typeof sectionSchema>;

export const templateNameSchema = z.enum(["report", "researchDoc", "sixPager", "playbook"]);
export type TemplateName = z.infer<typeof templateNameSchema>;

/** The single document object the renderer consumes — the stable Claude↔renderer contract. */
export const contentSchema = z.object({
  schemaVersion: z.literal(1),
  template: templateNameSchema,
  metadata: metadataSchema,
  cover: coverSchema.optional(),
  toc: z.boolean().default(true),
  sections: z.array(sectionSchema).min(1),
  appendix: z.array(sectionSchema).default([]),
});
export type Content = z.infer<typeof contentSchema>;
