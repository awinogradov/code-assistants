/**
 * Tests for modelTier.ts pure tiering helpers.
 */
import { describe, expect, test } from "bun:test";

import {
  defaultTierModel,
  isLowRisk,
  isRiskSensitive,
  maxCheapChurn,
  selectModel,
} from "./modelTier.ts";

const base = "claude-sonnet-4-6";
const cheap = "claude-haiku-4-5";

describe("isRiskSensitive", () => {
  test("flags CI/action config and security-named code paths", () => {
    for (const path of [
      ".github/workflows/code-review.yml",
      ".github/actions/foo/action.yml",
      "src/auth/session.ts",
      "src/oauth/client.ts",
      "lib/crypto/sign.ts",
      "services/payments/charge.ts",
      "src/webhooks/stripe.ts",
      "config/secretStore.ts",
    ]) {
      expect(isRiskSensitive(path)).toBe(true);
    }
  });

  test("does not flag ordinary docs/style/test paths", () => {
    for (const path of ["README.md", "docs/guide.md", "styles/app.css", "src/util.test.ts"]) {
      expect(isRiskSensitive(path)).toBe(false);
    }
  });
});

describe("isLowRisk", () => {
  test("accepts docs, styles, tests, config, lockfiles, and dotfiles", () => {
    for (const path of [
      "README.md",
      "docs/sub/guide.mdx",
      "notes.txt",
      "styles/app.css",
      "ui/theme.scss",
      "src/util.test.ts",
      "src/util.spec.tsx",
      "package.json",
      "tsconfig.json",
      "bun.lock",
      "config/app.yaml",
      ".gitignore",
      ".prettierrc",
    ]) {
      expect(isLowRisk(path)).toBe(true);
    }
  });

  test("rejects runtime source and config-as-code", () => {
    for (const path of ["src/index.ts", "src/components/Button.tsx", "eslint.config.ts"]) {
      expect(isLowRisk(path)).toBe(false);
    }
  });
});

describe("selectModel", () => {
  test("keeps the default tier when there are no changed files", () => {
    expect(selectModel({ changedFiles: [], churn: 0, baseModel: base, cheapModel: cheap })).toBe(
      base
    );
  });

  test("routes a small docs/test/config-only PR to the cheap tier", () => {
    expect(
      selectModel({
        changedFiles: ["docs/usage.md", "src/util.test.ts", "package.json"],
        churn: 80,
        baseModel: base,
        cheapModel: cheap,
      })
    ).toBe(cheap);
  });

  test("keeps the default tier when any file is risk-sensitive", () => {
    expect(
      selectModel({
        changedFiles: ["docs/usage.md", ".github/workflows/ci.yml"],
        churn: 20,
        baseModel: base,
        cheapModel: cheap,
      })
    ).toBe(base);
    expect(
      selectModel({
        changedFiles: ["src/auth/login.ts"],
        churn: 10,
        baseModel: base,
        cheapModel: cheap,
      })
    ).toBe(base);
  });

  test("keeps the default tier when any file is not low-risk", () => {
    expect(
      selectModel({
        changedFiles: ["docs/usage.md", "src/index.ts"],
        churn: 30,
        baseModel: base,
        cheapModel: cheap,
      })
    ).toBe(base);
  });

  test("keeps the default tier when churn exceeds the cap, even if all low-risk", () => {
    expect(
      selectModel({
        changedFiles: ["docs/huge-rewrite.md"],
        churn: maxCheapChurn + 1,
        baseModel: base,
        cheapModel: cheap,
      })
    ).toBe(base);
  });

  test("treats the churn cap as inclusive", () => {
    expect(
      selectModel({
        changedFiles: ["docs/guide.md"],
        churn: maxCheapChurn,
        baseModel: base,
        cheapModel: cheap,
      })
    ).toBe(cheap);
  });
});

describe("constants", () => {
  test("default cheap tier is Haiku", () => {
    expect(defaultTierModel).toBe("claude-haiku-4-5");
  });
});
