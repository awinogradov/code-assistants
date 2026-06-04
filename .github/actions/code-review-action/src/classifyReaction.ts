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
 * `ack_only=true|false` and `needs_reverdict=true|false` to `$GITHUB_OUTPUT`.
 * When the bot is currently blocking (`BOT_BLOCKING=true`), a PR-author
 * acknowledgement no longer short-circuits to a 👍 and instead arms the verdict
 * re-evaluation, so the bot can lift its own block (issue #275).
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
 * True when a body carries a positive acknowledgement token — a whole-word
 * signal (e.g. "fixed", "done", "addressed") that the author claims the bot's
 * finding is handled. Matched on a word boundary so "abandoned" does not count
 * as "done". Shared by {@link isBareAcknowledgement} and
 * {@link authorAcknowledgesWhileBlocking}.
 */
export function hasAcknowledgementToken(body: string): boolean {
  return acknowledgementPatterns.some((pattern) => pattern.test(body.toLowerCase()));
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

  return hasAcknowledgementToken(body);
}

/** Inputs needed to decide whether a react-mode reply can skip the model. */
export interface ReactionClassification {
  botInThread: boolean;
  prAuthor: string;
  commentAuthor: string;
  body: string;
  /** Whether the bot's current verdict on the PR is `CHANGES_REQUESTED`. */
  botBlocking: boolean;
}

/** Inputs for deciding whether a PR-author comment should arm a re-verdict. */
export interface ReverdictArming {
  prAuthor: string;
  commentAuthor: string;
  body: string;
  botBlocking: boolean;
}

/**
 * True when a PR-author comment should arm the verdict re-evaluation even
 * without an explicit "re-review" phrase: the bot is currently blocking and the
 * author signals the finding is addressed (e.g. "Added the section"). The
 * classifier only arms the pass — `pr:answer` still decides the verdict from the
 * live unresolved-thread state, not from the comment's claim (issue #275).
 */
export function authorAcknowledgesWhileBlocking({
  prAuthor,
  commentAuthor,
  body,
  botBlocking,
}: ReverdictArming): boolean {
  if (!botBlocking) {
    return false;
  }

  if (!prAuthor || commentAuthor !== prAuthor) {
    return false;
  }

  return hasAcknowledgementToken(body);
}

/**
 * True when the triggering reply is a PR-author acknowledgement inside a
 * bot-authored thread, so the model reply can be skipped in favour of a 👍.
 * When the bot is currently blocking, the reply is NOT skipped — it must reach
 * the model so the verdict can be re-evaluated and the block lifted (issue #275).
 */
export function shouldSkipModelReply({
  botInThread,
  prAuthor,
  commentAuthor,
  body,
  botBlocking,
}: ReactionClassification): boolean {
  if (!botInThread) {
    return false;
  }

  if (!prAuthor || commentAuthor !== prAuthor) {
    return false;
  }

  if (!isBareAcknowledgement(body)) {
    return false;
  }

  return !botBlocking;
}

if (import.meta.main) {
  const prAuthor = process.env.PR_AUTHOR ?? "";
  const commentAuthor = process.env.COMMENT_AUTHOR ?? "";
  const body = process.env.COMMENT_BODY ?? "";
  // Absent or non-"true" means not blocking — the safe direction (preserves the
  // pre-#275 👍 fast path and never spuriously arms a re-verdict).
  const botBlocking = process.env.BOT_BLOCKING === "true";

  const ackOnly = shouldSkipModelReply({
    botInThread: process.env.BOT_IN_THREAD === "true",
    prAuthor,
    commentAuthor,
    body,
    botBlocking,
  });

  await setOutput("ack_only", String(ackOnly));

  // Gate pr:answer's verdict re-evaluation: re-review when the comment asks for
  // it explicitly, or when the PR author says a blocker is addressed while the
  // bot is still blocking — so plain chit-chat skips the expensive pass but a
  // resolved-blocker claim can lift the block (issue #275).
  const needsReverdict =
    requestsReReview(body) ||
    authorAcknowledgesWhileBlocking({ prAuthor, commentAuthor, body, botBlocking });
  await setOutput("needs_reverdict", String(needsReverdict));

  if (ackOnly) {
    console.log("PR-author acknowledgement in bot thread — skipping model reply (issue #111)");
  }
}
