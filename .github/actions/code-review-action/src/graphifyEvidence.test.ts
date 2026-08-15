/**
 * The Graphify evidence contract as runnable assertions — one rejection per clause the
 * shared block states, so a clause that stops being enforced fails here rather than being
 * discovered in a session.
 *
 * This file and graphifyEvidence.ts are the executable half of issue #597. They do not
 * prove a Claude session honours the contract; nothing in `bun test` can execute a markdown
 * skill. What they prove is that the contract has one machine-checkable meaning, so
 * "graphify was selected" stops being a matter of opinion — see the headers on
 * graphifyEvidenceContract.test.ts and graphifyEvidenceFixture.test.ts for the other two
 * thirds of that split.
 */
import { describe, expect, test } from "bun:test";

import {
  acceptSelection,
  contextFallbackReasons,
  graphifyTransitionReasons,
  maxQueries,
  maxShortlistEntries,
  parseEvidenceRecord,
  parseTransition,
  validateHolderTrace,
  type HolderEvent,
} from "./graphifyEvidence.ts";

/** A record that satisfies every clause; each rejection case below mutates one part of it. */
const validRecord = [
  "context-source: graphify",
  "graphify-trace: queries=3 truncated=yes shortlist=2 outside-reads=1",
  "graphify-shortlist:",
  "- src/app/AppShell.tsx — renders Sidebar, imports useLayout",
  "- src/hooks/useLayout.ts — the hook AppShell depends on",
].join("\n");

/** Build a record from explicit trace values and shortlist bullets. */
function record(trace: string, bullets: string[]): string {
  return ["context-source: graphify", `graphify-trace: ${trace}`, "graphify-shortlist:", ...bullets]
    .join("\n")
    .trimEnd();
}

/** `n` well-formed shortlist bullets, for the cap cases. */
function bullets(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `- src/file${i}.ts — imported by AppShell`);
}

describe("parseEvidenceRecord", () => {
  test("a complete record parses into its parts", () => {
    const result = parseEvidenceRecord(validRecord);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.queries).toBe(3);
    expect(result.evidence.truncated).toBe(true);
    expect(result.evidence.outsideReads).toBe(1);
    expect(result.evidence.shortlist).toEqual([
      {
        target: "src/app/AppShell.tsx",
        relationship: "renders Sidebar, imports useLayout",
      },
      { target: "src/hooks/useLayout.ts", relationship: "the hook AppShell depends on" },
    ]);
  });

  test("a record with no trace line is rejected", () => {
    const missing = ["context-source: graphify", "graphify-shortlist:", ...bullets(1)].join("\n");
    const result = parseEvidenceRecord(missing);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("graphify-trace:");
  });

  test("queries=0 is an unrecorded selection, not a weak one", () => {
    const result = parseEvidenceRecord(
      record("queries=0 truncated=no shortlist=1 outside-reads=0", bullets(1)),
    );
    expect(result.ok).toBe(false);
  });

  test("a fractional query count is rejected", () => {
    const result = parseEvidenceRecord(
      record("queries=1.5 truncated=no shortlist=1 outside-reads=0", bullets(1)),
    );
    expect(result.ok).toBe(false);
  });

  test("a negative query count is rejected", () => {
    const result = parseEvidenceRecord(
      record("queries=-1 truncated=no shortlist=1 outside-reads=0", bullets(1)),
    );
    expect(result.ok).toBe(false);
  });

  test("more queries than the refinement cap allows is rejected", () => {
    const overCap = maxQueries + 1;
    const result = parseEvidenceRecord(
      record(`queries=${overCap} truncated=no shortlist=1 outside-reads=0`, bullets(1)),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("refinement");
  });

  test("an empty shortlist is rejected", () => {
    const result = parseEvidenceRecord(
      record("queries=1 truncated=no shortlist=0 outside-reads=0", []),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("shortlist");
  });

  test("an entry with no relationship is rejected", () => {
    const result = parseEvidenceRecord(
      record("queries=1 truncated=no shortlist=1 outside-reads=0", ["- src/app/AppShell.tsx"]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("relationship");
  });

  test("a shortlist above the cap is rejected", () => {
    const over = maxShortlistEntries + 1;
    const result = parseEvidenceRecord(
      record(`queries=1 truncated=no shortlist=${over} outside-reads=0`, bullets(over)),
    );
    expect(result.ok).toBe(false);
  });

  test("a trace whose count disagrees with the bullets is rejected", () => {
    const result = parseEvidenceRecord(
      record("queries=1 truncated=no shortlist=5 outside-reads=0", bullets(2)),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("disagrees");
  });

  test("a truncation flag outside yes|no is rejected", () => {
    const result = parseEvidenceRecord(
      record("queries=1 truncated=maybe shortlist=1 outside-reads=0", bullets(1)),
    );
    expect(result.ok).toBe(false);
  });
});

describe("parseTransition", () => {
  test.each([...graphifyTransitionReasons])("%s is a recorded reason", (reason) => {
    const line = `context-source: repomix abc123 superseding graphify (${reason})`;
    expect(parseTransition(line)).toEqual({ successor: "repomix abc123", reason });
  });

  test("a default successor keeps its own reason separate from the graph's", () => {
    const line = "context-source: default (no repomix MCP tools) superseding graphify (unavailable)";
    expect(parseTransition(line)).toEqual({
      successor: "default (no repomix MCP tools)",
      reason: "unavailable",
    });
  });

  test("a reason outside the taxonomy is not a transition", () => {
    expect(parseTransition("context-source: repomix abc superseding graphify (gave up)")).toBeNull();
  });

  test("a plain selection is not a transition", () => {
    expect(parseTransition("context-source: repomix abc123")).toBeNull();
  });
});

describe("acceptSelection", () => {
  test("a graphify label backed by a record is accepted", () => {
    const verdict = acceptSelection(validRecord);
    expect(verdict.accepted).toBe(true);
    if (!verdict.accepted) return;
    expect(verdict.source).toBe("graphify");
    expect(verdict.evidence?.shortlist).toHaveLength(2);
  });

  test("a bare graphify label is rejected", () => {
    const verdict = acceptSelection("context-source: graphify");
    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) return;
    expect(verdict.reason).toContain("graphify-trace:");
  });

  test("a graphify label with a trace but no shortlist is rejected", () => {
    const verdict = acceptSelection(
      "context-source: graphify\ngraphify-trace: queries=2 truncated=no shortlist=0 outside-reads=0",
    );
    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) return;
    expect(verdict.reason).toContain("shortlist");
  });

  test("a repomix selection needs no graph evidence", () => {
    const verdict = acceptSelection("context-source: repomix 8b1d56ac");
    expect(verdict.accepted).toBe(true);
    if (!verdict.accepted) return;
    expect(verdict.source).toBe("repomix");
    expect(verdict.evidence).toBeNull();
  });

  test("a transition away from graphify is a successor selection, not a graph claim", () => {
    const verdict = acceptSelection(
      "context-source: repomix 8b1d56ac superseding graphify (unavailable)",
    );
    expect(verdict.accepted).toBe(true);
    if (!verdict.accepted) return;
    expect(verdict.source).toBe("repomix");
  });

  test("a field carrying no selection at all is rejected", () => {
    const verdict = acceptSelection("live tools");
    expect(verdict.accepted).toBe(false);
  });
});

describe("validateHolderTrace", () => {
  const selection: HolderEvent = { holder: "planning", kind: "selection", detail: validRecord };

  test("a query before the first read is the conforming order", () => {
    const verdict = validateHolderTrace([
      selection,
      { holder: "planning", kind: "query", detail: "graphify query \"where is layout decided\"" },
      { holder: "planning", kind: "read", detail: "src/app/AppShell.tsx" },
    ]);
    expect(verdict.valid).toBe(true);
  });

  test("a read before any query is the failure this contract exists for", () => {
    const verdict = validateHolderTrace([
      selection,
      { holder: "planning", kind: "read", detail: "src/app/AppShell.tsx" },
      { holder: "planning", kind: "query", detail: "graphify query \"too late\"" },
    ]);
    expect(verdict.valid).toBe(false);
    if (verdict.valid) return;
    expect(verdict.reason).toContain("before");
  });

  test("a read outside the shortlist needs a recorded fallback", () => {
    const verdict = validateHolderTrace([
      selection,
      { holder: "planning", kind: "query", detail: "graphify query \"q\"" },
      { holder: "planning", kind: "read", detail: "src/unrelated.ts" },
    ]);
    expect(verdict.valid).toBe(false);
    if (verdict.valid) return;
    expect(verdict.reason).toContain("context-fallback:");
  });

  test.each([...contextFallbackReasons])("%s licenses a read outside the shortlist", (reason) => {
    const verdict = validateHolderTrace([
      selection,
      { holder: "planning", kind: "query", detail: "graphify query \"q\"" },
      { holder: "planning", kind: "read", detail: "src/unrelated.ts", fallback: reason },
    ]);
    expect(verdict.valid).toBe(true);
  });

  test("a fallback reason outside the taxonomy does not license the read", () => {
    const verdict = validateHolderTrace([
      selection,
      { holder: "planning", kind: "query", detail: "graphify query \"q\"" },
      { holder: "planning", kind: "read", detail: "src/unrelated.ts", fallback: "seemed-useful" },
    ]);
    expect(verdict.valid).toBe(false);
  });

  test("two live selections in one holder is the mixing the contract forbids", () => {
    const verdict = validateHolderTrace([
      selection,
      { holder: "planning", kind: "selection", detail: "context-source: repomix abc123" },
    ]);
    expect(verdict.valid).toBe(false);
    if (verdict.valid) return;
    expect(verdict.reason).toContain("one source");
  });

  test("a recorded transition is not a second live selection", () => {
    const verdict = validateHolderTrace([
      {
        holder: "planning",
        kind: "selection",
        detail: "context-source: repomix abc123 superseding graphify (unavailable)",
      },
      { holder: "planning", kind: "read", detail: "src/anything.ts" },
    ]);
    expect(verdict.valid).toBe(true);
  });

  test("a holder that inherited the record reads without re-querying", () => {
    const verdict = validateHolderTrace([
      selection,
      { holder: "planning", kind: "query", detail: "graphify query \"q\"" },
      { holder: "implementation", kind: "inherited", detail: validRecord },
      { holder: "implementation", kind: "read", detail: "src/hooks/useLayout.ts" },
    ]);
    expect(verdict.valid).toBe(true);
  });

  test("inheriting the record does not license reading past the shortlist", () => {
    const verdict = validateHolderTrace([
      { holder: "implementation", kind: "inherited", detail: validRecord },
      { holder: "implementation", kind: "read", detail: "src/rediscovered.ts" },
    ]);
    expect(verdict.valid).toBe(false);
    if (verdict.valid) return;
    expect(verdict.reason).toContain("context-fallback:");
  });

  test("a holder that never recorded a selection is rejected", () => {
    const verdict = validateHolderTrace([
      { holder: "implementation", kind: "read", detail: "src/app/AppShell.tsx" },
    ]);
    expect(verdict.valid).toBe(false);
    if (verdict.valid) return;
    expect(verdict.reason).toContain("no selection");
  });
});
