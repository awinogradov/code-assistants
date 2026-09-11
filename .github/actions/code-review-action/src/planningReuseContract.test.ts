/** Guards context handoffs that would otherwise silently repeat research or drop constraints. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const skillsDir = join(import.meta.dirname, "../../../../claude-plugins/autopilot/skills");
const read = (path: string): Promise<string> => readFile(join(skillsDir, path), "utf8");
const [gather, linearRun, reuse, validation, refresh, run] = await Promise.all([
  read("gather-context/SKILL.md"),
  read("linear-run/SKILL.md"),
  read("gather-context/references/brief-reuse.md"),
  read("gather-context/references/brief-validation.md"),
  read("explore/references/selective-refresh.md"),
  read("run/SKILL.md"),
]);

describe("planning context reuse", () => {
  test("resolves intent before dependent fan-out", () => {
    expect(gather.indexOf("## Phase 0: Resolve the task")).toBeGreaterThan(-1);
    expect(gather.indexOf("## Phase 1: Fan out")).toBeGreaterThan(
      gather.indexOf("## Phase 0: Resolve the task"),
    );
    expect(gather).toContain("history wait for resolved intent");
    expect(gather).toContain("mismatches are fatal");
  });

  test("the Linear reader passes the resolved ticket and stored file seeds", () => {
    expect(linearRun).toContain("Pass `Resolved issue` in both modes");
    expect(linearRun).toContain("Files list and Implementation Steps as file seeds");
    expect(gather).toContain("do not require an API key after a successful MCP read");
  });

  test.each(["plan", "run", "linear-plan", "linear-run"])(
    "%s uses explicit brief validation without silent fallback",
    async (skill) => {
      const source = await read(`${skill}/SKILL.md`);
      expect(source).toContain("--brief <path>");
      expect(source).toContain("../gather-context/references/brief-validation.md");
      expect(source).toContain("brief-validation.md#optional-brief-flag");
      expect(validation).toContain("on any non-valid verdict, report it and stop");
    },
  );

  test("the validator consumes the caller path and retains every rejection", () => {
    expect(validation).toContain("caller-selected brief path");
    for (const verdict of ["missing", "malformed", "revision-mismatch", "stale", "valid"]) {
      expect(validation).toContain(`**${verdict}**`);
    }
  });

  test("brief reuse retains current code and complete standards as prerequisites", () => {
    expect(reuse).toContain("briefBlob");
    expect(reuse).toContain("Compare every recorded source `blob`");
    expect(reuse).toContain("even when Git status is clean");
    expect(reuse).toContain("staged and unstaged changes, and untracked paths");
    expect(reuse).toContain("navigation-only");
    expect(reuse).toContain("retrieve task-specific standards");
    expect(gather).toContain(
      "actual conventions as source + rule, preserving conditions/exceptions",
    );
  });

  test("selective refresh invalidates unknown coverage and newly discovered paths", () => {
    expect(refresh).toContain("incomplete dependencies selects full prime");
    expect(refresh).toContain("roots detect new, deleted, and renamed sources");
    expect(refresh).toContain("an unresolvable base");
    expect(refresh).toContain("Local changes participate in invalidation");
  });

  test("condensed delivery still delegates commits and monitoring", () => {
    expect(run).toContain("Invoke `Skill(autopilot:commits-create)` with `--autopilot`");
    expect(run).toContain("Invoke `Skill(autopilot:pr-monitor)` in foreground mode");
    expect(run).toContain("references/no-repository-change.md");
  });
});
