import { describe, expect, test } from "bun:test";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

import { claudeOnlySkills } from "./claudeOnly.ts";

const skillsRoot = resolve(import.meta.dirname, "../../claude-plugins/autopilot/skills");

describe("claudeOnlySkills", () => {
  test("every listed skill still exists in the plugin", async () => {
    for (const name of claudeOnlySkills.keys()) {
      expect((await stat(resolve(skillsRoot, name))).isDirectory()).toBe(true);
    }
  });

  test("every entry carries a non-empty reason", () => {
    for (const reason of claudeOnlySkills.values()) {
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});
