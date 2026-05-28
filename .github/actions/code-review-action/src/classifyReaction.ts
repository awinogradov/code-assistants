/**
 * Classify a react-mode triggering comment to decide whether it needs a model reply.
 *
 * A PR-author acknowledgement inside a bot-authored thread (e.g. "@bot Fixed — …")
 * that neither asks a question nor requests a re-review warrants no prose reply —
 * answering it just doubles the thread (issue #111). The action reacts with 👍
 * instead and skips the expensive model step entirely.
 *
 * Run as a GitHub Action step: reads the comment context from env and writes
 * `ack_only=true|false` to `$GITHUB_OUTPUT`.
 *
 * @example
 * BOT_IN_THREAD=true PR_AUTHOR=alice COMMENT_AUTHOR=alice COMMENT_BODY="Fixed — done." \
 *   bun run src/classifyReaction.ts   # writes ack_only=true to $GITHUB_OUTPUT
 */
import { appendFile } from "node:fs/promises";

/** Phrases that signal the author wants the bot to look again. */
const reReviewKeywords = [
  "re-review",
  "re review",
  "rereview",
  "review again",
  "another look",
  "look again",
  "ptal",
];

/**
 * True when a comment body neither asks a question nor requests a re-review —
 * i.e. it is a bare acknowledgement that warrants no model reply.
 */
export function isBareAcknowledgement(body: string): boolean {
  if (body.includes("?")) {
    return false;
  }

  const lower = body.toLowerCase();
  return !reReviewKeywords.some((keyword) => lower.includes(keyword));
}

/** Inputs needed to decide whether a react-mode reply can skip the model. */
export interface ReactionClassification {
  botInThread: boolean;
  prAuthor: string;
  commentAuthor: string;
  body: string;
}

/**
 * True when the triggering reply is a PR-author acknowledgement inside a
 * bot-authored thread, so the model reply can be skipped in favour of a 👍.
 */
export function shouldSkipModelReply({
  botInThread,
  prAuthor,
  commentAuthor,
  body,
}: ReactionClassification): boolean {
  if (!botInThread) {
    return false;
  }

  if (!prAuthor || commentAuthor !== prAuthor) {
    return false;
  }

  return isBareAcknowledgement(body);
}

if (import.meta.main) {
  const ackOnly = shouldSkipModelReply({
    botInThread: process.env.BOT_IN_THREAD === "true",
    prAuthor: process.env.PR_AUTHOR ?? "",
    commentAuthor: process.env.COMMENT_AUTHOR ?? "",
    body: process.env.COMMENT_BODY ?? "",
  });

  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    await appendFile(outputFile, `ack_only=${ackOnly}\n`);
  }

  if (ackOnly) {
    console.log("PR-author acknowledgement in bot thread — skipping model reply (issue #111)");
  }
}
