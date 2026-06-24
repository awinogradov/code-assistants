/**
 * Guards the configurable `review_prompt` / `react_prompt` action inputs. A
 * consumer can swap the leading command to run a different skill without forking,
 * while the action keeps appending its runtime arguments block after the prompt.
 *
 * These assertions pin two invariants: the input defaults reproduce the bundled
 * skills (so the shipped behavior stays byte-identical), and each mode step still
 * injects its arguments and an explicit `CLAUDE_RUN_MODE`. The arguments must
 * never be dropped for a custom prompt, and the run-summary mode must not depend
 * on the prompt text — `resolveRunMode` prefers `CLAUDE_RUN_MODE` over parsing it.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionYmlPath = join(import.meta.dirname, "..", "action.yml");

describe("configurable prompt inputs", () => {
  test("review_prompt and react_prompt default to the bundled skills", async () => {
    const actionYml = await readFile(actionYmlPath, "utf8");
    const reviewDefault = /review_prompt:[\s\S]*?default:\s*"([^"]+)"/.exec(actionYml)?.[1];
    const reactDefault = /react_prompt:[\s\S]*?default:\s*"([^"]+)"/.exec(actionYml)?.[1];

    expect(reviewDefault).toBe("/autopilot:pr-review");
    expect(reactDefault).toBe("/autopilot:pr-answer");
  });

  test("each mode step injects its prompt input, the runtime args, and a pinned run mode", async () => {
    const actionYml = await readFile(actionYmlPath, "utf8");

    // The prompt is built from the input plus the action-owned arguments block,
    // so a custom prompt can never drop the arguments.
    expect(actionYml).toContain(
      "${{ inputs.review_prompt }} REPO: ${{ github.repository }} PR_NUMBER:"
    );
    expect(actionYml).toContain(
      "${{ inputs.react_prompt }} REPO: ${{ github.repository }} PR_NUMBER:"
    );
    // CLAUDE_RUN_MODE is pinned so the run-summary label never depends on the prompt text.
    expect(actionYml).toContain("CLAUDE_RUN_MODE: review");
    expect(actionYml).toContain("CLAUDE_RUN_MODE: react");
  });
});
