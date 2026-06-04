import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintActionManifest, runValidate } from "./validateActions.ts";

// These tests spawn the real `shellcheck` binary, so they only run where it is
// installed (CI ubuntu runners and the live action have it; skipped otherwise).
const hasShellcheck = Bun.which("shellcheck") !== null;
const dirs: string[] = [];

async function writeManifest(body: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "validate-actions-"));
  dirs.push(dir);
  const path = join(dir, "action.yml");
  await Bun.write(path, body);
  return path;
}

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe.skipIf(!hasShellcheck)("lintActionManifest (integration, requires shellcheck)", () => {
  test("flags an unquoted variable and maps it to the manifest line", async () => {
    const path = await writeManifest(
      ["name: t", "runs:", "  using: composite", "  steps:", "    - shell: bash", "      run: |", "        rm $FILE", ""].join("\n"),
    );
    const { annotations, operationalError } = await lintActionManifest(path);
    expect(operationalError).toBe(false);
    const blocking = annotations.filter((annotation) => annotation.blocking);
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking.some((annotation) => annotation.message.includes("SC2086"))).toBe(true);
    // `rm $FILE` is the first script line, on manifest line 7.
    expect(blocking.every((annotation) => annotation.line === 7)).toBe(true);
  });

  test("passes a clean composite run block", async () => {
    const path = await writeManifest(
      ['name: t', 'runs:', '  using: composite', '  steps:', '    - shell: bash', '      run: echo "ok"', ''].join("\n"),
    );
    const { annotations, operationalError } = await lintActionManifest(path);
    expect(operationalError).toBe(false);
    expect(annotations).toEqual([]);
  });

  test("does not shellcheck ${{ }} expressions as shell syntax", async () => {
    const path = await writeManifest(
      ['name: t', 'runs:', '  using: composite', '  steps:', '    - shell: bash', '      run: echo "${{ inputs.name }}"', ''].join("\n"),
    );
    const { annotations, operationalError } = await lintActionManifest(path);
    expect(operationalError).toBe(false);
    expect(annotations).toEqual([]);
  });
});

describe("lintActionManifest YAML errors", () => {
  test("reports a malformed action.yml as a blocking error (no shellcheck needed)", async () => {
    const path = await writeManifest("name: x\nruns: : :\n");
    const { annotations, operationalError } = await lintActionManifest(path);
    expect(operationalError).toBe(false);
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatchObject({ level: "error", blocking: true });
    expect(annotations[0].message).toContain("invalid YAML");
  });
});

describe("runValidate", () => {
  test("exits 0 when no changed file is a workflow or action manifest", async () => {
    expect(await runValidate(["--files", "README.md", "src/foo.ts"])).toBe(0);
  });

  test("exits 1 on a malformed composite action manifest in the changed set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "validate-actions-tree-"));
    dirs.push(dir);
    await Bun.write(join(dir, ".github/actions/sample/action.yml"), "name: x\nruns: : :\n");
    const original = process.cwd();
    process.chdir(dir);
    try {
      expect(await runValidate(["--files", ".github/actions/sample/action.yml"])).toBe(1);
    } finally {
      process.chdir(original);
    }
  });
});
