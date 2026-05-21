import type { Configuration } from "lint-staged";

const config: Configuration = {
  "**/*.md": ["prettier --write --parser markdown", "bun scripts/validate-plugins.ts --files"],
  "**/*.json": ["prettier --write --parser json", "bun scripts/validate-plugins.ts --files"],
};

export default config;
