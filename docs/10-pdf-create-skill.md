# The `pdf:create` skill

> Chapter 10 of the [repository docs](../README.md#repository-docs).

`pdf:create` generates beautiful, brand-themed, multi-page PDFs — reports,
research docs, six-pagers, playbooks — from structured content. It is the
plugin's first **bundled-asset** skill: alongside its [`SKILL.md`](../claude-plugins/autopilot/skills/pdf:create/SKILL.md)
it ships a self-contained Node sub-project (`renderer/`) built on
`@react-pdf/renderer` (direct rendering, no headless browser). This chapter
documents the machinery that makes it work and stay decoupled — read it before
changing the skill's layout, its dependency story, or the monorepo's workspace
and formatting config.

## Render pipeline

The skill keeps rendering out of the model's context: Claude only assembles a
small content JSON, and a Node script ([`render.tsx`](../claude-plugins/autopilot/skills/pdf:create/renderer/render.tsx))
deterministically turns it into a themed PDF.

```text
┌────────────────┐
│     Claude     │
└───────┬────────┘
        │ ①
        ▼
┌────────────────┐
│  content.json  │
└───────┬────────┘
        │ ②
        ▼
┌────────────────┐
│   render.tsx   │
└───────┬────────┘
        │ ③
        ▼
┌────────────────┐  ④   ┌────────────────┐
│  Zod validate  │      │   design.md    │
└───────┬────────┘      │   (optional)   │
        │               └───────┬────────┘
        ▼                       │ ④
┌────────────────┐◀─────────────┘
│ theme resolve  │
└───────┬────────┘
        │ ⑤
        ▼
┌────────────────┐
│ register fonts │
└───────┬────────┘
        │ ⑥
        ▼
┌────────────────┐
│  pick template │
└───────┬────────┘
        │ ⑦
        ▼
┌────────────────┐
│   output.pdf   │
└────────────────┘
```

**Flow Legend:**

- ① Claude assembles a content JSON (the `Write` tool) from the user's content and template choice.
- ② The content JSON path is passed to `render.tsx`, run with `node --import tsx`.
- ③ `render.tsx` validates the content JSON against `contentSchema` (Zod); a failure exits non-zero with the offending field.
- ④ Theme resolution: with a `design.md`, `loadDesignMd` → `resolveTokenRefs` → `makeTheme`; otherwise the bundled `defaultTheme`.
- ⑤ `assertFontsResolve` fails loudly on a missing or variable font, then `registerFonts` registers any custom faces.
- ⑥ The template named by the content (or `--template`) is looked up in `templateRegistry`.
- ⑦ `renderToFile` writes the output `.pdf`.

## Skill layout

```text
claude-plugins/autopilot/skills/pdf:create/
├── SKILL.md                 # the only file the plugin validator sees
└── renderer/                # self-contained Node project (colon-free path)
    ├── package.json         # private, exact-pinned deps; not a workspace member
    ├── package-lock.json    # committed for deterministic installs
    ├── install-check.mjs    # idempotent on-demand installer (marker-guarded)
    ├── render.tsx           # CLI entry
    ├── lib/paths.ts         # import.meta.url self-location
    ├── schemas/             # contentSchema, blockSchema, chartSpecSchema (Zod)
    ├── theme/               # design.md loader, token resolver, makeTheme, fonts
    ├── components/          # primitives, layout, Table, Chart, TOC, BlockRenderer
    ├── templates/           # report, researchDoc, sixPager, playbook + registry
    ├── assets/fonts/        # drop-in dir for brand fonts (default uses std fonts)
    ├── references/          # content-schema + design-md docs and examples
    └── test/                # node:test unit + smoke-render tests
```

The skill folder keeps the colon (`pdf:create`) to match the other 15 colon
skills, but the Node sub-project lives under a **colon-free `renderer/`** so
`npm`/`node` never run from a path containing `:` (npm warns and may misparse a
colon in a script path).

## Portability — works without the plugin

The skill is a movable, hermetic unit. To use it outside this plugin, copy the
`pdf:create/` folder into `~/.claude/skills/`; it behaves identically.

- **Self-location.** [`lib/paths.ts`](../claude-plugins/autopilot/skills/pdf:create/renderer/lib/paths.ts)
  resolves every bundled path from `import.meta.url` — never `process.cwd()` or a
  plugin-only env var — so fonts and examples resolve wherever the folder is copied.
- **No cross-dependencies.** The `SKILL.md` makes no `Skill(autopilot:*)` calls
  and lists no `MCP(...)` tools, so nothing breaks when the plugin is absent.
- **On-demand install.** [`install-check.mjs`](../claude-plugins/autopilot/skills/pdf:create/renderer/install-check.mjs)
  runs `npm install --omit=dev` only when its `node_modules/.pdf-create-ok` marker
  is missing, so the first render bootstraps dependencies (~30s) and every later
  render is instant and offline-capable. The runtime dependency set is pure-JS
  (no native builds), keeping installs portable.
- **Node requirement.** Rendering needs a local Node runtime (18–22 recommended;
  it warns on newer majors). It runs in local Claude Code and in Claude Desktop
  with a local runtime, but **not** in the hosted claude.ai web sandbox, which has
  no Node toolchain. If `node` is absent the skill says so rather than failing
  cryptically.

## Decoupling from the monorepo

The renderer is a Node + React sub-project inside a Bun + TypeScript monorepo. It
is deliberately invisible to the workspace tooling — **do not "fix" these
exclusions**:

- **Bun workspace.** The root `workspaces` globs are single-level
  (`claude-plugins/*`), so a sub-project four levels deeper is never a member; a
  defensive `!claude-plugins/autopilot/skills/**` negation guards against a future
  glob broadening. React is never hoisted into the root `bun.lock`.
- **Turbo / typecheck.** Turbo runs tasks only in workspace members, so it never
  discovers the renderer; the monorepo `typecheck` does not cover it. The
  renderer's own tests run with `node --import tsx --test` (not wired into CI).
- **Prettier.** Root `format`/`format:check` target `**/*.{md,json}`, which would
  otherwise match the renderer's JSON/Markdown and lockfile, so `renderer/` is
  listed in `.prettierignore`.
- **Licenses audit.** The licenses workflow triggers on any `**/package.json` but
  no-ops here, because its audit is gated on a repo-root `licenses:audit` script
  that does not exist.

## Inputs

Two contracts, both documented and exemplified inside the renderer:

- **Content JSON** — the document model Claude writes. Full schema in
  [`references/content-schema.md`](../claude-plugins/autopilot/skills/pdf:create/renderer/references/content-schema.md),
  worked example in
  [`references/examples/report.content.json`](../claude-plugins/autopilot/skills/pdf:create/renderer/references/examples/report.content.json).
- **design.md** — an optional brand spec whose tokens become the theme. Format
  and token-mapping rules in
  [`references/design-md-spec.md`](../claude-plugins/autopilot/skills/pdf:create/renderer/references/design-md-spec.md).

## Fonts

The default theme uses the standard PDF families (`Helvetica`, `Times-Roman`,
`Courier`) — no binary font files ship in the repo, and there is zero
font-resolution risk offline. Brand fonts are opt-in: drop static-weight
`.ttf`/`.woff` files in `renderer/assets/fonts/` and reference them from a
`design.md`. Variable fonts are rejected (the PDF format needs discrete weights),
and every referenced font is verified before rendering.

## Versioning

Adding the skill is a `feat`. Per the [release field spec](./06-release-field.md),
the `claude-plugin` version source is `plugin.json` and the version bump is made
by the conventional-commit-driven release pipeline in the release PR — not in the
feature PR.
