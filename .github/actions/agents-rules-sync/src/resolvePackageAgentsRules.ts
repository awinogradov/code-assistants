/**
 * Validates a `package.json` body and extracts the `agents.rules` value.
 *
 * Throws with a helpful, link-decorated error message when the file is malformed,
 * the `agents` object is missing, or `agents.rules` is unset or invalid.
 *
 * @example
 *   const rules = resolvePackageAgentsRules(await readPackageJson());
 *   // rules: 'Bun' | 'Bun+React+Tailwind' | 'NodeJS+React' | 'NodeJS+React+Tailwind'
 *
 * @see https://github.com/awinogradov/code-assistants/blob/main/docs/agents-field.md
 */

import { z } from 'zod';

export const agentsRulesValues = [
  'Bun',
  'Bun+React+Tailwind',
  'NodeJS+React',
  'NodeJS+React+Tailwind',
] as const;

export type AgentsRules = (typeof agentsRulesValues)[number];

export const agentsFieldDocsUrl =
  'https://github.com/awinogradov/code-assistants/blob/main/docs/agents-field.md';

const packageJsonSchema = z
  .object({
    agents: z
      .object({ rules: z.unknown().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export function resolvePackageAgentsRules(raw: string): AgentsRules {
  const parsed = parseJsonOrThrow(raw);
  const result = packageJsonSchema.safeParse(parsed);

  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    throw new Error(`Invalid package.json at ${path}: ${issue.message}. ${addInstructions()}`);
  }

  const rules = result.data.agents?.rules;

  if (rules === undefined) {
    throw new Error(missingFieldMessage());
  }

  if (!isAgentsRules(rules)) {
    throw new Error(invalidValueMessage());
  }

  return rules;
}

function isAgentsRules(value: unknown): value is AgentsRules {
  return (
    typeof value === 'string' &&
    (agentsRulesValues as readonly string[]).includes(value)
  );
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
    throw new Error(`package.json is not valid JSON: ${message}`);
  }
}

function missingFieldMessage(): string {
  return `Missing \`agents.rules\` in package.json. ${addInstructions()}`;
}

function invalidValueMessage(): string {
  const allowed = agentsRulesValues.map((value) => `"${value}"`).join(', ');
  return `Invalid \`agents.rules\` in package.json. Allowed values: ${allowed}. See ${agentsFieldDocsUrl}`;
}

function addInstructions(): string {
  const allowed = agentsRulesValues.map((value) => `"${value}"`).join(', ');
  return `Add an \`agents.rules\` field to package.json with one of: ${allowed}. See ${agentsFieldDocsUrl}`;
}
