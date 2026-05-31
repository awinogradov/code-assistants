import { describe, expect, it } from "bun:test";

import { parsePullRequestEvent } from "./eventPayload.ts";

describe("parsePullRequestEvent", () => {
  it("extracts pr number and base/head shas", () => {
    expect(
      parsePullRequestEvent({
        pull_request: { number: 42, base: { sha: "base123" }, head: { sha: "head456" } },
      }),
    ).toEqual({ prNumber: 42, baseSha: "base123", headSha: "head456" });
  });

  it("throws on a malformed payload (untrusted input guard)", () => {
    expect(() => parsePullRequestEvent({ pull_request: { number: 0 } })).toThrow();
    expect(() => parsePullRequestEvent({})).toThrow();
  });
});
