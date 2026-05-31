/**
 * prune-labels mode: enumerate the current workspace members at the pushed ref and
 * delete any `<prefix>/*` repository label whose member no longer exists, keeping
 * the label set in lockstep with the workspace.
 */
import { collectMembers } from "./collectMembers.ts";
import type { GitHubApi } from "./githubApi.ts";

/** Inputs for prune mode, resolved from the push event + inputs. */
export interface PruneInput {
  ref: string;
  prefix: string;
}

/** Deleted orphan labels, for the step summary. */
export interface PruneResult {
  deleted: string[];
}

export async function pruneLabels(api: GitHubApi, input: PruneInput): Promise<PruneResult> {
  const members = await collectMembers(api, input.ref, input.prefix);
  const live = new Set(members.map((member) => member.label));

  const existing = (await api.listRepoLabels()).filter((label) => label.startsWith(input.prefix));
  const orphans = existing.filter((label) => !live.has(label)).sort();

  for (const label of orphans) {
    await api.deleteLabel(label);
  }
  return { deleted: orphans };
}
