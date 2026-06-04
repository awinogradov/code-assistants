import { describe, expect, test } from "bun:test";
import { extractRunBlocks } from "./extractRunBlocks.ts";

// Line numbers are asserted explicitly so a change in how the YAML parser reports
// block-scalar positions is caught here rather than silently mis-mapping findings.
const manifest = `name: Test
runs:
  using: composite
  steps:
    - name: bash step
      shell: bash
      run: |
        echo "hello"
        ls -la
    - name: uses step
      uses: actions/checkout@v4
    - name: sh step
      shell: sh
      run: echo single
    - name: python step
      shell: python
      run: print("hi")
`;

describe("extractRunBlocks", () => {
  test("returns only bash/sh run steps with body start lines", () => {
    const result = extractRunBlocks(manifest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.blocks).toHaveLength(2);

    const [bashBlock, shBlock] = result.blocks;
    expect(bashBlock.shell).toBe("bash");
    expect(bashBlock.script.trim()).toBe('echo "hello"\nls -la');
    expect(bashBlock.line).toBe(8);

    expect(shBlock.shell).toBe("sh");
    expect(shBlock.script.trim()).toBe("echo single");
    expect(shBlock.line).toBe(14);
  });

  test("skips uses: steps and non-shellcheckable shells", () => {
    const result = extractRunBlocks(manifest);
    if (!result.ok) throw new Error("expected ok");
    const shells = result.blocks.map((block) => block.shell);
    expect(shells).toEqual(["bash", "sh"]);
  });

  test("returns ok with no blocks when the manifest has no run steps", () => {
    const result = extractRunBlocks(`name: x\nruns:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n`);
    expect(result).toEqual({ ok: true, blocks: [] });
  });

  test("returns ok with no blocks when there is no runs.steps", () => {
    expect(extractRunBlocks(`name: x\ndescription: y\n`)).toEqual({ ok: true, blocks: [] });
  });

  test("reports a YAML parse error as a failure with a line", () => {
    const result = extractRunBlocks(`name: x\nruns: : :\n`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.line).toBeGreaterThan(0);
    expect(result.error.length).toBeGreaterThan(0);
  });
});
