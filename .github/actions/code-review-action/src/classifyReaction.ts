/**
 * Classify a react-mode triggering comment to decide whether it needs a model reply.
 *
 * A PR-author acknowledgement inside a bot-authored thread (e.g. "@bot Fixed — …")
 * warrants no prose reply — answering it just doubles the thread (issue #111). The
 * action reacts with 👍 instead and skips the model step. An acknowledgement is
 * recognised by a positive ack token, not merely the absence of a question, so
 * substantive pushback like "this is intentional" still receives a real reply.
 *
 * Run as a GitHub Action step: reads the comment context from env and writes
 * `ack_only=true|false` to `$GITHUB_OUTPUT`.
 *
 * @example
 * BOT_IN_THREAD=true PR_AUTHOR=alice COMMENT_AUTHOR=alice COMMENT_BODY="Fixed — done." \
 *   bun run src/classifyReaction.ts   # writes ack_only=true to $GITHUB_OUTPUT
 */
import { setOutput } from "./actionsOutput.ts";

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

/** Whole-word signals that a reply positively acknowledges the bot's finding. */
const acknowledgementPatterns = [
  /\bfixed\b/,
  /\bdone\b/,
  /\baddressed\b/,
  /\bresolved\b/,
  /\bupdated\b/,
  /\bconfirmed\b/,
  /\backnowledged\b/,
  /\bgood catch\b/,
  /\bnice catch\b/,
  /\bmakes sense\b/,
  /\bwill do\b/,
];

/**
 * True when the comment explicitly asks the bot to look at the PR again — used
 * to gate the expensive verdict re-evaluation in `pr:answer` so plain replies
 * skip it. Shares {@link reReviewKeywords} with the acknowledgement check.
 */
export function requestsReReview(body: string): boolean {
  const lower = body.toLowerCase();
  return reReviewKeywords.some((keyword) => lower.includes(keyword));
}

/**
 * True when a comment body is a bare acknowledgement: it carries a positive
 * acknowledgement signal and neither asks a question nor requests a re-review.
 * Requiring a positive signal — rather than only the absence of one — keeps
 * substantive pushback such as "this is intentional" from being silenced.
 */
export function isBareAcknowledgement(body: string): boolean {
  if (body.includes("?")) {
    return false;
  }

  if (requestsReReview(body)) {
    return false;
  }

  return acknowledgementPatterns.some((pattern) => pattern.test(body.toLowerCase()));
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

  await setOutput("ack_only", String(ackOnly));

  // Gate pr:answer's verdict re-evaluation: only re-review when the comment
  // explicitly asks for it, so plain replies skip the expensive pass.
  const needsReverdict = requestsReReview(process.env.COMMENT_BODY ?? "");
  await setOutput("needs_reverdict", String(needsReverdict));

  if (ackOnly) {
    console.log("PR-author acknowledgement in bot thread — skipping model reply (issue #111)");
  }
}
