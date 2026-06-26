/**
 * Tests for AI release notes generation
 */
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { withTempDir } from "./testHelpers.ts";

import {
  type AnthropicMessages,
  callAnthropicApi,
  generateWithApi,
  resolveAnthropicClientOptions,
  resolveAnthropicModel,
  runReleaseNotes,
  verifyReleaseNotes,
} from "./generateReleaseNotes.ts";
import {
  buildUserMessage,
  defaultAnthropicModel,
  filterChangelogForAi,
  readServiceContext,
  systemPrompt,
} from "./releaseNotesPrompt.ts";

describe("filterChangelogForAi", () => {
  test("strips Chores, CI, Tests, and Build sections", () => {
    const changelog = [
      "### Features",
      "",
      "* add new endpoint",
      "",
      "### Chores",
      "",
      "* **deps:** bump eslint from 9 to 10",
      "* update CONTRIBUTING.md",
      "",
      "### CI",
      "",
      "* update code-review workflow",
      "",
      "### Tests",
      "",
      "* **release:** increase test timeout to 30s",
      "",
      "### Build",
      "",
      "* regenerate bun.lock",
    ].join("\n");

    const result = filterChangelogForAi(changelog);

    expect(result).toContain("### Features");
    expect(result).toContain("add new endpoint");
    expect(result).not.toContain("### Chores");
    expect(result).not.toContain("bump eslint");
    expect(result).not.toContain("### CI");
    expect(result).not.toContain("code-review workflow");
    expect(result).not.toContain("### Tests");
    expect(result).not.toContain("test timeout");
    expect(result).not.toContain("### Build");
    expect(result).not.toContain("bun.lock");
  });

  test("preserves Features, Bug Fixes, Refactoring, Documentation, Performance", () => {
    const changelog = [
      "### Features",
      "",
      "* new feature",
      "",
      "### Bug Fixes",
      "",
      "* fix bug",
      "",
      "### Refactoring",
      "",
      "* refactor module",
      "",
      "### Documentation",
      "",
      "* update docs",
      "",
      "### Performance",
      "",
      "* optimize query",
    ].join("\n");

    const result = filterChangelogForAi(changelog);

    expect(result).toContain("### Features");
    expect(result).toContain("### Bug Fixes");
    expect(result).toContain("### Refactoring");
    expect(result).toContain("### Documentation");
    expect(result).toContain("### Performance");
  });

  test("handles empty input", () => {
    expect(filterChangelogForAi("")).toBe("");
  });

  test("returns empty when changelog has only irrelevant sections", () => {
    const changelog = ["### Chores", "", "* bump deps", "", "### CI", "", "* update workflow"].join(
      "\n"
    );

    expect(filterChangelogForAi(changelog)).toBe("");
  });

  test("collapses multiple blank lines after filtering", () => {
    const changelog = [
      "### Features",
      "",
      "* feature one",
      "",
      "### Chores",
      "",
      "* bump deps",
      "",
      "### Bug Fixes",
      "",
      "* fix bug",
    ].join("\n");

    const result = filterChangelogForAi(changelog);

    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toContain("### Features");
    expect(result).toContain("### Bug Fixes");
  });
});

describe("readServiceContext", () => {
  test("reads README.md from directory", () =>
    withTempDir(async (dir) => {
      await Bun.write(join(dir, "README.md"), "# My Service\n\nA cool service.");

      const context = await readServiceContext(dir);

      expect(context).toContain("README:");
      expect(context).toContain("My Service");
    }));

  test("reads docs/*.md files", () =>
    withTempDir(async (dir) => {
      await Bun.write(join(dir, "docs", "api.md"), "# API Reference\n\nEndpoint docs.", {
        createPath: true,
      });

      const context = await readServiceContext(dir);

      expect(context).toContain("api.md");
      expect(context).toContain("API Reference");
    }));

  test("truncates large README", () =>
    withTempDir(async (dir) => {
      const largeContent = "x".repeat(5000);
      await Bun.write(join(dir, "README.md"), largeContent);

      const context = await readServiceContext(dir);

      expect(context.length).toBeLessThan(5000);
      expect(context).toContain("...");
    }));

  test("returns empty string when no files exist", () =>
    withTempDir(async (dir) => {
      const context = await readServiceContext(dir);

      expect(context).toBe("");
    }));
});

describe("buildUserMessage", () => {
  test("assembles changelog only", () => {
    const message = buildUserMessage("### Features\n\n* feature");

    expect(message).toContain("CHANGELOG:");
    expect(message).toContain("feature");
    expect(message).not.toContain("SERVICE CONTEXT");
    expect(message).not.toContain("TICKET CONTEXT");
    expect(message).not.toContain("PR DESCRIPTIONS");
  });

  test("includes service context when provided", () => {
    const message = buildUserMessage("changelog", "README:\n# Service");

    expect(message).toContain("SERVICE CONTEXT:");
    expect(message).toContain("# Service");
  });

  test("includes tickets when provided", () => {
    const message = buildUserMessage("changelog", undefined, '[{"id": "T-1"}]');

    expect(message).toContain("TICKET CONTEXT");
    expect(message).toContain("T-1");
  });

  test("includes PR descriptions when provided", () => {
    const message = buildUserMessage("changelog", undefined, undefined, "- PR #1: Feature");

    expect(message).toContain("PR DESCRIPTIONS");
    expect(message).toContain("PR #1: Feature");
  });

  test("includes all sources", () => {
    const message = buildUserMessage("changelog", "context", "tickets", "pr descs");

    expect(message).toContain("SERVICE CONTEXT:");
    expect(message).toContain("CHANGELOG:");
    expect(message).toContain("TICKET CONTEXT");
    expect(message).toContain("PR DESCRIPTIONS");
  });
});

describe("systemPrompt", () => {
  test("contains audience description", () => {
    expect(systemPrompt).toContain("delivery/integration team");
  });

  test("contains all section headings", () => {
    expect(systemPrompt).toContain("## ✨ What's New");
    expect(systemPrompt).toContain("## 🐛 Bug Fixes");
    expect(systemPrompt).toContain("## 📋 Protocol & Contract Changes");
    expect(systemPrompt).toContain("## ⚙️ Configuration Required");
    expect(systemPrompt).toContain("## ⚠️ Breaking Changes");
    expect(systemPrompt).toContain("## 📚 Documentation & Settings Updates");
  });

  test("contains exclusion rules", () => {
    expect(systemPrompt).toContain("EXCLUDE");
    expect(systemPrompt).toContain("CI/CD pipeline");
    expect(systemPrompt).toContain("Dependency version bumps");
    expect(systemPrompt).toContain("CONTRIBUTING.md");
    expect(systemPrompt).toContain("test infrastructure");
    expect(systemPrompt).toContain("lockfile");
  });

  test("contains service context instruction", () => {
    expect(systemPrompt).toContain("SERVICE CONTEXT");
  });
});

describe("filterChangelogForAi + buildUserMessage pipeline", () => {
  const changelog = "### Features\n\n* add new endpoint\n\n### Chores\n\n* bump eslint\n";

  test("filters irrelevant sections and builds user message", () => {
    const filtered = filterChangelogForAi(changelog);
    const message = buildUserMessage(filtered);

    expect(message).toContain("CHANGELOG:");
    expect(message).toContain("add new endpoint");
    expect(message).not.toContain("bump eslint");
    expect(message).not.toContain("### Chores");
  });

  test("includes all sources together", () => {
    const filtered = filterChangelogForAi(changelog);
    const tickets = '[{"id": "T-1"}]';
    const prDesc = "- PR #1: Feature\n";
    const message = buildUserMessage(filtered, "context", tickets, prDesc);

    expect(message).toContain("SERVICE CONTEXT:");
    expect(message).toContain("TICKET CONTEXT");
    expect(message).toContain("PR DESCRIPTIONS");
    expect(message).not.toContain("### Chores");
  });
});

describe("verifyReleaseNotes", () => {
  test("keeps existing non-empty notes", () =>
    withTempDir(async (dir) => {
      const notesPath = join(dir, "release_notes.md");
      const bodyPath = join(dir, "body");
      await Bun.write(notesPath, "Existing release notes");
      await Bun.write(bodyPath, "Changelog body");

      await verifyReleaseNotes(notesPath, bodyPath);

      const content = await Bun.file(notesPath).text();
      expect(content).toBe("Existing release notes");
    }));

  test("falls back to body when notes are empty", () =>
    withTempDir(async (dir) => {
      const notesPath = join(dir, "release_notes.md");
      const bodyPath = join(dir, "body");
      await Bun.write(notesPath, "");
      await Bun.write(bodyPath, "Changelog content here");

      await verifyReleaseNotes(notesPath, bodyPath);

      const content = await Bun.file(notesPath).text();
      expect(content).toBe("Changelog content here");
    }));

  test("strips badge images from body fallback", () =>
    withTempDir(async (dir) => {
      const notesPath = join(dir, "release_notes.md");
      const bodyPath = join(dir, "body");
      await Bun.write(bodyPath, "![badge](url)\n\nActual content");

      await verifyReleaseNotes(notesPath, bodyPath);

      const content = await Bun.file(notesPath).text();
      expect(content).not.toContain("![badge]");
      expect(content).toContain("Actual content");
    }));

  test("uses default message when no body available", () =>
    withTempDir(async (dir) => {
      const notesPath = join(dir, "release_notes.md");
      const bodyPath = join(dir, "body");

      await verifyReleaseNotes(notesPath, bodyPath);

      const content = await Bun.file(notesPath).text();
      expect(content).toContain("See changelog for detailed changes");
    }));

  test("uses default message when body is only badges", () =>
    withTempDir(async (dir) => {
      const notesPath = join(dir, "release_notes.md");
      const bodyPath = join(dir, "body");
      await Bun.write(bodyPath, "![badge1](url)\n![badge2](url)\n");

      await verifyReleaseNotes(notesPath, bodyPath);

      const content = await Bun.file(notesPath).text();
      expect(content).toContain("See changelog for detailed changes");
    }));
});

describe("callAnthropicApi", () => {
  test("returns text from API response", async () => {
    const mockMessages: AnthropicMessages = {
      create: async () => ({
        content: [{ type: "text", text: "Generated notes" }],
      }),
    };

    const result = await callAnthropicApi(
      { apiKey: "test-key" },
      "test prompt",
      "system prompt",
      defaultAnthropicModel,
      mockMessages
    );

    expect(result).toBe("Generated notes");
  });

  test("forwards system prompt and user message to client", async () => {
    let capturedSystem: string | undefined;
    let capturedUserContent: string | undefined;
    const mockMessages: AnthropicMessages = {
      create: async (params) => {
        capturedSystem = params.system;
        capturedUserContent = params.messages[0]?.content;
        return { content: [{ type: "text", text: "notes" }] };
      },
    };

    await callAnthropicApi(
      { apiKey: "test-key" },
      "user msg",
      "my system prompt",
      defaultAnthropicModel,
      mockMessages
    );

    expect(capturedSystem).toBe("my system prompt");
    expect(capturedUserContent).toBe("user msg");
  });

  test("forwards the model to the client", async () => {
    let capturedModel: string | undefined;
    const mockMessages: AnthropicMessages = {
      create: async (params) => {
        capturedModel = params.model;
        return { content: [{ type: "text", text: "notes" }] };
      },
    };

    await callAnthropicApi({ apiKey: "test-key" }, "user msg", "system", "my-model", mockMessages);

    expect(capturedModel).toBe("my-model");
  });

  test("throws when API returns no text content", async () => {
    const mockMessages: AnthropicMessages = {
      create: async () => ({
        content: [{ type: "tool_use" }],
      }),
    };

    await expect(
      callAnthropicApi({ apiKey: "test-key" }, "test prompt", "system", defaultAnthropicModel, mockMessages)
    ).rejects.toThrow("Anthropic API returned no text content");
  });
});

describe("runReleaseNotes", () => {
  let savedApiKey: string | undefined;

  beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (savedApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = savedApiKey;
    }
  });

  test("falls back to .release_bot/body inside the supplied cwd when no API key", () =>
    withTempDir(async (dir) => {
      delete process.env.ANTHROPIC_API_KEY;
      await Bun.write(join(dir, ".release_bot/body"), "## member changelog body");

      await runReleaseNotes(dir);

      const notes = await Bun.file(join(dir, ".release_bot/release_notes.md")).text();
      expect(notes).toContain("member changelog body");
    }));

  test("resolves paths under cwd, not process.cwd()", () =>
    withTempDir(async (dir) => {
      delete process.env.ANTHROPIC_API_KEY;
      await Bun.write(join(dir, ".release_bot/body"), "isolated body");

      await runReleaseNotes(dir);

      const memberNotes = Bun.file(join(dir, ".release_bot/release_notes.md"));
      expect(await memberNotes.exists()).toBe(true);

      const cwdNotes = Bun.file(join(process.cwd(), ".release_bot/release_notes.md"));
      expect(await cwdNotes.exists()).toBe(false);
    }));

  test("writes AI summary when API key is set and the call succeeds", () =>
    withTempDir(async (dir) => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      await Bun.write(join(dir, ".release_bot/body"), "### Features\n\n- new endpoint");

      const mockMessages: AnthropicMessages = {
        create: async () => ({ content: [{ type: "text", text: "AI-summarized release" }] }),
      };

      await runReleaseNotes(dir, mockMessages);

      const notes = await Bun.file(join(dir, ".release_bot/release_notes.md")).text();
      expect(notes).toContain("AI-summarized release");
    }));
});

describe("generateWithApi", () => {
  let savedApiKey: string | undefined;

  beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (savedApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = savedApiKey;
    }
  });

  test("swallows errors and reads paths relative to the supplied cwd", () =>
    withTempDir(async (dir) => {
      // Missing body file exercises the catch branch — the function must not
      // throw and the notes file must not appear. The bodyPath is supplied
      // absolutely (mirroring runReleaseNotes), so cwd only governs the lookup
      // of tickets.json / pr_descriptions.yml / service-context files.
      const notesPath = join(dir, "release_notes.md");
      const bodyPath = join(dir, "missing-body");

      await generateWithApi({ apiKey: "fake-key" }, notesPath, bodyPath, defaultAnthropicModel, dir);

      expect(await Bun.file(notesPath).exists()).toBe(false);
    }));

  test("writes notes file on the happy path", () =>
    withTempDir(async (dir) => {
      const notesPath = join(dir, "release_notes.md");
      const bodyPath = join(dir, "body.md");
      await Bun.write(bodyPath, "### Features\n\n- new endpoint");

      const mockMessages: AnthropicMessages = {
        create: async () => ({ content: [{ type: "text", text: "Summary" }] }),
      };

      await generateWithApi(
        { apiKey: "test-key" },
        notesPath,
        bodyPath,
        defaultAnthropicModel,
        dir,
        mockMessages
      );

      const notes = await Bun.file(notesPath).text();
      expect(notes).toBe("Summary");
    }));

  test("forwards tickets.json and pr_descriptions.yml from cwd into the user message", () =>
    withTempDir(async (dir) => {
      await Bun.write(join(dir, ".release_bot/tickets.json"), '{"MEM-1":"first ticket"}');
      await Bun.write(join(dir, ".release_bot/pr_descriptions.yml"), "pr1: described");
      await Bun.write(join(dir, "body.md"), "### Features\n\n- thing");

      let captured: string | undefined;
      const mockMessages: AnthropicMessages = {
        create: async (params) => {
          captured = params.messages[0]?.content;
          return { content: [{ type: "text", text: "ok" }] };
        },
      };

      await generateWithApi(
        { apiKey: "test-key" },
        join(dir, "notes.md"),
        join(dir, "body.md"),
        defaultAnthropicModel,
        dir,
        mockMessages,
      );

      expect(captured).toContain("first ticket");
      expect(captured).toContain("pr1: described");
    }));
});

describe("resolveAnthropicClientOptions", () => {
  test("returns only the options that are set, trimmed", () => {
    const options = resolveAnthropicClientOptions({
      ANTHROPIC_API_KEY: " sk-key ",
      ANTHROPIC_BASE_URL: " https://gateway.example ",
    });
    expect(options).toEqual({ apiKey: "sk-key", baseURL: "https://gateway.example" });
  });

  test("treats blank values as unset", () => {
    expect(
      resolveAnthropicClientOptions({ ANTHROPIC_BASE_URL: "", ANTHROPIC_AUTH_TOKEN: "   " })
    ).toEqual({});
  });

  test("resolves a bearer auth token without an api key", () => {
    expect(resolveAnthropicClientOptions({ ANTHROPIC_AUTH_TOKEN: "tok" })).toEqual({
      authToken: "tok",
    });
  });

  test("throws when both api key and auth token are set", () => {
    expect(() =>
      resolveAnthropicClientOptions({ ANTHROPIC_API_KEY: "k", ANTHROPIC_AUTH_TOKEN: "t" })
    ).toThrow("not both");
  });
});

describe("resolveAnthropicModel", () => {
  test("returns the default when ANTHROPIC_MODEL is unset", () => {
    expect(resolveAnthropicModel({})).toBe(defaultAnthropicModel);
  });

  test("treats a blank ANTHROPIC_MODEL as unset", () => {
    expect(resolveAnthropicModel({ ANTHROPIC_MODEL: "   " })).toBe(defaultAnthropicModel);
  });

  test("returns the trimmed override when set", () => {
    expect(resolveAnthropicModel({ ANTHROPIC_MODEL: " claude-custom-1 " })).toBe("claude-custom-1");
  });
});

describe("runReleaseNotes blank-host coercion", () => {
  test("removes a blank ANTHROPIC_BASE_URL from process.env before SDK use", () =>
    withTempDir(async (dir) => {
      const savedKey = process.env.ANTHROPIC_API_KEY;
      const savedBase = process.env.ANTHROPIC_BASE_URL;
      process.env.ANTHROPIC_API_KEY = "test-key";
      process.env.ANTHROPIC_BASE_URL = "";
      await Bun.write(join(dir, ".release_bot/body"), "### Features\n\n- x");
      const mockMessages: AnthropicMessages = {
        create: async () => ({ content: [{ type: "text", text: "notes" }] }),
      };
      try {
        await runReleaseNotes(dir, mockMessages);
        expect("ANTHROPIC_BASE_URL" in process.env).toBe(false);
      } finally {
        if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = savedKey;
        if (savedBase === undefined) delete process.env.ANTHROPIC_BASE_URL;
        else process.env.ANTHROPIC_BASE_URL = savedBase;
      }
    }));
});
