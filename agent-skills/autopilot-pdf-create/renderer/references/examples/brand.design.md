---
version: alpha
name: Acme Brand
colors:
  brand:
    primary: "#6d28d9"
    secondary: "#db2777"
  primary: "{colors.brand.primary}"
  accent: "{colors.brand.secondary}"
  background: "#ffffff"
  surface: "#f5f3ff"
  text: "#111827"
  muted: "#6b7280"
  border: "#e5e7eb"
typography:
  body:
    fontFamily: Helvetica
    fontSize: 11
    lineHeight: 1.5
  h1:
    fontFamily: Helvetica
    fontSize: 24
    fontWeight: 700
  display:
    fontFamily: Helvetica
    fontSize: 34
    fontWeight: 700
spacing:
  md: 14
---

# Acme Brand

A small example `design.md` for the `pdf:create` skill. It demonstrates token
references (`{colors.brand.primary}`), a partial typography scale, and a spacing
override. Everything not specified here falls back to the renderer's default
theme, so a brand file only needs to declare what differs.

## Colors

The primary and accent colors reference the brand palette via `{path.to.token}`
syntax, which the loader resolves before building the theme.

## Typography

Uses the standard `Helvetica` family at brand sizes. To use a custom typeface,
add a `fonts` mapping and drop static-weight files in `assets/fonts/`.
