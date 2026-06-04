import { describe, expect, test } from "bun:test";
import {
  computeExitCode,
  excludedShellcheckCodes,
  formatAnnotation,
  mapShellcheckFinding,
  sanitizeExpressions,
  shellcheckArgs,
  shellcheckOutputSchema,
  shellcheckSetup,
  type Annotation,
} from "./linterReport.ts";

describe("sanitizeExpressions", () => {
  test("replaces ${{ }} with equal-length underscores", () => {
    const input = 'echo "${{ inputs.name }}"';
    const output = sanitizeExpressions(input);
    expect(output).toBe(`echo "${"_".repeat("${{ inputs.name }}".length)}"`);
    expect(output).toHaveLength(input.length);
    expect(output).not.toContain("${{");
  });

  test("handles multiple and multiline expressions", () => {
    const out = sanitizeExpressions("a ${{ x }} b ${{\n y }} c");
    expect(out).not.toContain("${{");
    expect(out).toHaveLength("a ${{ x }} b ${{\n y }} c".length);
  });
});

describe("shellcheckArgs / setup", () => {
  test("includes shell and the exclusion set, reads from stdin", () => {
    const args = shellcheckArgs("bash");
    expect(args).toContain("--shell");
    expect(args).toContain("bash");
    expect(args).toContain("--exclude");
    expect(args).toContain(excludedShellcheckCodes.join(","));
    expect(args.at(-1)).toBe("-");
  });

  test("does not set --severity so info-level findings (e.g. SC2086) are kept", () => {
    expect(shellcheckArgs("bash").some((arg) => arg.startsWith("--severity"))).toBe(false);
  });

  test("uses pipefail for bash and plain set -e for sh", () => {
    expect(shellcheckSetup("bash")).toBe("set -eo pipefail");
    expect(shellcheckSetup("sh")).toBe("set -e");
  });
});

describe("shellcheckOutputSchema", () => {
  test("parses real shellcheck json and ignores extra fields", () => {
    const raw = [
      { file: "-", line: 2, endLine: 2, column: 6, endColumn: 9, level: "warning", code: 2086, message: "Double quote", fix: null },
    ];
    const parsed = shellcheckOutputSchema.parse(raw);
    expect(parsed[0].code).toBe(2086);
    expect(parsed[0].level).toBe("warning");
  });

  test("rejects malformed payloads", () => {
    expect(shellcheckOutputSchema.safeParse("not json").success).toBe(false);
    expect(shellcheckOutputSchema.safeParse([{ line: "x" }]).success).toBe(false);
  });
});

describe("mapShellcheckFinding", () => {
  test("rebases the line onto the block start, accounting for the setup prefix", () => {
    // Script body starts at action.yml line 8; the piped script has 1 setup line,
    // so shellcheck line 2 (first real line) maps back to line 8.
    const first = mapShellcheckFinding({ line: 2, level: "warning", code: 2086, message: "m" }, "a.yml", 8);
    expect(first.line).toBe(8);
    const third = mapShellcheckFinding({ line: 4, level: "error", code: 2046, message: "m" }, "a.yml", 8);
    expect(third.line).toBe(10);
  });

  test("maps shellcheck level to annotation level; every finding blocks like actionlint", () => {
    expect(mapShellcheckFinding({ line: 2, level: "error", code: 1, message: "m" }, "a.yml", 1)).toMatchObject({
      level: "error",
      blocking: true,
    });
    // info maps to a notice annotation for color, but still fails the check.
    expect(mapShellcheckFinding({ line: 2, level: "info", code: 1, message: "m" }, "a.yml", 1)).toMatchObject({
      level: "notice",
      blocking: true,
    });
  });
});

describe("formatAnnotation", () => {
  test("renders a GitHub workflow command", () => {
    const annotation: Annotation = { level: "error", file: "a.yml", line: 9, message: "SC2086: quote", blocking: true };
    expect(formatAnnotation(annotation)).toBe("::error file=a.yml,line=9::SC2086: quote");
  });
});

describe("computeExitCode", () => {
  const blocking: Annotation = { level: "error", file: "a", line: 1, message: "m", blocking: true };
  const notice: Annotation = { level: "notice", file: "a", line: 1, message: "m", blocking: false };

  test("fails on a blocking finding", () => {
    expect(computeExitCode([blocking], false)).toBe(1);
  });

  test("passes when only non-blocking findings exist", () => {
    expect(computeExitCode([notice], false)).toBe(0);
  });

  test("passes on a clean run and fails on an operational error", () => {
    expect(computeExitCode([], false)).toBe(0);
    expect(computeExitCode([], true)).toBe(1);
  });
});
