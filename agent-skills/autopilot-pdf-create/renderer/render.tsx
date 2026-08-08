import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import { renderToFile } from "@react-pdf/renderer";
import { createElement } from "react";
import { ZodError } from "zod";

import { ThemeContext } from "./theme/themeContext";
import { assertFontsResolve } from "./theme/assertFontsResolve";
import { contrastRatio } from "./theme/contrast";
import { registerFonts } from "./theme/registerFonts";
import { resolveTheme } from "./theme/loadDesignMd";
import { contentSchema, templateNameSchema } from "./schemas/contentSchema";
import { createPageNumberStore } from "./render/pageNumberStore";
import { contentError, exitCodeFor, renderError, usageError } from "./render/errors";
import { templateRegistry } from "./templates/templateRegistry";

const usage =
  "Usage: render.tsx --content <content.json> --out <output.pdf> " +
  "[--design <design.md>] [--template <report|researchDoc|sixPager|playbook>] [--strict-contrast]";

function parseCliArgs(): {
  content: string;
  out: string;
  design?: string;
  template?: string;
  strictContrast: boolean;
} {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        content: { type: "string" },
        out: { type: "string" },
        design: { type: "string" },
        template: { type: "string" },
        "strict-contrast": { type: "boolean", default: false },
      },
    });
  } catch (error) {
    throw usageError(`${(error as Error).message}\n${usage}`);
  }
  const { values } = parsed;
  if (!values.content || !values.out) throw usageError(`--content and --out are required.\n${usage}`);
  return {
    content: values.content,
    out: values.out,
    design: values.design,
    template: values.template,
    strictContrast: values["strict-contrast"] ?? false,
  };
}

function loadContent(path: string): ReturnType<typeof contentSchema.parse> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw contentError(`Could not read content JSON at ${path}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw contentError(`Invalid JSON in ${path}: ${(error as Error).message}`);
  }
  try {
    return contentSchema.parse(json);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors
        .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n");
      throw contentError(`Content JSON failed validation:\n${issues}`);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const content = loadContent(args.content);

  const templateName = args.template ?? content.template;
  const validTemplate = templateNameSchema.safeParse(templateName);
  if (!validTemplate.success) {
    throw usageError(
      `Unknown template "${templateName}". Valid: ${templateNameSchema.options.join(", ")}.`,
    );
  }

  const theme = resolveTheme(args.design);

  const ratio = contrastRatio(theme.text.body.color ?? theme.colors.text, theme.colors.background);
  if (ratio !== null && ratio < 4.5) {
    const message = `Body text vs background contrast is ${ratio.toFixed(2)}:1 (WCAG AA wants >= 4.5:1).`;
    if (args.strictContrast) throw renderError(message);
    console.warn(`pdf:create: ${message}`);
  }

  assertFontsResolve(theme);
  registerFonts(theme);

  if (validTemplate.data === "sixPager" && content.sections.length !== 6) {
    console.warn(
      `pdf:create: sixPager has ${content.sections.length} sections; the format expects 6 ` +
        `(Introduction, Goals, Tenets, State of the Business, Lessons Learned, Strategic Priorities).`,
    );
  }

  const store = createPageNumberStore();
  const Template = templateRegistry[validTemplate.data];
  const element = createElement(
    ThemeContext.Provider,
    { value: theme },
    createElement(Template, { content, store }),
  );

  mkdirSync(dirname(args.out), { recursive: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          renderError(
            "Rendering timed out after 60s — likely a missing/variable font or a block taller than a page.",
          ),
        ),
      60_000,
    );
  });
  try {
    await Promise.race([renderToFile(element, args.out), watchdog]);
  } catch (error) {
    throw renderError(`Failed to render PDF: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  const sizeKb = (statSync(args.out).size / 1024).toFixed(1);
  console.log(`pdf:create: wrote ${args.out} (${sizeKb} KB)`);
}

main().catch((error: unknown) => {
  console.error(`pdf:create: ${(error as Error).message}`);
  process.exit(exitCodeFor(error));
});
