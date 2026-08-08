# Bundled fonts

The default theme renders with the **standard PDF font families** — `Helvetica`,
`Times-Roman`, and `Courier` — which are built into every PDF reader. This is a
deliberate choice: no binary font files ship in the repo, the skill works
offline with zero font-resolution risk, and it stays small to copy standalone.

## Adding brand fonts

To use a custom typeface, drop its **static-weight** `.ttf` or `.woff` files in
this directory and reference them from a `design.md`:

```yaml
fonts:
  - family: Inter
    weights:
      "400": Inter-Regular.ttf
      "700": Inter-Bold.ttf
    italics:
      "400": Inter-Italic.ttf
typography:
  body:
    fontFamily: Inter
  h1:
    fontFamily: Inter
    fontWeight: 700
```

File names in `weights`/`italics` resolve against this directory. Absolute paths
are also accepted.

> Variable fonts are **not** supported — the PDF format needs discrete weights,
> and `@react-pdf/renderer` fails on them. Ship one file per weight. The renderer
> validates every referenced font before rendering and fails loudly if a family
> is missing, remote, or looks like a variable font.
