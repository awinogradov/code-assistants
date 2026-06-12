/**
 * Open or update the deduplicated cost-report issue.
 *
 * Entry for the action's `report` step (runs only on a breach). Dedup keys on
 * the `<!-- code-review-cost-report -->` HTML marker plus the configured
 * label, searched across open AND closed issues: closing the issue without
 * fixing the cost must not spawn a fresh issue every day, so the cooldown is
 * honored against the newest marker activity regardless of state. When
 * attribution was requested but produced no narrative, the report says so
 * explicitly instead of omitting the section silently.
 *
 * @example
 * GH_TOKEN=… GITHUB_REPOSITORY=owner/repo REPORT_FILE=/tmp/report.md \
 *   ISSUE_LABEL=code-review-cost COOLDOWN_DAYS=7 bun src/reportIssue.ts
 */
import { notice, setOutput, summary } from "@actions/core";
import type { Octokit } from "@octokit/rest";
import { parseRepo } from "@code-assistants/actions-core/parseRepo";
import { z } from "zod";

import { createRetryingOctokit } from "./collectRuns.ts";

/** HTML marker identifying cost-report issues and comments for dedup. */
export const reportMarker = "<!-- code-review-cost-report -->";

/** Title of the issue the monitor opens on a breach. */
export const reportIssueTitle = "Code review cost regression report";

/** Attribution outcome attached to the posted report. */
export interface AttributionResult {
  requested: boolean;
  narrative?: string;
}

/** Parameters for one report posting. */
export interface PostReportParams {
  owner: string;
  repo: string;
  issueLabel: string;
  cooldownDays: number;
  report: string;
  attribution: AttributionResult;
  now: Date;
}

/** Outcome of a posting attempt. */
export interface PostReportResult {
  issueUrl: string;
  action: "created" | "commented" | "skipped-cooldown";
}

/** Assemble the marker-bounded body posted as issue or comment. */
export function buildIssueBody(report: string, attribution: AttributionResult): string {
  const sections = [reportMarker, "", report];
  if (attribution.requested) {
    sections.push(
      "",
      "### Root cause (model-attributed)",
      "",
      attribution.narrative ?? "Attribution unavailable (model step failed or was skipped).",
    );
  }
  return sections.join("\n");
}

/** Newest ISO timestamp of marker activity on an issue (body or comments). */
async function lastMarkerActivity(
  octokit: Octokit,
  params: { owner: string; repo: string; issueNumber: number; createdAt: string },
): Promise<number> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner: params.owner,
    repo: params.repo,
    issue_number: params.issueNumber,
    per_page: 100,
  });

  const markerTimes = comments
    .filter((comment) => comment.body?.includes(reportMarker))
    .map((comment) => Date.parse(comment.created_at));

  return Math.max(Date.parse(params.createdAt), ...markerTimes);
}

/**
 * Post the report: comment on the open marker issue, create a new one when
 * none exists (or the newest is closed), or skip inside the cooldown window.
 */
export async function postReport(
  octokit: Octokit,
  params: PostReportParams,
): Promise<PostReportResult> {
  const { owner, repo, issueLabel, cooldownDays, report, attribution, now } = params;
  const body = buildIssueBody(report, attribution);

  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    labels: issueLabel,
    state: "all",
    sort: "updated",
    direction: "desc",
    per_page: 100,
  });
  // The issues API returns pull requests too; the marker narrows the rest.
  const existing = issues.find((issue) => !issue.pull_request && issue.body?.includes(reportMarker));

  if (existing) {
    const lastActivity = await lastMarkerActivity(octokit, {
      owner,
      repo,
      issueNumber: existing.number,
      createdAt: existing.created_at,
    });
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
    if (now.getTime() - lastActivity < cooldownMs) {
      return { issueUrl: existing.html_url, action: "skipped-cooldown" };
    }

    if (existing.state === "open") {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: existing.number,
        body,
      });
      return { issueUrl: existing.html_url, action: "commented" };
    }
  }

  const { data: created } = await octokit.rest.issues.create({
    owner,
    repo,
    title: reportIssueTitle,
    labels: [issueLabel],
    body,
  });
  return { issueUrl: created.html_url, action: "created" };
}

/** Env contract of the report step, validated at the boundary. */
const envSchema = z.object({
  GH_TOKEN: z.string().min(1),
  GITHUB_REPOSITORY: z.string().min(1),
  REPORT_FILE: z.string().min(1),
  ISSUE_LABEL: z.string().min(1),
  COOLDOWN_DAYS: z.coerce.number().int().nonnegative(),
  ATTRIBUTION_REQUESTED: z.string().optional(),
  ATTRIBUTION_JSON: z.string().optional(),
});

/** Narrative shape produced by the attribution runClaude.ts pass. */
const narrativeSchema = z.object({ narrative: z.string().min(1) });

/** Parse the attribute step's structured_output; absent or invalid → no narrative. */
export function parseAttribution(requested: boolean, raw: string | undefined): AttributionResult {
  if (!requested) return { requested: false };
  if (!raw) return { requested: true };

  try {
    const result = narrativeSchema.safeParse(JSON.parse(raw));
    return result.success ? { requested: true, narrative: result.data.narrative } : { requested: true };
  } catch {
    return { requested: true };
  }
}

/** Annotation message linking the posted (or cooldown-suppressed) report issue. */
export function reportAnnotation(result: PostReportResult): string {
  return `Cost report ${result.action}: ${result.issueUrl}`;
}

async function run(): Promise<void> {
  const env = envSchema.parse(process.env);
  const { owner, repo } = parseRepo(env.GITHUB_REPOSITORY);
  const report = await Bun.file(env.REPORT_FILE).text();
  const attribution = parseAttribution(env.ATTRIBUTION_REQUESTED === "true", env.ATTRIBUTION_JSON);

  const result = await postReport(createRetryingOctokit(env.GH_TOKEN), {
    owner,
    repo,
    issueLabel: env.ISSUE_LABEL,
    cooldownDays: env.COOLDOWN_DAYS,
    report,
    attribution,
    now: new Date(),
  });

  notice(reportAnnotation(result), { title: reportIssueTitle });
  await summary.addRaw(`### [${reportIssueTitle}](${result.issueUrl})`).write();
  setOutput("issue_url", result.issueUrl);
}

if (import.meta.main) {
  await run();
}
