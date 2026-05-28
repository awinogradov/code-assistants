/**
 * Tests for classifyReaction.ts pure classification helpers.
 */
import { describe, expect, test } from "bun:test";

import { isBareAcknowledgement, shouldSkipModelReply } from "./classifyReaction.ts";

describe("isBareAcknowledgement", () => {
  test("plain 'Fixed' acknowledgement is bare", () => {
    expect(isBareAcknowledgement("@bot Fixed — removed the unused import.")).toBe(true);
  });

  test("a question is not bare", () => {
    expect(isBareAcknowledgement("@bot why is this a problem?")).toBe(false);
  });

  test("a re-review request is not bare", () => {
    expect(isBareAcknowledgement("@bot done, please re-review")).toBe(false);
  });

  test("PTAL is not bare", () => {
    expect(isBareAcknowledgement("@bot updated. PTAL")).toBe(false);
  });

  test("keyword matching is case-insensitive", () => {
    expect(isBareAcknowledgement("@bot Please take Another Look")).toBe(false);
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

  test("a question from the author still gets a reply", () => {
    expect(shouldSkipModelReply({ ...ack, body: "is this really needed?" })).toBe(false);
  });

  test("a re-review request from the author still gets a reply", () => {
    expect(shouldSkipModelReply({ ...ack, body: "pushed a fix, please re-review" })).toBe(false);
  });
});
