import { describe, expect, test } from "bun:test";
import { classifyTarget, classifyTargets } from "./classifyTargets.ts";

describe("classifyTarget", () => {
  test("classifies workflow files", () => {
    expect(classifyTarget(".github/workflows/ci.yml")).toEqual({
      kind: "workflow",
      path: ".github/workflows/ci.yml",
    });
    expect(classifyTarget(".github/workflows/release-create.yaml")).toEqual({
      kind: "workflow",
      path: ".github/workflows/release-create.yaml",
    });
  });

  test("classifies composite action manifests", () => {
    expect(classifyTarget(".github/actions/validate-actions/action.yml")).toEqual({
      kind: "action",
      path: ".github/actions/validate-actions/action.yml",
    });
  });

  test("strips a leading ./ so git diff output works verbatim", () => {
    expect(classifyTarget("./.github/workflows/ci.yml")?.kind).toBe("workflow");
  });

  test("ignores unrelated paths", () => {
    expect(classifyTarget("src/index.ts")).toBeNull();
    expect(classifyTarget(".github/actions/foo/README.md")).toBeNull();
    expect(classifyTarget(".github/workflows/nested/ci.yml")).toBeNull();
    expect(classifyTarget(".github/actions/foo/bar/action.yml")).toBeNull();
    expect(classifyTarget("package.json")).toBeNull();
  });
});

describe("classifyTargets", () => {
  test("keeps only recognized targets", () => {
    const result = classifyTargets([
      ".github/workflows/ci.yml",
      "README.md",
      ".github/actions/foo/action.yml",
      "src/foo.ts",
    ]);
    expect(result).toEqual([
      { kind: "workflow", path: ".github/workflows/ci.yml" },
      { kind: "action", path: ".github/actions/foo/action.yml" },
    ]);
  });

  test("returns an empty array when nothing matches", () => {
    expect(classifyTargets(["README.md", "src/foo.ts"])).toEqual([]);
  });
});
