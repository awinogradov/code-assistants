/**
 * Tests for the shared GitHub Actions output helper.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { setOutput } from "./actionsOutput.ts";

describe("setOutput", () => {
  let tempDir: string;
  let outputFile: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "actionsOutput-test-"));
    outputFile = join(tempDir, "GITHUB_OUTPUT");
    await Bun.write(outputFile, "");
    process.env.GITHUB_OUTPUT = outputFile;
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await rm(tempDir, { recursive: true });
  });

  test("writes output with heredoc delimiter", async () => {
    await setOutput("test_key", "test_value");

    const content = await readFile(outputFile, "utf8");
    expect(content).toMatch(/^test_key<<EOF_[a-f0-9]+\ntest_value\nEOF_[a-f0-9]+\n$/);
  });

  test("handles multi-line values", async () => {
    await setOutput("json", '{"key":"value",\n"nested":true}');

    const content = await readFile(outputFile, "utf8");
    expect(content).toContain('{"key":"value",\n"nested":true}');
  });

  test("does nothing without GITHUB_OUTPUT", async () => {
    delete process.env.GITHUB_OUTPUT;
    await setOutput("key", "value");
    // Should not throw
  });

  test("appends multiple outputs", async () => {
    await setOutput("key1", "val1");
    await setOutput("key2", "val2");

    const content = await readFile(outputFile, "utf8");
    expect(content).toContain("key1<<EOF_");
    expect(content).toContain("key2<<EOF_");
  });
});
