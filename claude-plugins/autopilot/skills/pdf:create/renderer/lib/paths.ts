import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Absolute paths into the renderer, resolved from this module's own URL.
 *
 * Resolving from `import.meta.url` (never `process.cwd()` or a plugin-only env
 * var) is what makes the skill portable: the same code finds its bundled assets
 * whether it runs as the autopilot plugin or is copied into `~/.claude/skills/`.
 */
const libDir = dirname(fileURLToPath(import.meta.url));

export const rendererDir = join(libDir, "..");
export const assetsDir = join(rendererDir, "assets");
export const fontsDir = join(assetsDir, "fonts");
export const examplesDir = join(rendererDir, "references", "examples");
