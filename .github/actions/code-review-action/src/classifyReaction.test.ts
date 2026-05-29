/**
 * Tests for classifyReaction.ts pure classification helpers.
 */
import { describe, expect, test } from "bun:test";

import { isBareAcknowledgement, requestsReReview, shouldSkipModelReply } from "./classifyReaction.ts";

describe("requestsReReview", () => {
  test("detects every re-review keyword variant", () => {
    for (const phrase of [
      "please re-review",
      "re review this",
      "rereview when you can",
      "review again please",
      "take another look",
      "have a look again",
      "updated, PTAL",
    ]) {
      expect(requestsReReview(phrase)).toBe(true);
    }
  });

  test("is case-insensitive", () => {
    expect(requestsReReview("Done — Please Re-Review")).toBe(true);
  });

  test("plain replies and acknowledgements do not request a re-review", () => {
    expect(requestsReReview("Fixed — removed the unused import.")).toBe(false);
    expect(requestsReReview("this is intentional, the pattern is required")).toBe(false);
    expect(requestsReReview("")).toBe(false);
  });
});

describe("isBareAcknowledgement", () => {
  test("plain 'Fixed' acknowledgement is bare", () => {
    expect(isBareAcknowledgement("@bot Fixed — removed the unused import.")).toBe(true);
  });

  test("'Done' / 'Confirmed' acknowledgements are bare", () => {
    expect(isBareAcknowledgement("@bot Done.")).toBe(true);
    expect(isBareAcknowledgement("@bot Confirmed, good catch.")).toBe(true);
  });

  test("substantive pushback without an ack token is not bare", () => {
    expect(
      isBareAcknowledgement(
        "@bot This is intentional — the mutation is required by the cache layer.",
      ),
    ).toBe(false);
  });

  test("an empty body is not a bare acknowledgement", () => {
    expect(isBareAcknowledgement("")).toBe(false);
  });

  test("an ack token only matches on a word boundary", () => {
    // "abandoned" contains "done", "rolled back" contains no ack token.
    expect(isBareAcknowledgement("@bot I abandoned that approach.")).toBe(false);
    expect(isBareAcknowledgement("@bot Rolled this back.")).toBe(false);
  });

  test("a question is not bare", () => {
    expect(isBareAcknowledgement("@bot why is this a problem?")).toBe(false);
  });

  test("a re-review request is not bare even with an ack token", () => {
    expect(isBareAcknowledgement("@bot done, please re-review")).toBe(false);
  });

  test("PTAL is not bare", () => {
    expect(isBareAcknowledgement("@bot updated. PTAL")).toBe(false);
  });

  test("keyword matching is case-insensitive", () => {
    expect(isBareAcknowledgement("@bot Fixed it. Please take Another Look")).toBe(false);
  });

  test("a question anywhere in a multi-line body is not bare", () => {
    expect(
      isBareAcknowledgement("@bot Fixed the first one.\nShould I also change the second?"),
    ).toBe(false);
  });
});

describe("shouldSkipModelReply", () => {
  const ack: Parameters<typeof shouldSkipModelReply>[0] = {
    botInThread: true,
    prAuthor: "alice",
    commentAuthor: "alice",
    body: "Fixed — done.",
  };

  test("PR-author acknowledgement in a bot thread skips the model", () => {
    expect(shouldSkipModelReply(ack)).toBe(true);
  });

  test("a comment not in a bot thread never skips", () => {
    expect(shouldSkipModelReply({ ...ack, botInThread: false })).toBe(false);
  });

  test("a non-author commenter never skips", () => {
    expect(shouldSkipModelReply({ ...ack, commentAuthor: "bob" })).toBe(false);
  });

  test("an empty PR author never skips", () => {
    expect(shouldSkipModelReply({ ...ack, prAuthor: "", commentAuthor: "" })).toBe(false);
  });

  test("substantive author pushback still gets a reply", () => {
    expect(
      shouldSkipModelReply({ ...ack, body: "this is intentional, the pattern is required" }),
    ).toBe(false);
  });

  test("a question from the author still gets a reply", () => {
    expect(shouldSkipModelReply({ ...ack, body: "is this really needed?" })).toBe(false);
  });

  test("a re-review request from the author still gets a reply", () => {
    expect(shouldSkipModelReply({ ...ack, body: "pushed a fix, please re-review" })).toBe(false);
  });
});
