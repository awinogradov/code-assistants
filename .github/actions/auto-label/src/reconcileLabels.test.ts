import { describe, expect, it } from "bun:test";

import { reconcileLabels } from "./reconcileLabels.ts";

describe("reconcileLabels", () => {
  it("adds desired labels missing from current", () => {
    expect(reconcileLabels([], ["a/x", "a/y"])).toEqual({ add: ["a/x", "a/y"], remove: [] });
  });

  it("removes current labels no longer desired", () => {
    expect(reconcileLabels(["a/x", "a/y"], [])).toEqual({ add: [], remove: ["a/x", "a/y"] });
  });

  it("computes the intersection delta", () => {
    expect(reconcileLabels(["a/x", "a/old"], ["a/x", "a/new"])).toEqual({
      add: ["a/new"],
      remove: ["a/old"],
    });
  });

  it("is a no-op when the sets match", () => {
    expect(reconcileLabels(["a/x"], ["a/x"])).toEqual({ add: [], remove: [] });
  });
});
