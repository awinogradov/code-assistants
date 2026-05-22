/**
 * Tests for Slack release notification utilities
 *
 * Note: parseSlackRelease tests are in platformMeta/platformMeta.test.ts
 */
import { describe, expect, test } from "bun:test";

import { extractReleaseNotes } from "./slackNotify.ts";

describe("extractReleaseNotes", () => {
  const fallback = "A new version has been released.";

  test("returns fallback when no ## Release Notes heading", () => {
    const content = `## [1.0.0](link) (2026-01-01)

### Features

* **auth:** add login ([abc123](link))
`;
    expect(extractReleaseNotes(content)).toBe(fallback);
  });

  test("returns fallback when ## Release Notes section is empty", () => {
    const content = `## [1.0.0](link) (2026-01-01)

## Release Notes

## Linear
`;
    expect(extractReleaseNotes(content)).toBe(fallback);
  });

  test("extracts summary and multiple AI sections with ### headings", () => {
    const content = `## [1.0.0](link) (2026-01-01)

## Release Notes

Summary line here.

## ✨ What's New

### Feature A
Description of feature A

## 🐛 Bug Fixes

### Fix B
Description of fix B

## Linear

| Issue | PR | Author |
| --- | --- | --- |
| [TOOLS-1: ticket](link) | [#10](pr) | @dev |
`;
    const result = extractReleaseNotes(content);
    expect(result).toContain("Summary line here.");
    expect(result).toContain("*✨ What's New*");
    expect(result).toContain("*Feature A*");
    expect(result).toContain("Description of feature A");
    expect(result).toContain("*🐛 Bug Fixes*");
    expect(result).toContain("*Fix B*");
    expect(result).not.toContain("Linear");
    expect(result).not.toContain("TOOLS-1");
  });

  test("stops at ## Linear", () => {
    const content = `## Release Notes

Summary.

## Linear

Should not appear.
`;
    const result = extractReleaseNotes(content);
    expect(result).toContain("Summary.");
    expect(result).not.toContain("Should not appear");
  });

  test("stops at ## Jira", () => {
    const content = `## Release Notes

Summary.

## Jira

Should not appear.
`;
    const result = extractReleaseNotes(content);
    expect(result).toContain("Summary.");
    expect(result).not.toContain("Should not appear");
  });

  test("stops at ## GitHub Issues", () => {
    const content = `## Release Notes

Summary.

## GitHub Issues

- #42 should not appear
`;
    const result = extractReleaseNotes(content);
    expect(result).toContain("Summary.");
    expect(result).not.toContain("#42");
  });

  test("does not stop at non-conventional ### headings (AI items use ### format)", () => {
    const content = `## Release Notes

Summary.

## ✨ What's New

### My Feature
Feature description here.

## Linear

Should not appear.
`;
    const result = extractReleaseNotes(content);
    expect(result).toContain("Summary.");
    expect(result).toContain("*My Feature*");
    expect(result).toContain("Feature description here.");
    expect(result).not.toContain("Linear");
  });

  test("stops at conventional changelog ### sections (e.g. ### Bug Fixes)", () => {
    const content = `## Release Notes

Summary.

## 🐛 Bug Fixes

### Fix A
Description of fix A

### Bug Fixes

* **release:** some fix ([abc123](link))
`;
    const result = extractReleaseNotes(content);
    expect(result).toContain("Summary.");
    expect(result).toContain("*Fix A*");
    expect(result).toContain("Description of fix A");
    expect(result).not.toContain("some fix");
    expect(result).not.toContain("abc123");
  });

  test("stops at conventional changelog sections even without ticket sections", () => {
    const content = `## [1.12.2](link) (2026-04-10)

## Release Notes

Teams will notice visual markers in release notes.

## Bug Fixes

### Visual markers restored
Emoji icons are back in section headings.

### Bug Fixes

* **release:** restore emoji prefixes ([63c5534](link))

### Refactoring

* **release:** extract prompt ([8144abf](link))
`;
    const result = extractReleaseNotes(content);
    expect(result).toContain("Teams will notice visual markers");
    expect(result).toContain("*Visual markers restored*");
    expect(result).toContain("Emoji icons are back");
    expect(result).not.toContain("restore emoji prefixes");
    expect(result).not.toContain("63c5534");
    expect(result).not.toContain("extract prompt");
    expect(result).not.toContain("8144abf");
  });

  test("strips root-level <details> blocks", () => {
    const content = `## Release Notes

Summary.

## ✨ What's New

### Feature
Description

<details><summary>Related issues</summary>

- [TOOLS-1: ticket](link)
</details>
`;
    const result = extractReleaseNotes(content);
    expect(result).toContain("*Feature*");
    expect(result).not.toContain("Related issues");
    expect(result).not.toContain("TOOLS-1");
    expect(result).not.toContain("<details>");
  });

  test("strips indented <details> blocks", () => {
    const content = `## Release Notes

Summary.

## ✨ What's New

### Feature
Description

  <details><summary>Related issues</summary>

  - [TOOLS-1: ticket](link)
  </details>
`;
    const result = extractReleaseNotes(content);
    expect(result).toContain("*Feature*");
    expect(result).not.toContain("TOOLS-1");
    expect(result).not.toContain("<details>");
  });

  test("escapes & < > for Slack mrkdwn", () => {
    const content = `## Release Notes

Use <your-id> for R&D teams. Check a > b.
`;
    const result = extractReleaseNotes(content);
    expect(result).toContain("&lt;your-id&gt;");
    expect(result).toContain("R&amp;D");
    expect(result).toContain("a &gt; b");
    expect(result).not.toContain("<your-id>");
  });

  test("converts ## headings to Slack bold", () => {
    const content = `## Release Notes

Summary.

## ✨ What's New

Details.
`;
    const result = extractReleaseNotes(content);
    expect(result).toContain("*✨ What's New*");
    expect(result).not.toContain("## ✨ What's New");
  });

  test("converts ### headings to Slack bold", () => {
    const content = `## Release Notes

## ✨ What's New

### Cool Feature
Description of cool feature.
`;
    const result = extractReleaseNotes(content);
    expect(result).toContain("*Cool Feature*");
    expect(result).not.toContain("### Cool Feature");
  });

  test("converts **bold** to *bold* for Slack mrkdwn", () => {
    const content = `## Release Notes

- **Bold text** - description
`;
    const result = extractReleaseNotes(content);
    expect(result).toContain("*Bold text*");
    expect(result).not.toContain("**Bold text**");
  });

  test("collapses multiple blank lines into one", () => {
    const content = `## Release Notes

Summary.



## ✨ What's New

Details.
`;
    const result = extractReleaseNotes(content);
    expect(result).not.toMatch(/\n{3,}/);
  });

  test("truncates at paragraph boundary", () => {
    const content = `## Release Notes

${"A".repeat(1400)}

${"B".repeat(1400)}

${"C".repeat(1400)}
`;
    const result = extractReleaseNotes(content);
    expect(result.length).toBeLessThanOrEqual(2900);
    expect(result).toEndWith("...");
    // First two paragraphs included, third excluded entirely
    expect(result).toContain("A".repeat(1400));
    expect(result).toContain("B".repeat(1400));
    expect(result).not.toContain("CCC");
  });

  test("truncates at line boundary when no paragraph break fits", () => {
    // Lines with unique end markers, no double-newlines
    const makeLine = (n: number) => `${"B".repeat(90)}${String(n).padStart(5, "0")}`;
    const lines = Array.from({ length: 40 }, (_, i) => makeLine(i)).join("\n");
    const content = `## Release Notes

${lines}
`;
    const result = extractReleaseNotes(content);
    expect(result.length).toBeLessThanOrEqual(2900);
    expect(result).toEndWith("...");
    // Last char before "..." should be a digit (end of a complete line), not mid-line
    const beforeSuffix = result.slice(0, -3);
    expect(beforeSuffix).toMatch(/\d$/);
  });

  test("truncates at word boundary when content is a single long line", () => {
    const words = Array.from({ length: 600 }, () => "word").join(" ");
    const content = `## Release Notes

${words}
`;
    const result = extractReleaseNotes(content);
    expect(result.length).toBeLessThanOrEqual(2900);
    expect(result).toEndWith("...");
    // Should cut at a space, not mid-word
    expect(result).not.toMatch(/wor\.\.\.$/);
  });

  test("hard cuts when content has no separators", () => {
    const content = `## Release Notes

${"X".repeat(3000)}
`;
    const result = extractReleaseNotes(content);
    expect(result.length).toBeLessThanOrEqual(2900);
    expect(result).toEndWith("...");
  });

  test("does not truncate content under 2900 characters", () => {
    const content = `## Release Notes

Short summary.
`;
    const result = extractReleaseNotes(content);
    expect(result).not.toEndWith("...");
  });

  test("handles real release notes with all transformations", () => {
    const content = `## [1.7.1](https://github.com/org/repo/compare/v1.7.0...v1.7.1) (2026-03-24)

## Release Notes

Release notes generation improved.

## 🐛 Bug Fixes

### GitHub Issues filtering
Fixed issue where PRs appeared in issues.

<details><summary>Related issues</summary>

- [TOOLS-250: Title](https://linear.app/issue/TOOLS-250)
</details>

## 📚 Documentation & Setup Changes

### Workflow updates
Updated workflows.


## Linear

| Issue | PR | Author |
| --- | --- | --- |
| [TOOLS-250: Title](link) | [#10](pr) | @dev |

### Bug Fixes

* **tickets:** fix something ([abc](link))
`;
    const result = extractReleaseNotes(content);

    // Includes AI sections
    expect(result).toContain("Release notes generation improved.");
    expect(result).toContain("*🐛 Bug Fixes*");
    expect(result).toContain("*GitHub Issues filtering*");
    expect(result).toContain("*📚 Documentation &amp; Setup Changes*");
    expect(result).toContain("*Workflow updates*");

    // Excludes ticket/changelog content
    expect(result).not.toContain("TOOLS-250");
    expect(result).not.toContain("Linear");
    expect(result).not.toContain("tickets");
    expect(result).not.toContain("<details>");
  });
});
