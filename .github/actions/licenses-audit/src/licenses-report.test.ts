import { describe, expect, it } from "bun:test";

import { isPackageManifest, normalizeLicense, renderLicensesMarkdown } from "./licenses-report.ts";

describe("normalizeLicense", () => {
  it("reads the SPDX string form", () => {
    expect(normalizeLicense({ license: "MIT" })).toBe("MIT");
  });

  it("reads the legacy { type } object form", () => {
    expect(normalizeLicense({ license: { type: "ISC" } })).toBe("ISC");
  });

  it("joins the legacy licenses[] array form", () => {
    expect(normalizeLicense({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe(
      "MIT OR Apache-2.0",
    );
  });

  it("falls back to UNKNOWN when no license is declared", () => {
    expect(normalizeLicense({})).toBe("UNKNOWN");
    expect(normalizeLicense({ license: "" })).toBe("UNKNOWN");
  });
});

describe("isPackageManifest", () => {
  it("accepts a top-level package", () => {
    expect(isPackageManifest("zod/package.json")).toBe(true);
  });

  it("accepts a scoped top-level package", () => {
    expect(isPackageManifest("@scope/pkg/package.json")).toBe(true);
  });

  it("accepts a package in a nested store (pnpm/bun) or hoist", () => {
    expect(isPackageManifest(".pnpm/zod@3.23.8/node_modules/zod/package.json")).toBe(true);
    expect(isPackageManifest("foo/node_modules/@scope/bar/package.json")).toBe(true);
  });

  it("rejects a bundled fixture manifest", () => {
    expect(isPackageManifest("foo/test/fixtures/bar/package.json")).toBe(false);
  });

  it("rejects dot directories and non-manifests", () => {
    expect(isPackageManifest(".bin/package.json")).toBe(false);
    expect(isPackageManifest("zod/readme.md")).toBe(false);
  });
});

describe("renderLicensesMarkdown", () => {
  it("groups by license and sorts both axes deterministically", () => {
    const markdown = renderLicensesMarkdown([
      { name: "beta", version: "2.0.0", license: "MIT" },
      { name: "alpha", version: "1.0.0", license: "MIT" },
      { name: "gamma", version: "3.0.0", license: "Apache-2.0" },
    ]);
    expect(markdown).toContain("## Apache-2.0");
    expect(markdown).toContain("## MIT");
    expect(markdown.indexOf("## Apache-2.0")).toBeLessThan(markdown.indexOf("## MIT"));
    expect(markdown.indexOf("alpha@1.0.0")).toBeLessThan(markdown.indexOf("beta@2.0.0"));
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("is stable across two renders of the same input", () => {
    const records = [{ name: "alpha", version: "1.0.0", license: "MIT" }];
    expect(renderLicensesMarkdown(records)).toBe(renderLicensesMarkdown(records));
  });
});
