/**
 * Tests for classifyReaction.ts pure classification helpers.
 */
import { describe, expect, test } from "bun:test";

import {
  authorAcknowledgesWhileBlocking,
  hasAcknowledgementToken,
  isBareAcknowledgement,
  requestsReReview,
  shouldSkipModelReply,
} from "./classifyReaction.ts";

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

describe("hasAcknowledgementToken", () => {
  test("detects a whole-word acknowledgement token", () => {
    expect(hasAcknowledgementToken("@bot Fixed the import.")).toBe(true);
    expect(hasAcknowledgementToken("@bot addressed in the description")).toBe(true);
  });

  test("only matches on a word boundary", () => {
    expect(hasAcknowledgementToken("@bot I abandoned that approach.")).toBe(false);
  });

  test("is token-based, so a trailing question still counts", () => {
    // The token gate is intentionally blind to "?" — isBareAcknowledgement layers
    // the question check on top for the 👍 path.
    expect(hasAcknowledgementToken("@bot Fixed it. Anything else?")).toBe(true);
  });

  test("an empty body has no token", () => {
    expect(hasAcknowledgementToken("")).toBe(false);
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

describe("authorAcknowledgesWhileBlocking", () => {
  const arming: Parameters<typeof authorAcknowledgesWhileBlocking>[0] = {
    prAuthor: "alice",
    commentAuthor: "alice",
    body: "Addressed it — added the migration section.",
    botBlocking: true,
  };

  test("PR-author acknowledgement while the bot is blocking arms a re-verdict", () => {
    expect(authorAcknowledgesWhileBlocking(arming)).toBe(true);
  });

  test("does not arm when the bot is not blocking", () => {
    expect(authorAcknowledgesWhileBlocking({ ...arming, botBlocking: false })).toBe(false);
  });

  test("does not arm for a non-author commenter", () => {
    expect(authorAcknowledgesWhileBlocking({ ...arming, commentAuthor: "bob" })).toBe(false);
  });

  test("does not arm when the PR author is unknown", () => {
    expect(authorAcknowledgesWhileBlocking({ ...arming, prAuthor: "", commentAuthor: "" })).toBe(
      false,
    );
  });

  test("does not arm without a positive acknowledgement token", () => {
    expect(
      authorAcknowledgesWhileBlocking({ ...arming, body: "this is intentional, leave it" }),
    ).toBe(false);
  });

  test("arms even when the claim is negated — the model, not the classifier, gates the verdict", () => {
    // "I haven't fixed this yet" contains the token "fixed"; the classifier cannot
    // parse negation, so it arms the pass and pr:answer judges the live thread state.
    expect(authorAcknowledgesWhileBlocking({ ...arming, body: "I haven't fixed this yet" })).toBe(
      true,
    );
  });
});

describe("shouldSkipModelReply", () => {
  const ack: Parameters<typeof shouldSkipModelReply>[0] = {
    botInThread: true,
    prAuthor: "alice",
    commentAuthor: "alice",
    body: "Fixed — done.",
    botBlocking: false,
  };

  test("PR-author acknowledgement in a bot thread skips the model", () => {
    expect(shouldSkipModelReply(ack)).toBe(true);
  });

  test("does not skip when the bot is blocking — the reply must reach the model to re-verdict", () => {
    expect(shouldSkipModelReply({ ...ack, botBlocking: true })).toBe(false);
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

describe("react classification truth table", () => {
  // Mirrors the (ack_only, needs_reverdict) outputs computed in import.meta.main,
  // pinning how the two gates combine across the scenarios in issue #275.
  const classify = (input: Parameters<typeof shouldSkipModelReply>[0]) => ({
    ackOnly: shouldSkipModelReply(input),
    needsReverdict:
      requestsReReview(input.body) ||
      authorAcknowledgesWhileBlocking({
        prAuthor: input.prAuthor,
        commentAuthor: input.commentAuthor,
        body: input.body,
        botBlocking: input.botBlocking,
      }),
  });

  const base = { botInThread: true, prAuthor: "alice", commentAuthor: "alice" };

  test("author ack while blocking: reach the model and arm a re-verdict", () => {
    expect(
      classify({ ...base, body: "Addressed it in the latest push.", botBlocking: true }),
    ).toEqual({
      ackOnly: false,
      needsReverdict: true,
    });
  });

  test("author ack while not blocking: 👍 fast path, no re-verdict (issue #111 preserved)", () => {
    expect(
      classify({ ...base, body: "Addressed it in the latest push.", botBlocking: false }),
    ).toEqual({
      ackOnly: true,
      needsReverdict: false,
    });
  });

  test("explicit re-review request arms a re-verdict regardless of blocking", () => {
    expect(classify({ ...base, body: "pushed a fix, PTAL", botBlocking: false })).toEqual({
      ackOnly: false,
      needsReverdict: true,
    });
  });

  test("third-party ack while blocking neither skips nor arms", () => {
    expect(
      classify({ ...base, commentAuthor: "bob", body: "Looks fixed.", botBlocking: true }),
    ).toEqual({ ackOnly: false, needsReverdict: false });
  });
});
