#!/usr/bin/env node
// Fetches a Linear team's members plus the current (API-key) user and prints
// the resolve-assignees member contract to stdout. Invoked by the
// resolve-assignees agent — the plugin bundles no Linear MCP server, so this
// helper is that agent's only Linear read path.
//
// Usage:  LINEAR_API_KEY=lin_api_xxx node fetch-team-members.mjs ENG
//
// Always exits 0 and always prints a single JSON object: on any failure it
// prints the degraded shape with a non-null `resolveError`, so the caller can
// degrade to CODEOWNERS instead of failing the picklist.

import { createLinearClient } from "./linearClient.mjs";

const degraded = (error) => ({ me: null, members: [], resolveError: error });

async function main() {
  const team = process.argv[2];
  const apiKey = process.env.LINEAR_API_KEY;

  if (!team) return degraded("unresolved — no Linear team key provided");
  if (!apiKey) return degraded("unresolved — LINEAR_API_KEY unset");

  try {
    const result = await createLinearClient(apiKey).fetchTeamMembers(team);
    if (!result) return degraded(`unresolved — Linear team ${team} not found`);

    return {
      me: result.viewer,
      members: result.members.filter((member) => member.active !== false),
      resolveError: null,
    };
  } catch (error) {
    const detail = error.cause ? ` (${Object.values(error.cause).join(" ")})` : "";
    return degraded(`unresolved — ${error.message}${detail}`);
  }
}

process.stdout.write(JSON.stringify(await main()));
