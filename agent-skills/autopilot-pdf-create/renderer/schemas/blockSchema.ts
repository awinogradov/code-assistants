import { z } from "zod";

import { chartSpecSchema } from "./chartSpecSchema";

/** An inline run of text with optional emphasis or a link. */
export const inlineMarkSchema = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  code: z.boolean().optional(),
  /** External link target. */
  href: z.string().url().optional(),
  /** Internal link to a section `id` (rendered as `#<anchor>`). */
  anchor: z.string().optional(),
});
export type InlineMark = z.infer<typeof inlineMarkSchema>;

/** Rich text is an ordered list of inline runs. */
export const richTextSchema = z.array(inlineMarkSchema).min(1);
export type RichText = z.infer<typeof richTextSchema>;

export const headingBlockSchema = z.object({
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string(),
  id: z.string().optional(),
});

export const paragraphBlockSchema = z.object({
  type: z.literal("paragraph"),
  content: richTextSchema,
});

export const listBlockSchema = z.object({
  type: z.literal("list"),
  ordered: z.boolean().default(false),
  items: z.array(richTextSchema).min(1),
});

export const tableColumnSchema = z.object({
  header: z.string(),
  /** Column width as a fraction of table width (0–1); evenly split when omitted. */
  width: z.number().min(0).max(1).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
});

export const tableBlockSchema = z.object({
  type: z.literal("table"),
  columns: z.array(tableColumnSchema).min(1),
  rows: z.array(z.array(richTextSchema)).min(1),
  caption: z.string().optional(),
});

/** SVG sources are rejected — @react-pdf/renderer's <Image> cannot decode them. */
const rasterImageSrc = z
  .string()
  .refine((value) => !/^data:image\/svg\+xml/i.test(value) && !/\.svg($|[?#])/i.test(value), {
    message: "SVG images are unsupported by <Image>; pre-render to PNG or JPG",
  });

export const figureBlockSchema = z.object({
  type: z.literal("figure"),
  src: rasterImageSrc,
  alt: z.string(),
  caption: z.string().optional(),
  /** Image width as a fraction of the content width (0–1). */
  widthPct: z.number().min(0).max(1).default(1),
});

export const chartBlockSchema = z.object({
  type: z.literal("chart"),
  spec: chartSpecSchema,
  caption: z.string().optional(),
});

export const calloutBlockSchema = z.object({
  type: z.literal("callout"),
  tone: z.enum(["info", "success", "warning", "danger", "neutral"]).default("info"),
  title: z.string().optional(),
  content: richTextSchema,
});

export const pullQuoteBlockSchema = z.object({
  type: z.literal("pullquote"),
  text: z.string(),
  attribution: z.string().optional(),
});

export const pageBreakBlockSchema = z.object({
  type: z.literal("pagebreak"),
});

/** The block model — a discriminated union on `type`. */
export const blockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  paragraphBlockSchema,
  listBlockSchema,
  tableBlockSchema,
  figureBlockSchema,
  chartBlockSchema,
  calloutBlockSchema,
  pullQuoteBlockSchema,
  pageBreakBlockSchema,
]);
export type Block = z.infer<typeof blockSchema>;
