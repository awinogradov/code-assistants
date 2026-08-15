/**
 * The Graphify evidence contract, expressed as code.
 *
 * The normative text lives in the shared block
 * (claude-plugins/autopilot/skills/shared-rules/references/repomix-snapshot.md); this module
 * is the one place that text has a single machine-checkable meaning. Issue #597 exists
 * because `context-source: graphify` was a label a holder could write without querying
 * anything, so "was the graph tier selected" was answerable only by reading prose and
 * believing it. Here it is answerable by parsing a record.
 *
 * There is deliberately **no production importer**: no runner intercepts a session's tool
 * calls, and inventing one would be a consumer-side hook, which issue #597 lists as a
 * non-goal. The consumers are the guards beside it — graphifyEvidence.test.ts, which asserts
 * one rejection per contract clause, and graphifyEvidenceFixture.test.ts, which drives a real
 * stubbed CLI through a conformance harness. Reviewers and the post-merge canary are the
 * other consumers: a recorded selection can be pasted in and judged rather than argued over.
 *
 * Malformed input is the expected case, not an exceptional one — a record is written by a
 * model into a transcript — so every entry point returns a discriminated verdict carrying the
 * reason it refused. Nothing here throws.
 *
 * @example
 * const verdict = acceptSelection(contextMapSnapshotField);
 * if (!verdict.accepted) stop(`gather-context declared graphify: ${verdict.reason}`);
 *
 * @see https://github.com/awinogradov/code-assistants/issues/597
 */
import { z } from "zod";

/**
 * Why a holder left tier 1. These explain the end of a source, and are not the
 * `contextFallbackReasons` below, which explain one read outside a source still live.
 */
export const graphifyTransitionReasons = ["unavailable", "error", "refinement-exhausted"] as const;

/** The six reasons that license a direct read outside the selected source. */
export const contextFallbackReasons = [
  "absent-or-excluded",
  "truncated-or-unreadable",
  "stale-snapshot",
  "byte-verification",
  "generated-or-untracked",
  "post-snapshot-mutation",
] as const;

/** Shortlist cap from the refinement discipline: ten files or entities. */
export const maxShortlistEntries = 10;

/** Refinement cap: three rounds after the first query, so four invocations in all. */
export const maxQueries = 4;

/** Why a holder left tier 1, narrowed from {@link graphifyTransitionReasons}. */
export type GraphifyTransitionReason = (typeof graphifyTransitionReasons)[number];

const shortlistEntrySchema = z.object({
  target: z.string().min(1, "a shortlist entry needs a path or entity"),
  relationship: z
    .string()
    .min(1, "a shortlist entry needs the relationship that justifies it, after an em dash"),
});

const evidenceSchema = z.object({
  queries: z
    .number()
    .int()
    .min(1, "context-source: graphify needs at least one query that exited zero")
    .max(maxQueries, `refinement is capped at ${maxQueries - 1} rounds after the first query`),
  truncated: z.boolean(),
  shortlist: z
    .array(shortlistEntrySchema)
    .min(1, "a graphify selection hands on a shortlist, not a source name")
    .max(maxShortlistEntries, `a shortlist holds at most ${maxShortlistEntries} entries`),
  outsideReads: z.number().int().min(0),
});

/** A parsed evidence record: what the pass did, and what it produced. */
export type GraphifyEvidence = z.infer<typeof evidenceSchema>;

/** One shortlist bullet: where to look, and the relationship that put it there. */
export type ShortlistEntry = z.infer<typeof shortlistEntrySchema>;

/** A record that satisfies every clause. */
export interface EvidenceParsed {
  ok: true;
  evidence: GraphifyEvidence;
}

/** A record that does not, with the clause it failed. */
export interface EvidenceInvalid {
  ok: false;
  reason: string;
}

/** The outcome of reading an evidence record. */
export type EvidenceResult = EvidenceParsed | EvidenceInvalid;

/** The tier a `context-source:` line names. */
export type ContextSource = "graphify" | "repomix" | "default";

/** A selection a consumer may proceed on; `evidence` is null off the graph tier. */
export interface SelectionAccepted {
  accepted: true;
  source: ContextSource;
  evidence: GraphifyEvidence | null;
}

/** A selection a consumer must refuse, with what was missing. */
export interface SelectionRejected {
  accepted: false;
  reason: string;
}

/** The outcome of the gate a consuming skill applies to a Context Map's Snapshot field. */
export type SelectionVerdict = SelectionAccepted | SelectionRejected;

/** A recorded hand-over from tier 1 to whatever replaced it. */
export interface GraphifyTransition {
  successor: string;
  reason: GraphifyTransitionReason;
}

/**
 * One recorded act by one context holder, in the order it happened.
 *
 * `selection` and `inherited` both carry a record, and the difference decides whether the
 * ordering rule applies: a holder that selected the graph tier itself must query before it
 * reads, while one that inherited the record from an upstream holder must not re-derive what
 * it was handed. Both are bound to the shortlist.
 */
export interface HolderEvent {
  /** Distinguishes the planning holder from the implementation holder that follows it. */
  holder: string;
  kind: "selection" | "inherited" | "query" | "read";
  /** The `context-source:` record, the graph invocation, or the path read. */
  detail: string;
  /** A `context-fallback:` reason recorded beside a read outside the shortlist. */
  fallback?: string;
}

/** A trace whose ordering and reads honour the contract. */
export interface TraceValid {
  valid: true;
}

/** A trace that does not, with the first violation found. */
export interface TraceInvalid {
  valid: false;
  reason: string;
}

/** The outcome of judging one recorded run. */
export type TraceVerdict = TraceValid | TraceInvalid;

const tracePattern =
  /^graphify-trace: queries=(\S+) truncated=(\S+) shortlist=(\S+) outside-reads=(\S+)$/m;

/** Em dash only: the hyphen form would swallow hyphenated paths. */
const shortlistBulletPattern = /^- (.+?) — (.+)$/;

const transitionPattern = /^context-source: (.+?) superseding graphify \(([^)]+)\)$/;

/**
 * Read the three-line evidence record a graphify pass hands on.
 *
 * Accepts the record on its own or embedded in a larger field, so a Context Map's
 * `**Snapshot**` row can be passed in whole.
 */
export function parseEvidenceRecord(record: string): EvidenceResult {
  const trace = tracePattern.exec(record);
  if (!trace) return { ok: false, reason: "no graphify-trace: line — the pass recorded nothing" };

  const [, queries, truncated, declared, outsideReads] = trace;
  if (truncated !== "yes" && truncated !== "no") {
    return { ok: false, reason: `truncated=${truncated} is neither yes nor no` };
  }

  const shortlist = parseShortlist(record);
  if (shortlist.some((entry) => entry.relationship === "")) {
    return { ok: false, reason: "a shortlist entry carries no relationship" };
  }
  if (Number(declared) !== shortlist.length) {
    return {
      ok: false,
      reason: `graphify-trace: shortlist=${declared} disagrees with ${shortlist.length} bullet(s)`,
    };
  }

  const parsed = evidenceSchema.safeParse({
    queries: Number(queries),
    truncated: truncated === "yes",
    shortlist,
    outsideReads: Number(outsideReads),
  });
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  return { ok: true, evidence: parsed.data };
}

/**
 * Decide whether a recorded selection may be proceeded on.
 *
 * This is the gate `linear-run` applies to the Context Map's `**Snapshot**` field: off the
 * graph tier any well-formed `context-source:` line is enough, while a graphify label must
 * bring its record. A bare label is refused rather than downgraded — a pass that genuinely
 * failed has the `superseding graphify (<reason>)` transition to leave through.
 */
export function acceptSelection(snapshot: string): SelectionVerdict {
  const line = snapshot.split("\n").find((candidate) => candidate.startsWith("context-source: "));
  if (!line) return { accepted: false, reason: "no context-source: line" };

  const transition = parseTransition(line);
  const declared = transition ? transition.successor : line.slice("context-source: ".length);
  const source = readSource(declared);
  if (!source) return { accepted: false, reason: `unknown context source in "${line}"` };
  if (source !== "graphify") return { accepted: true, source, evidence: null };

  const parsed = parseEvidenceRecord(snapshot);
  if (!parsed.ok) return { accepted: false, reason: parsed.reason };
  return { accepted: true, source, evidence: parsed.evidence };
}

/** Read a hand-over line; null when the line is a plain selection or names no known reason. */
export function parseTransition(line: string): GraphifyTransition | null {
  const match = transitionPattern.exec(line.trim());
  if (!match) return null;

  const [, successor, reason] = match;
  if (!isTransitionReason(reason)) return null;
  return { successor, reason };
}

/**
 * Judge one recorded run: every holder selects exactly once, a graph selection queries
 * before it reads, and reads outside the shortlist carry a reason from the taxonomy.
 *
 * Events are the ordered log a harness records; holders are judged independently, because
 * the contract binds each context holder separately.
 */
export function validateHolderTrace(events: HolderEvent[]): TraceVerdict {
  const holders = new Set(events.map((event) => event.holder));
  for (const holder of holders) {
    const verdict = validateOneHolder(events.filter((event) => event.holder === holder));
    if (!verdict.valid) return verdict;
  }
  return { valid: true };
}

/**
 * Judge a single holder's events; the loop body of {@link validateHolderTrace}.
 *
 * A transition line replaces whatever was live, which is what makes falling through legal; a
 * plain selection arriving while a source is already live is the side-by-side running the
 * contract forbids. Read rules are judged against the record that ends up live — a superseded
 * graph pass has no shortlist to have read against, since that is why it was superseded.
 */
function validateOneHolder(events: HolderEvent[]): TraceVerdict {
  const records = events.filter((event) => event.kind === "selection" || event.kind === "inherited");
  if (records.length === 0) return { valid: false, reason: "the holder recorded no selection" };

  let live = records[0];
  for (const record of records.slice(1)) {
    if (parseTransition(firstLine(record.detail)) === null) {
      return { valid: false, reason: "a holder serves one source, not several" };
    }
    live = record;
  }

  const verdict = acceptSelection(live.detail);
  if (!verdict.accepted) return { valid: false, reason: verdict.reason };
  if (verdict.source !== "graphify" || !verdict.evidence) return { valid: true };

  return validateGraphReads(events, verdict.evidence, live.kind === "inherited");
}

/**
 * Ordering and read-scope rules that apply once the graph tier is in play. An inherited
 * record starts already queried — the upstream holder ran it, and re-running it is the
 * duplication the handoff exists to remove.
 */
function validateGraphReads(
  events: HolderEvent[],
  evidence: GraphifyEvidence,
  inherited: boolean,
): TraceVerdict {
  const shortlisted = new Set(evidence.shortlist.map((entry) => entry.target));
  let queried = inherited;

  for (const event of events) {
    if (event.kind === "query") queried = true;
    if (event.kind !== "read") continue;
    if (!queried) {
      return { valid: false, reason: `read ${event.detail} before any graphify query` };
    }
    if (shortlisted.has(event.detail)) continue;
    if (!event.fallback || !isFallbackReason(event.fallback)) {
      return {
        valid: false,
        reason: `read ${event.detail} outside the shortlist with no context-fallback: reason`,
      };
    }
  }
  return { valid: true };
}

/** Collect the `graphify-shortlist:` bullets; an entry with no em dash keeps an empty relationship. */
function parseShortlist(record: string): ShortlistEntry[] {
  const lines = record.split("\n");
  const header = lines.findIndex((line) => line.trim() === "graphify-shortlist:");
  if (header === -1) return [];

  const entries: ShortlistEntry[] = [];
  for (const line of lines.slice(header + 1)) {
    if (!line.startsWith("- ")) break;
    const bullet = shortlistBulletPattern.exec(line);
    entries.push(
      bullet
        ? { target: bullet[1].trim(), relationship: bullet[2].trim() }
        : { target: line.slice(2).trim(), relationship: "" },
    );
  }
  return entries;
}

/** The tier a declared selection names, ignoring whatever qualifies it. */
function readSource(declared: string): ContextSource | null {
  if (declared === "graphify" || declared.startsWith("graphify ")) return "graphify";
  if (declared.startsWith("repomix")) return "repomix";
  if (declared.startsWith("default")) return "default";
  return null;
}

/** The first line of a possibly multi-line record. */
function firstLine(detail: string): string {
  return detail.split("\n")[0];
}

function isTransitionReason(value: string): value is GraphifyTransitionReason {
  return (graphifyTransitionReasons as readonly string[]).includes(value);
}

function isFallbackReason(value: string): boolean {
  return (contextFallbackReasons as readonly string[]).includes(value);
}
