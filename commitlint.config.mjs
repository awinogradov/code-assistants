/**
 * Commitlint configuration.
 *
 * Enforced locally by the husky `commit-msg` hook and in CI by
 * `wagoid/commitlint-github-action`. See CONTRIBUTING.md `Commits` section.
 *
 * @type {import("@commitlint/types").UserConfig}
 */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"],
    "subject-empty": [2, "never"],
    "subject-case": [2, "always", "lower-case"],
    "subject-full-stop": [2, "never", "."],
    "subject-max-length": [2, "always", 50],
    "header-max-length": [2, "always", 100],
    "scope-case": [2, "always", "lower-case"],
    "body-leading-blank": [2, "always"],
    "body-max-line-length": [1, "always", 100],
    "footer-leading-blank": [2, "always"],
    "footer-max-line-length": [1, "always", 100],
    "body-required-for-types": [2, "always"],
    "no-issue-id-in-subject": [2, "always"],
    "no-ai-coauthored-by": [2, "always"],
  },
  plugins: [
    {
      rules: {
        "body-required-for-types": ({ type, body }) => {
          const requireBody = ["feat", "fix", "refactor"];
          if (type && requireBody.includes(type) && (!body || body.trim() === "")) {
            return [false, `commits with type "${type}" require a body describing the change`];
          }
          return [true];
        },
        "no-issue-id-in-subject": ({ subject }) => {
          if (!subject) return [true];
          const issuePattern = /[A-Z]+-\d+/i;
          return [
            !issuePattern.test(subject),
            "do not include issue IDs in commit messages — branch name handles linking",
          ];
        },
        "no-ai-coauthored-by": ({ raw }) => {
          if (!raw) return [true];
          const aiPattern = /Co-authored-by:.*\b(Claude|ChatGPT|Copilot|Codex|Devin|Cursor)\b/i;
          return [!aiPattern.test(raw), "do not include AI agent Co-authored-by trailers"];
        },
      },
    },
  ],
};

export default config;
