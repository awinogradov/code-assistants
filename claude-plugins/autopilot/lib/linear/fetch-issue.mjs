#!/usr/bin/env node
// Fetches a Linear issue and prints the resolve-issue-context JSON contract
// to stdout. Invoked directly by gathering/review skills or the issue agent — the plugin bundles
// no Linear MCP server, so this helper is that agent's only Linear read path.
//
// Usage:  LINEAR_API_KEY=lin_api_xxx node fetch-issue.mjs [--review] ENG-123
// --review bounds descriptions/comments and reports truncation.
//
// Always exits 0 and always prints a single JSON object: on any failure it
// prints the degraded shape with a non-null `resolveError`, so the caller can
// surface the error and STOP rather than proceed against missing data.

import { createLinearClient } from "./linearClient.mjs";

// Review bounds match the GitHub helper; planning callers retain full descriptions.
const maxDescriptionLength = 16_000;
const maxComments = 30;
const maxCommentLength = 2_000;

const degraded = (id, error) => ({
  source: id ? `Linear ${id}` : "Linear",
  issueId: id ?? null,
  title: null,
  status: "unresolved",
  labels: [],
  url: null,
  assignee: null,
  description: null,
  comments: [],
  truncated: false,
  resolveError: error,
});

async function main() {
  const review = process.argv.includes("--review");
  const [id] = process.argv.slice(2).filter((arg) => arg !== "--review");
  const apiKey = process.env.LINEAR_API_KEY;

  if (!id) return degraded(null, "unresolved — no Linear issue ID provided");
  if (!apiKey) return degraded(id, "unresolved — LINEAR_API_KEY unset");

  try {
    const issue = await createLinearClient(apiKey).fetchIssue(id);
    if (!issue) return degraded(id, `unresolved — Linear issue ${id} not found`);

    const description = issue.description ?? "";
    const comments = issue.comments?.nodes ?? [];

    return {
      source: `Linear ${issue.identifier}`,
      issueId: issue.identifier,
      title: issue.title,
      status: issue.state?.name ?? null,
      labels: (issue.labels?.nodes ?? []).map((label) => label.name),
      url: issue.url ?? null,
      assignee: null,
      description: review ? description.slice(0, maxDescriptionLength) : description,
      comments: (review ? comments.slice(0, maxComments) : comments).map((comment) => ({
        author: comment.user?.displayName ?? "unknown",
        date: (comment.createdAt ?? "").slice(0, 10),
        body: review ? (comment.body ?? "").slice(0, maxCommentLength) : (comment.body ?? ""),
      })),
      truncated:
        review &&
        (description.length > maxDescriptionLength ||
          comments.length > maxComments ||
          comments.some((comment) => (comment.body ?? "").length > maxCommentLength)),
      resolveError: null,
    };
  } catch (error) {
    const detail = error.cause ? ` (${Object.values(error.cause).join(" ")})` : "";
    return degraded(id, `unresolved — ${error.message}${detail}`);
  }
}

process.stdout.write(JSON.stringify(await main()));
