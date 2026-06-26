/**
 * Validates a `package.json` body and extracts the normalized `agents.trackers` array.
 *
 * Trackers are optional: an absent array resolves to the GitHub-only default
 * `[{ type: 'github' }]`, preserving today's behavior. A present-but-malformed
 * array throws with a helpful, link-decorated message. Each `linear` entry is
 * normalized so `keys` is always populated (defaulting to `[team]`), and the
 * resolver rejects a `linear` entry missing `team`, a key prefix that would
 * route to more than one Linear tracker, or a duplicate `github` entry.
 *
 * Several `linear` entries may coexist so multiple teams can share one repo,
 * each routed to by its key prefix.
 *
 * @example
 *   const trackers = resolvePackageAgentsTrackers(await readPackageJson());
 *   // [{ type: 'linear', team: 'FRTNS', keys: ['FRTNS'] }, { type: 'github' }]
 *
 * @see https://github.com/awinogradov/code-assistants/blob/main/docs/11-linear-tracker.md
 */

import { z } from 'zod';

export const trackersDocsUrl =
  'https://github.com/awinogradov/code-assistants/blob/main/docs/11-linear-tracker.md';

/** A Linear team key (and key prefix) — the `FRTNS` in `FRTNS-123`. */
const teamKeyPattern = /^[A-Z]+$/;

const linearTrackerSchema = z
  .object({
    type: z.literal('linear'),
    team: z
      .string()
      .regex(teamKeyPattern, 'Linear `team` must be uppercase letters (e.g. "FRTNS").'),
    keys: z
      .array(
        z
          .string()
          .regex(teamKeyPattern, 'Each Linear `keys` entry must be uppercase letters (e.g. "FRTNS").'),
      )
      .optional(),
    label: z.string().optional(),
  })
  .passthrough();

const githubTrackerSchema = z
  .object({
    type: z.literal('github'),
  })
  .passthrough();

const trackerSchema = z.discriminatedUnion('type', [
  linearTrackerSchema,
  githubTrackerSchema,
]);

const trackersSchema = z
  .array(trackerSchema)
  .superRefine((trackers, ctx) => {
    const keyOwners = new Map<string, number>();
    let githubCount = 0;

    for (const [index, tracker] of trackers.entries()) {
      if (tracker.type === 'github') {
        githubCount += 1;
        if (githubCount > 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'type'],
            message: 'Only one `github` tracker is allowed.',
          });
        }
        continue;
      }

      const keys = tracker.keys ?? [tracker.team];
      for (const key of keys) {
        if (keyOwners.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'keys'],
            message: `Key prefix "${key}" routes to more than one Linear tracker; each key may belong to only one team.`,
          });
        } else {
          keyOwners.set(key, index);
        }
      }
    }
  })
  .transform((trackers) =>
    trackers.map((tracker) =>
      tracker.type === 'linear'
        ? { ...tracker, keys: tracker.keys ?? [tracker.team] }
        : tracker,
    ),
  );

const packageJsonSchema = z
  .object({
    agents: z
      .object({ trackers: z.unknown().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** A consuming repo's normalized `agents.trackers`: every `linear` entry has its `keys` populated (defaulting to `[team]`). */
export type AgentsTrackers = z.infer<typeof trackersSchema>;

/**
 * Parse, validate, and normalize the `agents.trackers` array from a raw
 * `package.json` string. Absent trackers resolve to `[{ type: 'github' }]`.
 */
export function resolvePackageAgentsTrackers(raw: string): AgentsTrackers {
  const parsed = parseJsonOrThrow(raw);
  const result = packageJsonSchema.safeParse(parsed);

  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    throw new Error(`Invalid package.json at ${path}: ${issue.message}. ${addInstructions()}`);
  }

  const trackers = result.data.agents?.trackers;

  if (trackers === undefined) {
    return [{ type: 'github' }];
  }

  const trackersResult = trackersSchema.safeParse(trackers);

  if (!trackersResult.success) {
    const issue = trackersResult.error.issues[0];
    const path =
      issue.path.length > 0 ? `agents.trackers.${issue.path.join('.')}` : 'agents.trackers';
    throw new Error(`Invalid ${path}: ${issue.message}. ${addInstructions()}`);
  }

  return trackersResult.data;
}

function parseJsonOrThrow(raw: string): unknown {
  const trimmed = raw.trim();

  if (trimmed === '') {
    throw new Error(`package.json is empty. ${addInstructions()}`);
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`package.json is not valid JSON: ${message}. ${addInstructions()}`);
  }
}

function addInstructions(): string {
  return `Configure \`agents.trackers\` as an array of { type: "linear" | "github", ... } entries — a \`linear\` entry needs a \`team\`, and each key prefix may belong to only one team. See ${trackersDocsUrl}`;
}
