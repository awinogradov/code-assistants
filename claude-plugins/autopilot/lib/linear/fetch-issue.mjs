#!/usr/bin/env node
// Headless/CI fallback that fetches a Linear issue and prints the
// resolve-issue-context JSON contract to stdout. Invoked by the
// resolve-issue-context agent only when the Linear MCP server is unavailable.
//
// Usage:  LINEAR_API_KEY=lin_api_xxx node fetch-issue.mjs ENG-123
//
// Always exits 0 and always prints a single JSON object: on any failure it
// prints the degraded shape with a non-null `resolveError`, so the caller can
// surface the error and STOP rather than proceed against missing data.

import { createLinearClient } from "./linearClient.mjs";

const degraded = (id, error) => ({
  source: id ? `Linear ${id}` : "Linear",
  issueId: id ?? null,
  title: null,
  status: "unresolved",
  labels: [],
  assignee: null,
  description: null,
  comments: [],
  resolveError: error,
});

async function main() {
  const id = process.argv[2];
  const apiKey = process.env.LINEAR_API_KEY;

  if (!id) return degraded(null, "unresolved — no Linear issue ID provided");
  if (!apiKey) return degraded(id, "unresolved — LINEAR_API_KEY unset");

  try {
    const issue = await createLinearClient(apiKey).fetchIssue(id);
    if (!issue) return degraded(id, `unresolved — Linear issue ${id} not found`);

    return {
      source: `Linear ${issue.identifier}`,
      issueId: issue.identifier,
      title: issue.title,
      status: issue.state?.name ?? null,
      labels: (issue.labels?.nodes ?? []).map((label) => label.name),
      assignee: null,
      description: issue.description ?? "",
      comments: (issue.comments?.nodes ?? []).map((comment) => ({
        author: comment.user?.displayName ?? "unknown",
        date: (comment.createdAt ?? "").slice(0, 10),
        body: comment.body ?? "",
      })),
      resolveError: null,
    };
  } catch (error) {
    const detail = error.cause ? ` (${Object.values(error.cause).join(" ")})` : "";
    return degraded(id, `unresolved — ${error.message}${detail}`);
  }
}

process.stdout.write(JSON.stringify(await main()));
