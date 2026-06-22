import assert from "node:assert/strict";
import { test } from "node:test";

import { contentSchema } from "../schemas/contentSchema";

const valid = {
  schemaVersion: 1,
  template: "report",
  metadata: { title: "Test" },
  sections: [
    { id: "s", title: "Section", blocks: [{ type: "paragraph", content: [{ text: "hi" }] }] },
  ],
};

test("parses a minimal valid document and applies defaults", () => {
  const parsed = contentSchema.parse(valid);
  assert.equal(parsed.toc, true);
  assert.deepEqual(parsed.appendix, []);
  assert.equal(parsed.metadata.authors.length, 0);
});

test("rejects an unknown block type", () => {
  assert.throws(() =>
    contentSchema.parse({
      ...valid,
      sections: [{ id: "s", title: "S", blocks: [{ type: "bogus" }] }],
    }),
  );
});

test("rejects an SVG figure source", () => {
  assert.throws(() =>
    contentSchema.parse({
      ...valid,
      sections: [{ id: "s", title: "S", blocks: [{ type: "figure", src: "diagram.svg", alt: "x" }] }],
    }),
  );
});

test("rejects an empty section", () => {
  assert.throws(() =>
    contentSchema.parse({ ...valid, sections: [{ id: "s", title: "S", blocks: [] }] }),
  );
});

test("parses every block type", () => {
  const parsed = contentSchema.parse({
    ...valid,
    sections: [
      {
        id: "s",
        title: "S",
        blocks: [
          { type: "heading", level: 2, text: "H" },
          { type: "paragraph", content: [{ text: "p" }] },
          { type: "list", items: [[{ text: "i" }]] },
          { type: "table", columns: [{ header: "c" }], rows: [[[{ text: "v" }]]] },
          { type: "figure", src: "image.png", alt: "a" },
          { type: "chart", spec: { kind: "bar", series: [{ name: "n", points: [{ x: "a", y: 1 }] }] } },
          { type: "callout", content: [{ text: "c" }] },
          { type: "pullquote", text: "q" },
          { type: "pagebreak" },
        ],
      },
    ],
  });
  assert.equal(parsed.sections[0].blocks.length, 9);
});
