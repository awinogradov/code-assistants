/**
 * Guard against setting both Anthropic authentication methods at once.
 *
 * The Anthropic API rejects a request that carries both `ANTHROPIC_API_KEY`
 * (x-api-key) and `ANTHROPIC_AUTH_TOKEN` (bearer). Actions that accept both as
 * optional inputs call this at the boundary to fail fast with a clear message
 * instead of surfacing an opaque downstream API error.
 *
 * @example
 *   assertExclusiveAnthropicAuth(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_AUTH_TOKEN);
 */

/** Message thrown when both Anthropic auth methods are non-blank. */
export const exclusiveAnthropicAuthError =
  "Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN, not both — the Anthropic API rejects requests carrying both.";

/**
 * Throw when both `apiKey` (x-api-key) and `authToken` (bearer) are non-blank.
 *
 * Blank or whitespace-only values count as unset, matching how an omitted GitHub
 * Actions input renders.
 *
 * @param apiKey - Candidate `ANTHROPIC_API_KEY` value.
 * @param authToken - Candidate `ANTHROPIC_AUTH_TOKEN` value.
 * @throws If both are non-blank.
 */
export function assertExclusiveAnthropicAuth(
  apiKey: string | undefined,
  authToken: string | undefined,
): void {
  if (apiKey?.trim() && authToken?.trim()) {
    throw new Error(exclusiveAnthropicAuthError);
  }
}
