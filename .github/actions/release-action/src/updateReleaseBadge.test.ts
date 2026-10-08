/**
 * Tests for release badge update utility
 */
import { describe, expect, test } from "bun:test";

import { releaseWorkflowFile, updateReleaseBadge } from "./updateReleaseBadge.ts";

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
    const result = updateReleaseBadge(
      readme,
      "1.0.0",
      "https://gh.example.com",
      "org/my-repo",
      "release-create.yml",
    );

    expect(result).toContain("https://gh.example.com/org/my-repo/releases/latest");
    expect(result).toContain(
      "https://gh.example.com/org/my-repo/actions/workflows/release-create.yml",
    );
  });

  test("prepended badges target the given workflow file", () => {
    const result = updateReleaseBadge(
      "No header here.\n",
      "1.0.0",
      serverUrl,
      repo,
      "ship-it.yaml",
    );

    expect(result).toContain("https://github.com/owner/repo/actions/workflows/ship-it.yaml");
  });

  test("refreshes a stale Create-Release target on an existing badge", () => {
    const readme = `# My Project
[![GitHub Release](https://img.shields.io/badge/release-v1.0.0-blue)](https://github.com/owner/repo/releases/latest)
[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](https://github.com/owner/repo/actions/workflows/release_create.yml)

Some content.
`;
    const result = updateReleaseBadge(readme, "2.0.0", serverUrl, repo, "release-create.yml");

    expect(result).toContain("actions/workflows/release-create.yml");
    expect(result).not.toContain("release_create.yml");
    expect(result).toContain("release-v2.0.0-blue");
  });

  test("leaves other workflow badges untouched when refreshing", () => {
    const readme = `# My Project
[![GitHub Release](https://img.shields.io/badge/release-v1.0.0-blue)](https://github.com/owner/repo/releases/latest)
[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](https://github.com/owner/repo/actions/workflows/release_create.yml)
[![CI](https://img.shields.io/badge/CI-passing-green)](https://github.com/owner/repo/actions/workflows/test.yml)
`;
    const result = updateReleaseBadge(readme, "2.0.0", serverUrl, repo, "release-create.yml");

    expect(result).toContain("actions/workflows/test.yml");
    expect(result).toContain("actions/workflows/release-create.yml");
  });
});

describe("releaseWorkflowFile", () => {
  test("extracts the file name from a workflow ref", () => {
    expect(
      releaseWorkflowFile("owner/repo/.github/workflows/release-create.yml@refs/heads/main"),
    ).toBe("release-create.yml");
  });

  test("accepts a .yaml extension", () => {
    expect(releaseWorkflowFile("owner/repo/.github/workflows/ship.yaml@refs/tags/v1")).toBe(
      "ship.yaml",
    );
  });

  test("trims from the first @ so a ref containing @ still resolves", () => {
    expect(
      releaseWorkflowFile("owner/repo/.github/workflows/release-create.yml@refs/heads/feat@2"),
    ).toBe("release-create.yml");
  });

  test("falls back when the variable is unset", () => {
    expect(releaseWorkflowFile(undefined)).toBe("release_create.yml");
  });

  test("falls back on an empty value", () => {
    expect(releaseWorkflowFile("")).toBe("release_create.yml");
  });

  test("falls back when the ref carries no workflows segment", () => {
    expect(releaseWorkflowFile("owner/repo@refs/heads/main")).toBe("release_create.yml");
  });

  test("falls back when the extracted name is not a plain yaml file", () => {
    expect(releaseWorkflowFile("owner/repo/.github/workflows/nested/deploy.yml@main")).toBe(
      "release_create.yml",
    );
    expect(releaseWorkflowFile("owner/repo/.github/workflows/release-create.txt@main")).toBe(
      "release_create.yml",
    );
  });
});
