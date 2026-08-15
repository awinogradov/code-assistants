/**
 * A conformance harness for the Graphify evidence contract: a temporary repository carrying
 * `graphify-out/graph.json`, a deterministic `graphify` executable reached only through the
 * spawn call's own PATH, and instrumented recorders standing in for Read/Grep/Glob/Bash and a
 * delegated context agent. Every act lands in one ordered log the parent process owns, so
 * "the query happened before the first traversal" is read off recorded invocations — the
 * `graphify` process really is spawned, and really does exit, before the first read is
 * appended — rather than off a sentence in a skill file.
 *
 * What this proves, precisely: that a holder written to follow the contract produces a log
 * the validator accepts, that each violation the contract names produces one it rejects, and
 * that the shortlist survives the hand-off from the holder that queried to the holder that
 * implements — in both the stored-plan shape (the record travels in a plan file's
 * `## Context source` section) and the fresh-plan shape (it travels in the Context Map).
 *
 * What it does NOT prove, and no test in this repository can: that a live Claude session
 * behaves this way. The holders below are scripted, because `bun test` cannot execute a
 * markdown skill, and a fixture that quietly swapped a scripted holder for a real one would
 * be the same substitution issue #597 was filed about, pointed the other way. Production
 * conformance stays a post-merge canary — with a durable artifact to read now, since the
 * selection lands in the plan file rather than only in a transcript.
 *
 * POSIX only: the stub is a `/bin/sh` script made executable with mode 0o755, which is what
 * the Linux runners in .github/workflows/test.yml provide.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  acceptSelection,
  graphifyTransitionReasons,
  maxQueries,
  parseEvidenceRecord,
  parseTransition,
  validateHolderTrace,
  type HolderEvent,
} from "./graphifyEvidence.ts";

/** Generous enough for four sequential spawns on a loaded runner, short enough to fail fast. */
const spawnTimeoutMs = 20_000;

/** What the stub should pretend the graph returned, chosen per invocation. */
type StubMode = "focused" | "truncated" | "empty" | "error";

/** The shortlist the stub returns on a focused answer, and the files backing it. */
const knownShortlist = [
  { target: "src/app/AppShell.tsx", relationship: "renders Sidebar, imports useLayout" },
  { target: "src/hooks/useLayout.ts", relationship: "the hook AppShell depends on" },
];

const stubScript = `#!/bin/sh
case "\${GRAPHIFY_STUB_MODE:-focused}" in
  error)     echo "error: graph file not found" >&2; exit 1 ;;
  empty)     echo "No matching nodes found."; exit 0 ;;
  truncated) echo "[!] TRUNCATED: showing 52 of 918 nodes"; exit 0 ;;
esac
echo "${knownShortlist[0].target} — ${knownShortlist[0].relationship}"
echo "${knownShortlist[1].target} — ${knownShortlist[1].relationship}"
`;

let repoDir = "";
let binDir = "";

beforeAll(async () => {
  repoDir = await mkdtemp(join(tmpdir(), "graphify-evidence-"));
  binDir = join(repoDir, "bin");
  await mkdir(binDir, { recursive: true });
  await mkdir(join(repoDir, "graphify-out"), { recursive: true });
  await mkdir(join(repoDir, "src/app"), { recursive: true });
  await mkdir(join(repoDir, "src/hooks"), { recursive: true });

  await writeFile(join(repoDir, "graphify-out/graph.json"), '{"nodes":[],"edges":[]}');
  await writeFile(join(binDir, "graphify"), stubScript, { mode: 0o755 });
  for (const entry of knownShortlist) {
    await writeFile(join(repoDir, entry.target), `// ${entry.relationship}\n`);
  }
});

afterAll(async () => {
  if (repoDir) await rm(repoDir, { recursive: true, force: true });
});

/**
 * One run's ordered log, owned by the parent process.
 *
 * Deliberately in memory rather than a file both the stub and the harness append to: two
 * writers ordered by whenever their writes land is a race, and the ordering claim is the
 * whole point. Here the order is program order — the spawn is awaited to completion before
 * its event is appended, so a read recorded after a query provably followed it.
 */
function createRecorder(holder: string) {
  const events: HolderEvent[] = [];

  return {
    events,
    record(detail: string, kind: HolderEvent["kind"] = "selection") {
      events.push({ holder, kind, detail });
    },
    read(path: string, fallback?: string) {
      events.push({ holder, kind: "read", detail: path, fallback });
    },
    /** Stands in for a Grep/Glob/Bash sweep or a delegated context agent. */
    traverse(what: string, fallback?: string) {
      events.push({ holder, kind: "read", detail: what, fallback });
    },
    async query(question: string, mode: StubMode): Promise<{ exitCode: number; stdout: string }> {
      const proc = Bun.spawn({
        cmd: ["graphify", "query", question],
        cwd: repoDir,
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, GRAPHIFY_STUB_MODE: mode },
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      events.push({ holder, kind: "query", detail: `graphify query ${question}` });
      return { exitCode, stdout };
    },
  };
}

/** Render the three-line evidence record a conforming pass hands on. */
function renderRecord(queries: number, truncated: boolean, outsideReads: number): string {
  return [
    "context-source: graphify",
    `graphify-trace: queries=${queries} truncated=${truncated ? "yes" : "no"} shortlist=${knownShortlist.length} outside-reads=${outsideReads}`,
    "graphify-shortlist:",
    ...knownShortlist.map((entry) => `- ${entry.target} — ${entry.relationship}`),
  ].join("\n");
}

/**
 * A planning holder following the contract: query first, classify, refine a truncated answer,
 * and only then record a selection and read what the graph named.
 *
 * Returns the record it produced, or the transition line it left through.
 */
async function runPlanningHolder(modes: StubMode[]) {
  const recorder = createRecorder("planning");
  let truncated = false;

  for (const [round, mode] of modes.entries()) {
    const { exitCode, stdout } = await recorder.query(`round-${round}`, mode);
    if (exitCode !== 0) {
      return { transition: transitionLine("error"), events: recorder.events };
    }
    if (stdout.includes("[!] TRUNCATED")) {
      truncated = true;
      continue;
    }
    if (stdout.includes("No matching nodes found.")) continue;

    const record = renderRecord(round + 1, truncated, 0);
    recorder.record(record);
    for (const entry of knownShortlist) recorder.read(entry.target);
    return { record, events: recorder.events };
  }
  return { transition: transitionLine("refinement-exhausted"), events: recorder.events };
}

/** The hand-over line a failed or ineligible pass leaves behind. */
function transitionLine(reason: (typeof graphifyTransitionReasons)[number]): string {
  return `context-source: repomix pack-abc123 superseding graphify (${reason})`;
}

/** An implementation holder that inherits the record and reads only what it names. */
function runImplementationHolder(record: string) {
  const recorder = createRecorder("implementation");
  recorder.record(record, "inherited");

  const parsed = parseEvidenceRecord(record);
  if (parsed.ok) {
    for (const entry of parsed.evidence.shortlist) recorder.read(entry.target);
  }
  return recorder.events;
}

/** The plan file's `## Context source` section, the stored-plan channel for the record. */
function renderPlanFile(record: string): string {
  return ["# A plan", "", "## Summary", "", "Something.", "", "## Context source", "", record, ""].join(
    "\n",
  );
}

/** Read the record back out of a plan file, as an implementation session would. */
function readContextSourceSection(plan: string): string {
  const [, after = ""] = plan.split("## Context source\n");
  return after.split(/\n## /)[0].trim();
}

describe("a conforming pass records the query before it traverses", () => {
  test(
    "the graphify process exits before the first read is recorded",
    async () => {
      const { record, events } = await runPlanningHolder(["focused"]);
      expect(record).toBeDefined();

      const firstQuery = events.findIndex((event) => event.kind === "query");
      const firstRead = events.findIndex((event) => event.kind === "read");
      expect(firstQuery).toBeGreaterThanOrEqual(0);
      expect(firstRead).toBeGreaterThan(firstQuery);
      expect(events[firstQuery].detail).toContain("graphify query");
    },
    spawnTimeoutMs,
  );

  test(
    "the recorded log satisfies the validator",
    async () => {
      const { events } = await runPlanningHolder(["focused"]);
      expect(validateHolderTrace(events).valid).toBe(true);
    },
    spawnTimeoutMs,
  );

  test(
    "a truncated first answer is refined rather than accepted",
    async () => {
      const { record, events } = await runPlanningHolder(["truncated", "focused"]);
      const parsed = parseEvidenceRecord(record ?? "");
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.evidence.queries).toBe(2);
      expect(parsed.evidence.truncated).toBe(true);
      expect(events.filter((event) => event.kind === "query")).toHaveLength(2);
    },
    spawnTimeoutMs,
  );

  test(
    "a holder that traverses before querying is rejected",
    async () => {
      const recorder = createRecorder("planning");
      recorder.record(renderRecord(1, false, 0));
      recorder.traverse("src/app/AppShell.tsx");
      await recorder.query("too late", "focused");

      const verdict = validateHolderTrace(recorder.events);
      expect(verdict.valid).toBe(false);
      if (verdict.valid) return;
      expect(verdict.reason).toContain("before any graphify query");
    },
    spawnTimeoutMs,
  );
});

describe("the shortlist survives the hand-off", () => {
  test(
    "a fresh-plan implementation holder consumes the record it was handed",
    async () => {
      const { record, events } = await runPlanningHolder(["focused"]);
      const downstream = runImplementationHolder(record ?? "");

      expect(validateHolderTrace([...events, ...downstream]).valid).toBe(true);
      const reads = downstream.filter((event) => event.kind === "read").map((e) => e.detail);
      expect(reads).toEqual(knownShortlist.map((entry) => entry.target));
    },
    spawnTimeoutMs,
  );

  test(
    "a stored-plan implementation holder recovers the record from the plan file",
    async () => {
      const { record } = await runPlanningHolder(["focused"]);
      const planPath = join(repoDir, "plan.md");
      await writeFile(planPath, renderPlanFile(record ?? ""));

      const recovered = readContextSourceSection(await Bun.file(planPath).text());
      expect(recovered).toBe(record ?? "");
      expect(validateHolderTrace(runImplementationHolder(recovered)).valid).toBe(true);
    },
    spawnTimeoutMs,
  );

  test("a hand-off carrying only paths is not evidence", () => {
    const pathsOnly = [
      "context-source: graphify",
      "graphify-trace: queries=1 truncated=no shortlist=2 outside-reads=0",
      "graphify-shortlist:",
      ...knownShortlist.map((entry) => `- ${entry.target}`),
    ].join("\n");

    const verdict = acceptSelection(pathsOnly);
    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) return;
    expect(verdict.reason).toContain("relationship");
  });

  test("an inherited record does not license rediscovery around it", () => {
    const events = runImplementationHolder(renderRecord(1, false, 0));
    events.push({
      holder: "implementation",
      kind: "read",
      detail: "src/somewhere/else.ts",
    });
    expect(validateHolderTrace(events).valid).toBe(false);
  });
});

describe("every exit from the tier is recorded", () => {
  test("a declared selection with no query evidence fails", () => {
    const verdict = acceptSelection("context-source: graphify");
    expect(verdict.accepted).toBe(false);
  });

  test("an ineligible repository transitions as unavailable", () => {
    // No graph.json means no query is attempted at all, so eligibility is the whole test.
    const line = transitionLine("unavailable");
    expect(parseTransition(line)?.reason).toBe("unavailable");
    expect(acceptSelection(line).accepted).toBe(true);
  });

  test(
    "a failing CLI transitions as error",
    async () => {
      const { transition, events } = await runPlanningHolder(["error"]);
      expect(parseTransition(transition ?? "")?.reason).toBe("error");
      expect(events.filter((event) => event.kind === "read")).toHaveLength(0);
    },
    spawnTimeoutMs,
  );

  test(
    "an unrefinable answer transitions as refinement-exhausted",
    async () => {
      const modes = Array.from({ length: maxQueries }, (): StubMode => "truncated");
      const { transition, events } = await runPlanningHolder(modes);

      expect(parseTransition(transition ?? "")?.reason).toBe("refinement-exhausted");
      expect(events.filter((event) => event.kind === "query")).toHaveLength(maxQueries);
      expect(events.filter((event) => event.kind === "read")).toHaveLength(0);
    },
    spawnTimeoutMs,
  );

  test(
    "an empty answer that never narrows also exhausts rather than falling through silently",
    async () => {
      const { transition } = await runPlanningHolder(["empty", "empty"]);
      expect(parseTransition(transition ?? "")?.reason).toBe("refinement-exhausted");
    },
    spawnTimeoutMs,
  );

  test("a transition is a successor selection, so one source stays active", () => {
    const events: HolderEvent[] = [
      { holder: "planning", kind: "selection", detail: transitionLine("error") },
      { holder: "planning", kind: "read", detail: "src/anything.ts" },
    ];
    expect(validateHolderTrace(events).valid).toBe(true);

    events.push({ holder: "planning", kind: "selection", detail: "context-source: default (none)" });
    expect(validateHolderTrace(events).valid).toBe(false);
  });
});
