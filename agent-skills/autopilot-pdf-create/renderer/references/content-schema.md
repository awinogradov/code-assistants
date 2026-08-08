# Content JSON schema

The renderer consumes one JSON document validated by `schemas/contentSchema.ts`.
Produce a file that conforms to this shape, then pass its path with `--content`.
A complete worked example is in `examples/report.content.json`.

## Top level

| Field           | Type                                                  | Required | Notes                                            |
| --------------- | ---------------------------------------------------- | -------- | ------------------------------------------------ |
| `schemaVersion` | `1`                                                  | yes      | Always `1`.                                      |
| `template`      | `report` \| `researchDoc` \| `sixPager` \| `playbook` | yes      | Overridable with `--template`.                   |
| `metadata`      | object                                               | yes      | See below.                                       |
| `cover`         | object                                               | no       | Cover page content; falls back to `metadata`.    |
| `toc`           | boolean                                              | no       | Default `true`. Table of contents.               |
| `sections`      | array of section                                     | yes      | At least one.                                    |
| `appendix`      | array of section                                     | no       | Rendered after a page break.                     |

### `metadata`

`title` (required), `subtitle`, `authors` (string array), `date`, `org`,
`confidentiality`. `title` is used in the PDF metadata and the running footer.

### `cover`

`title` (required), `eyebrow`, `subtitle`, `footnote`. Shown on the cover page
(report, researchDoc, playbook). The six-pager uses a memo header instead.

### `section`

`id` (required, unique — it is the internal link/anchor target), `title`
(required), `tocLevel` (`1` or `2`, default `1`), `blocks` (at least one).

## Blocks

Every block has a `type`. The union:

- **heading** — `level` (1–3), `text`, optional `id`. For sub-headings inside a
  section; the section title is rendered automatically.
- **paragraph** — `content`: rich text (see below).
- **list** — `ordered` (boolean, default false), `items`: array of rich text.
- **table** — `columns` (`{ header, width?, align? }`; `width` is a 0–1 fraction),
  `rows` (array of rows; each row is an array of rich-text cells), `caption?`.
- **figure** — `src` (PNG/JPG path or data URI; **SVG is rejected**), `alt`,
  `caption?`, `widthPct` (0–1, default 1).
- **chart** — `spec` (see Charts), `caption?`.
- **callout** — `tone` (`info` \| `success` \| `warning` \| `danger` \| `neutral`),
  `title?`, `content`: rich text.
- **pullquote** — `text`, `attribution?`.
- **pagebreak** — forces a new page.

### Rich text

An array of runs: `{ text, bold?, italic?, code?, href?, anchor? }`. `href` is an
external link; `anchor` links to a section `id` within the document.

```json
[{ "text": "Revenue grew " }, { "text": "18%", "bold": true }, { "text": " QoQ." }]
```

### Charts

`spec` fields: `kind` (`bar` \| `line` \| `area` \| `pie` \| `donut` \| `stackedBar`),
`series` (array of `{ name, points: [{ x, y }] }`), `xLabel?`, `yLabel?`,
`width?` (default 480), `height?` (default 280), `palette?` (array of hex colors).
For `pie`/`donut`, the first series' points are the slices.

```json
{
  "type": "chart",
  "spec": {
    "kind": "bar",
    "series": [{ "name": "Revenue", "points": [{ "x": "Q1", "y": 120 }, { "x": "Q2", "y": 142 }] }]
  },
  "caption": "Quarterly revenue."
}
```

## Tips

- Put styling in the theme (design.md), not the content. The content carries
  meaning; the theme carries appearance.
- Give every section a stable, unique `id` so the TOC, bookmarks, and internal
  links resolve.
- For a six-pager, provide exactly six sections (Introduction, Goals, Tenets,
  State of the Business, Lessons Learned, Strategic Priorities); push tables and
  charts into the `appendix`.
