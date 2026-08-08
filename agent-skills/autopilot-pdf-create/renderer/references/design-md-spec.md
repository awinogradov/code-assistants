# design.md theming

A `design.md` carries a brand's visual identity as YAML front-matter design
tokens plus a human-readable body. The renderer parses the front-matter,
resolves `{path.to.token}` references, validates it, and overlays it onto the
default theme — so a brand file only declares what differs. See
`examples/brand.design.md`.

## Front-matter tokens

| Key          | Shape                                                              | Maps to                                   |
| ------------ | ----------------------------------------------------------------- | ----------------------------------------- |
| `name`       | string                                                            | Theme name.                               |
| `version`    | string                                                            | Informational.                            |
| `colors`     | flat or nested map of name → hex (or `{token}` ref)               | The document palette.                     |
| `typography` | map of name → `{ fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, textTransform, fontStyle, color }` | Text styles. |
| `spacing`    | map of name → length                                              | Spacing scale (matching keys override).   |
| `rounded`    | map of name → length                                              | Corner radii (matching keys override).    |
| `fonts`      | array of `{ family, weights, italics }`                           | Custom font registration.                 |

### Token references

Any value may be a `{path.to.token}` reference (or embed one). References are
resolved before validation; an unknown or cyclic reference fails the render
loudly (exit 4).

```yaml
colors:
  brand:
    primary: "#6d28d9"
  primary: "{colors.brand.primary}"
```

### Color mapping

Palette slots are filled by matching token names (case-insensitive, by full
dot-path or leaf name), with sensible fallbacks: `background`, `surface`, `text`,
`muted`, `primary`, `onPrimary`, `border`, `accent`, and tones `info`, `success`,
`warning`, `danger`, `neutral`. Unmatched colors are ignored; unfilled slots keep
their default.

### Typography mapping

Slots `display`, `h1`, `h2`, `h3`, `body`, `caption`, `quote`, `label`, `mono`
are matched by name (with aliases — e.g. `heading1`→`h1`, `paragraph`→`body`,
`code`→`mono`). `fontSize`/`letterSpacing` accept `px`, `pt`, `rem`, `em`, or a
number (points); `1rem` = `12pt`. `lineHeight` is a unitless multiple.

### Lengths

`px` → ×0.75 pt, `rem` → ×12 pt, `em` → × the element's size, bare number → pt.

## Fonts

The default theme uses standard PDF families (`Helvetica`, `Times-Roman`,
`Courier`) — no files needed. For a custom typeface, drop static-weight `.ttf`/
`.woff` files in `assets/fonts/` and declare them:

```yaml
fonts:
  - family: Inter
    weights:
      "400": Inter-Regular.ttf
      "700": Inter-Bold.ttf
    italics:
      "400": Inter-Italic.ttf
typography:
  body: { fontFamily: Inter }
```

Variable fonts are rejected — the PDF format needs discrete weights. The renderer
verifies every referenced font exists before rendering and fails loudly (exit 5)
on a missing, remote, or variable font, rather than hanging.
