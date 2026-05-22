/**
 * Tests for release badge update utility
 */
import { describe, expect, test } from "bun:test";

import { updateReleaseBadge } from "./updateReleaseBadge.ts";

const serverUrl = "https://github.com";
const repo = "owner/repo";

describe("updateReleaseBadge", () => {
  test("updates existing badge version in-place", () => {
    const readme = `# My Project
[![GitHub Release](https://img.shields.io/badge/release-v1.0.0-blue)](https://github.com/owner/repo/releases/latest)
[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](https://github.com/owner/repo/actions/workflows/release_create.yml)

Some content.
`;
    const result = updateReleaseBadge(readme, "2.0.0", serverUrl, repo);

    expect(result).toContain("release-v2.0.0-blue");
    expect(result).not.toContain("release-v1.0.0-blue");
    expect(result).toContain("Some content.");
  });

  test("inserts badges after first # header", () => {
    const readme = `# My Project

Some description.
`;
    const result = updateReleaseBadge(readme, "1.0.0", serverUrl, repo);

    expect(result).toContain("# My Project\n\n[![GitHub Release]");
    expect(result).toContain("release-v1.0.0-blue");
    expect(result).toContain("Create-Release-blue");
    expect(result).toContain("Some description.");
  });

  test("prepends badges when no header exists", () => {
    const readme = "Some content without header.\n";

    const result = updateReleaseBadge(readme, "1.0.0", serverUrl, repo);

    expect(result).toStartWith("[![GitHub Release]");
    expect(result).toContain("release-v1.0.0-blue");
    expect(result).toContain("Some content without header.");
  });

  test("updates badge in content with multiple shield references", () => {
    const readme = `# Project
[![GitHub Release](https://img.shields.io/badge/release-v1.0.0-blue)](link)

Some text with img.shields.io/badge/release-v1.0.0-blue reference.
`;
    const result = updateReleaseBadge(readme, "3.0.0", serverUrl, repo);

    expect(result).not.toContain("release-v1.0.0-blue");
    expect(result).toContain("release-v3.0.0-blue");
  });

  test("uses correct URLs in generated badges", () => {
    const readme = "# Test\n";
    const result = updateReleaseBadge(readme, "1.0.0", "https://gh.example.com", "org/my-repo");

    expect(result).toContain("https://gh.example.com/org/my-repo/releases/latest");
    expect(result).toContain(
      "https://gh.example.com/org/my-repo/actions/workflows/release_create.yml"
    );
  });
});
