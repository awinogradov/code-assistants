# Technical Diagrams

Reference for [`ascii-schemas/SKILL.md`](../SKILL.md) — worked technical diagram types and construction guidelines.

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
