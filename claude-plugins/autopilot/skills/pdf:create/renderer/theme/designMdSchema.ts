import { z } from "zod";

/**
 * Lenient schema for design.md YAML front-matter. The spec is alpha and tools
 * emit varied shapes, so unknown keys pass through and most fields are optional;
 * `makeTheme` overlays whatever is present onto the complete default theme.
 */
const lengthValue = z.union([z.string(), z.number()]);

export const typographyTokenSchema = z.object({
  fontFamily: z.string().optional(),
  fontSize: lengthValue.optional(),
  fontWeight: lengthValue.optional(),
  lineHeight: lengthValue.optional(),
  letterSpacing: lengthValue.optional(),
  textTransform: z.string().optional(),
  fontStyle: z.string().optional(),
  color: z.string().optional(),
});
export type TypographyToken = z.infer<typeof typographyTokenSchema>;

/** A custom font family: weight → bundled file name (resolved under assets/fonts). */
export const fontFaceTokenSchema = z.object({
  family: z.string(),
  weights: z.record(z.string(), z.string()).optional(),
  italics: z.record(z.string(), z.string()).optional(),
});

/** Colors may be flat (`primary: "#..."`) or nested (`brand: { primary: "#..." }`). */
const colorTree: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.record(z.string(), colorTree)]),
);

export const designMdSchema = z
  .object({
    version: z.string().optional(),
    name: z.string().optional(),
    colors: z.record(z.string(), colorTree).optional(),
    typography: z.record(z.string(), typographyTokenSchema).optional(),
    spacing: z.record(z.string(), lengthValue).optional(),
    rounded: z.record(z.string(), lengthValue).optional(),
    fonts: z.array(fontFaceTokenSchema).optional(),
  })
  .passthrough();

export type DesignMdTokens = z.infer<typeof designMdSchema>;
