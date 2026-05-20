---
name: ascii-schemas
allowed-tools:
  - MCP(wiretext:*)
description: >-
  Generate ASCII schemas, diagrams, and UI wireframes using Unicode box-drawing
  characters (wiretext conventions). Use when creating architecture diagrams,
  entity-relationship models, database schemas, flow charts, deployment topologies,
  sequence diagrams, data flow visualizations, UI wireframes, screen mockups,
  or any visual schema in plans, documents, or conversations.
  Trigger on: "diagram", "schema", "ASCII art", "draw", "visualize", "architecture
  diagram", "ER diagram", "flow chart", "topology", "sequence diagram", "data flow",
  "wireframe", "mockup", "screen layout", "UI sketch", "page layout".
  Do NOT use for: code formatting, markdown tables, or image-based diagrams.
  If @wiretext/mcp server is connected, prefer its create_wireframe/render_wireframe
  tools for UI wireframes — they produce higher-fidelity output with 30+ components.
---

# ASCII Schemas

Generate ASCII schemas, diagrams, and UI wireframes using Unicode box-drawing characters following wiretext conventions. Output renders correctly in any monospace environment — terminals, markdown, code blocks, GitHub PRs, and plain text documents.

## When to Use

**Technical schemas:**

- Architecture diagrams in implementation plans
- Entity-relationship models for database design
- Deployment and infrastructure topologies
- Data flow and component interaction diagrams
- Sequence and timeline diagrams

**UI wireframes:**

- Screen mockups for feature planning
- Page layout prototypes
- Mobile app screen flows
- Dashboard and admin panel wireframes
- Component library documentation

## MCP Integration

If the `@wiretext/mcp` server is connected, prefer its tools for UI wireframes — they handle component positioning and rendering automatically:

- **`create_wireframe`** — returns an editable wiretext.app URL from wire objects
- **`render_wireframe`** — returns ASCII art from wire objects

Wire object format:

```json
{
  "type": "component",
  "componentType": "navbar",
  "position": { "col": 0, "row": 0 },
  "width": 50,
  "navItems": ["Home", "Products", "About"]
}
```

Available component types: `button`, `input`, `select`, `checkbox`, `radio`, `toggle`, `table`, `modal`, `browser`, `card`, `navbar`, `tabs`, `progress`, `avatar`, `divider`, `breadcrumb`, `list`, `stepper`, `rating`, `skeleton`, `alert`, `image`, `icon`.

Primitives: `box`, `text`, `line`, `arrow`.

Fall back to hand-drawn ASCII when the MCP server is not connected or for technical schemas (architecture, ER, topology, sequence diagrams).

## Core Rules

1. **Width guideline: 80 characters** for technical schemas. Wireframes may extend wider when layout requires it, but aim for minimal width
2. **Default border style: single** — use `┌─┐│└┘` as the default. Use rounded `╭─╮│╰╯` for mobile frames, chat bubbles, and softer cards. Use double `╔═╗║╚╝` for emphasis (invoices, highlighted pricing). Use heavy `┏━┓┃┗┛` for critical elements (deploy targets, warnings)
3. **Annotation-free diagrams** — never overlay prose on diagram borders or arrows. Put explanations in a separate "Flow Legend" section below the diagram
4. **Strip trailing whitespace** — no trailing spaces on any line
5. **Monospace assumed** — every character occupies exactly one grid cell
6. **Wrap in code block** — always present diagrams inside triple-backtick fenced code blocks

## Character Quick Reference

### Box Drawing

| Style   | Corners         | Horizontal | Vertical | Tees                |
| ------- | --------------- | ---------- | -------- | ------------------- |
| Single  | `┌` `┐` `└` `┘` | `─`        | `│`      | `├` `┤` `┬` `┴` `┼` |
| Double  | `╔` `╗` `╚` `╝` | `═`        | `║`      | `╠` `╣`             |
| Rounded | `╭` `╮` `╰` `╯` | `─`        | `│`      | `├` `┤`             |
| Heavy   | `┏` `┓` `┗` `┛` | `━`        | `┃`      | `┣` `┫`             |

### Arrows and Connectors

| Character       | Usage                    |
| --------------- | ------------------------ |
| `→` `←` `↑` `↓` | Directional flow         |
| `▶` `◀` `▼` `▲` | Emphasized flow          |
| `↗` `↘`         | Trend indicators         |
| `──▶`           | Horizontal arrow line    |
| `◀──▶`          | Bidirectional connection |
| `──→`           | Screen-to-screen flow    |

### Flow References

Circled numerals for labeling flows — explain each in a legend below:

`①` `②` `③` `④` `⑤` `⑥` `⑦` `⑧` `⑨` `⑩`

### UI Symbols

| Character   | Usage                                     |
| ----------- | ----------------------------------------- |
| `░`         | Image/content placeholder fill            |
| `▓`         | Progress bar filled portion               |
| `⌕`         | Search icon                               |
| `≡`         | Hamburger menu                            |
| `⍥`         | User/avatar icon                          |
| `▾`         | Dropdown arrow                            |
| `×`         | Close button                              |
| `⊕`         | Add/plus button                           |
| `✓`         | Checkmark / success                       |
| `●` `○`     | Filled/empty dot (status, ratings, radio) |
| `★`         | Star / logo placeholder                   |
| `♡` `¶`     | Like, comment icons                       |
| `◀` `▶` `■` | Media controls (prev, play, stop)         |

### UI Component Patterns

**Toggle switch:**

```
[●──] On label           [──●] Off label
```

**Checkbox:**

```
[✓] Checked item          [ ] Unchecked item
```

**Radio button:**

```
(●) Selected option       ( ) Unselected option
```

**Select/dropdown:**

```
┌──────────────────────┐
│ Selected value     ▾ │
└──────────────────────┘
```

**Progress bar:**

```
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░
```

**Rating:**

```
●●●●○ (128 reviews)
```

**Stepper:**

```
● Account ─ ● Profile ─ ○ Plan ─ ○ Confirm
```

**Breadcrumb:**

```
Home / Shoes / Running / Air Max Pro
```

**Divider with label:**

```
── Section Title ──────────────────────
```

**Image placeholder:**

```
┌────────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░Product Photo░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
└────────────────────────────────────┘
```

## Technical Diagram Types

### 1. Architecture / Flow Diagram

Boxes represent components, arrows show data or control flow, circled numerals reference a flow legend.

```
┌──────────┐                              ┌──────────────┐
│  Browser  │───── ① ────────────────────▶│   Auth API   │
└──────────┘                              └──────┬───────┘
      │                                          │ ②
      │ ⑤                                       ▼
      │                                   ┌──────────────┐
      │                                   │   Session DB  │
      │                                   └──────────────┘
      │          ┌──────────────┐
      └── ③ ───▶│    IdP       │
                 │  (Okta/AAD) │
                 └──────┬──────┘
                        │ ④
                        ▼
                 ┌──────────────┐
                 │  SAML/OIDC   │
                 │  Callback    │
                 └──────────────┘
```

**Flow Legend:**

- ① Direct login: browser sends credentials to Auth API
- ② Auth API creates session in Session DB
- ③ SSO redirect: browser redirected to external IdP
- ④ IdP posts assertion back to SAML/OIDC callback
- ⑤ Browser receives session cookie after successful auth

### 2. Entity-Relationship Diagram

Table boxes with column annotations (`PK`, `FK`, `UQ`) and cardinality (`1`, `*`).

```
┌──────────────────┐      ┌──────────────────┐
│      user        │      │   organization   │
├──────────────────┤      ├──────────────────┤
│ id          PK   │      │ id          PK   │
│ email       UQ   │      │ name             │
│ org_id      FK   │──┐   │ domain      UQ   │
└──────────────────┘  │   └────────┬─────────┘
                      │            │
                      │ *        1 │
                      └────────────┘
```

### 3. Deployment / Topology Diagram

```
                   ┌─────────────┐
                   │  DNS Record  │
                   └──────┬──────┘
                          │ TLS
                          ▼
                   ┌─────────────┐
                   │ NGINX Ingress│
                   └──────┬──────┘
                          │
          ┌───────────────┼───────────────┐
      /auth/*        /studio/*       /api/*
          │               │               │
          ▼               ▼               ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │  Auth Svc  │  │ Studio Svc │  │  API Svc   │
   └────────────┘  └────────────┘  └────────────┘
```

### 4. Sequence / Timeline Diagram

```
┌────────┐          ┌────────┐          ┌────────┐
│ Client │          │ Server │          │   DB   │
└───┬────┘          └───┬────┘          └───┬────┘
    │   1. POST /login  │                   │
    │──────────────────▶│                   │
    │                   │  2. SELECT user   │
    │                   │──────────────────▶│
    │                   │  3. rows          │
    │                   │◀──────────────────│
    │   4. 200 + JWT    │                   │
    │◀──────────────────│                   │
```

### 5. CI/CD Pipeline Diagram

Use rounded boxes for stages, heavy for critical targets, connecting lines for flow:

```
╭────────────╮    ╭────────────╮    ╭────────────╮    ┏━━━━━━━━━━┓
│  Git Push  │────│   Build    │────│    Test    │────┃  Deploy  ┃
│   (main)   │    │   & Lint   │    │   Suite    │    ┃          ┃
╰────────────╯    ╰──────┬─────╯    ╰────────────╯    ┗━━━━━━━━━━┛
                         │                │
                ╭────────────────╮╭────────────────╮
                │    Security    ││  Integration   │
                │      Scan      ││     Tests      │
                ╰────────────────╯╰────────────────╯
```

## UI Wireframe Patterns

### Browser Frame

Wrap any web page wireframe in a browser chrome:

```
┌──────────────────────────────────────────────────────────────────┐
│ < > O   app.example.com/dashboard                                 │
├──────────────────────────────────────────────────────────────────┤
│  [page content here]                                              │
└──────────────────────────────────────────────────────────────────┘
```

### Navbar

```
┌────────────────────────────────────────────────────────────────┐
│ =  ≡ Brand  Dashboard  Analytics  Reports  ⌕  ⍥                │
└────────────────────────────────────────────────────────────────┘
```

### Sidebar + Content Layout

```
┌──────────────────┐┌──────────────────────────────────────────┐
│                  ││                                          │
│ • Dashboard      ││  Page Title                              │
│ • Analytics      ││                                          │
│ • Settings       ││  [main content area]                     │
│                  ││                                          │
│    Navigation    ││                                          │
│                  ││                                          │
└──────────────────┘└──────────────────────────────────────────┘
```

### Card Grid (KPI / Stats)

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Revenue         │ │ Users           │ │ Orders          │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│ $142,580        │ │ 28,493          │ │ 1,429           │
│ ↑ 12.5%         │ │ ↑ 8.2%          │ │ ↗ 5.7%          │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Data Table

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Name       ▾ │ Email      ▾ │ Role       ▾ │ Status     ▾ │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Jane Doe     │ jane@acme.c… │ Admin        │ Active       │
│ Bob Smith    │ bob@acme.com │ Editor       │ Active       │
│ Alice Wang   │ alice@acme…  │ Viewer       │ Inactive     │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

### Modal Overlay

```
         ┌──────────────────────────────────────┐
         │ Dialog Title                       × │
         ├──────────────────────────────────────┤
         │                                      │
         │ Modal content goes here.             │
         │                                      │
         │ ┌──────────────┐  ┌────────────┐     │
         │ │    Confirm   │  │   Cancel   │     │
         │ └──────────────┘  └────────────┘     │
         └──────────────────────────────────────┘
```

### Form Layout

```
┌────────────────────────────┐  ┌──────────────────────────────┐
│ Full Name                  │  │ Email                        │
└────────────────────────────┘  └──────────────────────────────┘

┌────────────────────────────┐  ┌──────────────────────────────┐
│ Company                    │  │ Role                       ▾ │
└────────────────────────────┘  └──────────────────────────────┘

[✓] I agree to Terms of Service
[ ] Send me product updates

┌──────────────────┐  ┌────────────┐
│   Save Changes   │  │   Cancel   │
└──────────────────┘  └────────────┘
```

### Mobile Screen Frame

Use rounded corners for mobile. Side-by-side screens with `──→` for flow:

```
╭────────────────────────╮  ╭────────────────────────╮
│         Login          │  │          Home          │
│                        │  │                        │
│  ┌──────────────────┐  │  │ ┌────────────────────┐ │
│  │ Email            │  │  │ │ ⌕ Search...        │ │
│  └──────────────────┘  │  │ └────────────────────┘ │
│                        │  │                        │
│  ┌──────────────────┐  │  │ ┌────────────────────┐ │
│  │ Password         │  │  │ │ Daily Summary      │ │
│  └──────────────────┘  │──→ ├────────────────────┤ │
│                        │  │ │ 3 tasks due        │ │
│  ┌──────────────────┐  │  │ └────────────────────┘ │
│  │     Sign In      │  │  │                        │
│  └──────────────────┘  │  │┌──────────────────────┐│
│                        │  ││ =  ⌂  ⌕  ⍥           ││
╰────────────────────────╯  ╰────────────────────────╯
```

### Pricing / Emphasis with Double Border

Use double border `╔═╗║╚╝` to highlight a featured element:

```
                         ╔════════════════════════╗
┌────────────────────────┐ ║ Pro — Most Popular     ║ ┌────────────────────────┐
│ Starter                │ ╠────────────────────────╣ │ Enterprise             │
├────────────────────────┤ ║ $29/mo                 ║ ├────────────────────────┤
│ $9/mo                  │ ║ Unlimited Projects     ║ │ Custom                 │
│ 3 Projects             │ ║ Priority Support       ║ │ Unlimited Everything   │
│                        │ ║                        ║ │                        │
│ ┌────────────────────┐ │ ║ ┌────────────────────┐ ║ │ ┌────────────────────┐ │
│ │    Get Started     │ │ ║ │  Start Free Trial  │ ║ │ │   Contact Sales    │ │
│ └────────────────────┘ │ ║ └────────────────────┘ ║ │ └────────────────────┘ │
└────────────────────────┘ ╚════════════════════════╝ └────────────────────────┘
```

### Chat Bubbles

Use rounded corners. Left-align incoming, right-align outgoing:

```
╭────────────────────────────╮
│  Hey, are you free today?  │ 10:30 AM
╰────────────────────────────╯

          ╭────────────────────────────╮
10:32 AM  │    Sure! Coffee at 2pm?    │
          ╰────────────────────────────╯
```

## Construction Guidelines

### Box Sizing

- **Minimum height**: 3 rows (top border, content, bottom border)
- **Minimum width**: label length + 4 (2 padding each side)
- **Label centering**: center text horizontally within the box
- **Multi-row boxes**: use `├──────┤` tees as internal row separator
- **Text truncation**: use `…` when text exceeds available width

### Spacing and Alignment

- **Horizontal gap between boxes**: 1-2 characters minimum
- **Vertical gap between rows**: 1+ rows for arrow labels
- **Arrow lines**: `─` horizontal, `│` vertical
- **Arrow labels**: adjacent to the arrow line, never overlapping a box border
- **Alignment**: align box tops at the same logical level

### Flow Legend Format

Place after the diagram as a separate markdown section:

```
**Flow Legend:**
- ① Description of first flow
- ② Description of second flow
```

### Internal Subdivisions

For boxes with headers (tables, cards with title bars):

```
┌───────────────────┐
│   Section Title   │
├───────────────────┤
│ content row 1     │
│ content row 2     │
└───────────────────┘
```

### Border Style Selection

| Style   | When to Use                                               |
| ------- | --------------------------------------------------------- |
| Single  | Default for technical schemas and most UI elements        |
| Rounded | Mobile frames, chat bubbles, cards, modals, soft UI       |
| Double  | Highlighted/featured elements (pricing, invoices, alerts) |
| Heavy   | Critical deployment targets, warnings, emphasis           |

**Mixing rule**: one alternative style per diagram to highlight a single element. Exception: wireframes may use rounded for the outer frame with single for inner components.

## Anti-Patterns

**Do not:**

- Place text annotations overlapping box borders
- Mix more than two border styles in one diagram
- Use diagrams for simple tabular data — prefer markdown tables
- Add purely decorative elements — keep diagrams functional
- Use full-width Unicode characters — they break grid alignment
- Forget code block wrapping — naked diagrams lose alignment
- Use inconsistent spacing between same-level elements
