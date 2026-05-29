/**
 * GitHub Actions step output helper.
 *
 * Writes `key=value` pairs to the file referenced by `$GITHUB_OUTPUT` using the
 * heredoc delimiter form, which is safe for multi-line values. Shared by the
 * action's entry-point scripts so the write pattern lives in one place.
 *
 * @example
 * await setOutput("skip_review", "false");
 */
import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";

/**
 * Append a GitHub Actions output variable, using a heredoc delimiter so values
 * containing newlines are handled correctly. Warns and no-ops when `GITHUB_OUTPUT`
 * is unset (e.g. running outside a GitHub Actions runner).
 */
export async function setOutput(key: string, value: string): Promise<void> {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    console.warn(`GITHUB_OUTPUT is not set — skipping output "${key}"`);
    return;
  }

  const delimiter = `EOF_${randomUUID().replaceAll("-", "")}`;
  await appendFile(outputFile, `${key}<<${delimiter}\n${value}\n${delimiter}\n`);
}
