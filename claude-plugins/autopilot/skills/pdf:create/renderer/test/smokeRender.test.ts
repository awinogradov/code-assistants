import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

import { contentSchema } from "../schemas/contentSchema";
import type { TemplateName } from "../schemas/contentSchema";
import { createPageNumberStore } from "../render/pageNumberStore";
import { assertFontsResolve } from "../theme/assertFontsResolve";
import { defaultTheme } from "../theme/defaultTheme";
import { examplesDir } from "../lib/paths";
import { registerFonts } from "../theme/registerFonts";
import { ThemeContext } from "../theme/themeContext";
import { templateRegistry } from "../templates/templateRegistry";

async function renderToPdf(content: ReturnType<typeof contentSchema.parse>): Promise<Buffer> {
  assertFontsResolve(defaultTheme);
  registerFonts(defaultTheme);
  const store = createPageNumberStore();
  const Template = templateRegistry[content.template];
  const element = createElement(
    ThemeContext.Provider,
    { value: defaultTheme },
    createElement(Template, { content, store }),
  );
  return renderToBuffer(element);
}

test("renders the example report to a valid PDF", async () => {
  const raw = readFileSync(join(examplesDir, "report.content.json"), "utf8");
  const content = contentSchema.parse(JSON.parse(raw));
  const buffer = await renderToPdf(content);
  assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(buffer.length > 3000, `expected a non-trivial PDF, got ${buffer.length} bytes`);
});

const templates: TemplateName[] = ["report", "researchDoc", "sixPager", "playbook"];
for (const template of templates) {
  test(`renders the ${template} template`, async () => {
    const content = contentSchema.parse({
      schemaVersion: 1,
      template,
      metadata: { title: "Smoke Test", authors: ["Tester"], org: "Acme", date: "2026" },
      cover: { title: "Smoke Test" },
      sections: [
        {
          id: "alpha",
          title: "Alpha",
          blocks: [
            { type: "paragraph", content: [{ text: "Hello " }, { text: "world", bold: true }] },
            { type: "list", items: [[{ text: "one" }], [{ text: "two" }]] },
            { type: "callout", tone: "info", content: [{ text: "Note." }] },
          ],
        },
        {
          id: "beta",
          title: "Beta",
          blocks: [
            {
              type: "table",
              columns: [{ header: "Key" }, { header: "Value", align: "right" }],
              rows: [[[{ text: "a" }], [{ text: "1" }]]],
            },
            {
              type: "chart",
              spec: { kind: "bar", series: [{ name: "S", points: [{ x: "Q1", y: 10 }, { x: "Q2", y: 20 }] }] },
            },
          ],
        },
      ],
      appendix: [
        { id: "app", title: "Appendix A", blocks: [{ type: "paragraph", content: [{ text: "end" }] }] },
      ],
    });
    const buffer = await renderToPdf(content);
    assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(buffer.length > 2000);
  });
}
