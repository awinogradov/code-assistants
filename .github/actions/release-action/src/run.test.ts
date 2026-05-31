/**
 * Tests for monorepo branch-template resolution.
 *
 * Guards the contract that the standalone `release-{version}` default is treated
 * as unset (silent monorepo fallback, no `::warning::`), while a member-less
 * template the operator set themselves is injected with `{member}` and warned.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { resolveBranchTemplate } from "./run.ts";

const originalBranch = process.env.INPUT_BRANCH;

afterEach(() => {
  if (originalBranch === undefined) {
    delete process.env.INPUT_BRANCH;
  } else {
    process.env.INPUT_BRANCH = originalBranch;
  }
});

/** Resolve the template with `INPUT_BRANCH` set to `input`, capturing warnings. */
function resolveWithWarnings(input: string | undefined): {
  template: string;
  warnings: string[];
} {
  if (input === undefined) {
    delete process.env.INPUT_BRANCH;
  } else {
    process.env.INPUT_BRANCH = input;
  }
  const warnings: string[] = [];
  const spy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    warnings.push(String(args[0]));
  });
  try {
    return { template: resolveBranchTemplate(), warnings };
  } finally {
    spy.mockRestore();
  }
}

describe("resolveBranchTemplate", () => {
  test("falls back to the monorepo default without warning when unset", () => {
    const { template, warnings } = resolveWithWarnings(undefined);
    expect(template).toBe("release-{member}-{version}");
    expect(warnings).toHaveLength(0);
  });

  test("treats an empty input as unset", () => {
    const { template, warnings } = resolveWithWarnings("");
    expect(template).toBe("release-{member}-{version}");
    expect(warnings).toHaveLength(0);
  });

  test("treats the standalone release-{version} default as unset — no warning", () => {
    const { template, warnings } = resolveWithWarnings("release-{version}");
    expect(template).toBe("release-{member}-{version}");
    expect(warnings).toHaveLength(0);
  });

  test("returns a member-aware template verbatim", () => {
    const { template, warnings } = resolveWithWarnings("rel/{member}/{version}");
    expect(template).toBe("rel/{member}/{version}");
    expect(warnings).toHaveLength(0);
  });

  test("injects {member} into a custom member-less template and warns", () => {
    const { template, warnings } = resolveWithWarnings("rel/{version}");
    expect(template).toBe("rel/{member}-{version}");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("::warning::");
    expect(warnings[0]).toContain("missing {member} placeholder");
  });

  test("appends {member} when a custom template omits {version} too", () => {
    const { template, warnings } = resolveWithWarnings("release");
    expect(template).toBe("release-{member}");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("::warning::");
  });
});
