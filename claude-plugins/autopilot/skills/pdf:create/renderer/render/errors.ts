/**
 * Typed, exit-code-bearing errors for the render pipeline.
 *
 * Factories (not classes) keep the module functional while attaching a numeric
 * `code` to each Error so `render.tsx` can map a failure to a deterministic
 * process exit code the calling skill can branch on.
 */
export interface CodedError extends Error {
  code: number;
}

function makeError(name: string, code: number): (message: string) => CodedError {
  return (message: string): CodedError => {
    const error = new Error(message) as CodedError;
    error.name = name;
    error.code = code;
    return error;
  };
}

/** Bad CLI arguments or unknown template (exit 2). */
export const usageError = makeError("UsageError", 2);
/** Content JSON failed schema validation (exit 3). */
export const contentError = makeError("ContentError", 3);
/** design.md parsing / token resolution failed (exit 4). */
export const themeError = makeError("ThemeError", 4);
/** A required font could not be resolved (exit 5). */
export const fontResolutionError = makeError("FontResolutionError", 5);
/** A chart spec could not be rendered (exit 6). */
export const chartError = makeError("ChartError", 6);
/** PDF rendering threw or timed out (exit 7). */
export const renderError = makeError("RenderError", 7);

/** Resolve a thrown value to its exit code, defaulting to 1 for unexpected errors. */
export function exitCodeFor(error: unknown): number {
  const code = (error as CodedError | undefined)?.code;
  return typeof code === "number" ? code : 1;
}
