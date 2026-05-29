/**
 * Shared schema for the structured findings each `pr:review:*` sub-agent emits.
 *
 * Sub-agents used to return a markdown review block that the root model
 * re-parsed; they now emit a compact JSON object validated by these schemas via
 * the Agent SDK `outputFormat: json_schema` contract. Keeping the schema in one
 * place lets both the orchestrator (`reviewFanout.ts`) and the deterministic
 * merge (`aggregateReviews.ts`) share the same validated shape.
 *
 * @example
 * const parsed = agentOutputSchema.safeParse(resultMessage.structured_output);
 * if (parsed.success) writeFindings(parsed.data.findings);
 */
import { z } from "zod";

/** Severity ladder shared by every review finding (maps to 🚧 / 🙋‍♂️ / 💡). */
export const reviewSeveritySchema = z.enum(["blocker", "suggestion", "nitpick"]);

/**
 * One reviewer finding. `line` is null for out-of-diff issues (rendered in the
 * review body only); `rule` is null when the finding maps to no `CHECK-` code.
 */
export const reviewFindingSchema = z.object({
  severity: reviewSeveritySchema,
  file: z.string(),
  line: z.number().nullable(),
  rule: z.string().nullable(),
  title: z.string(),
  detail: z.string(),
});

/** The JSON object the SDK enforces on each sub-agent — the category is known by the orchestrator. */
export const agentOutputSchema = z.object({
  findings: z.array(reviewFindingSchema),
});

/** One sub-agent's findings tagged with its bare review category, fed to the aggregator. */
export const agentReviewSchema = z.object({
  category: z.string(),
  findings: z.array(reviewFindingSchema),
});

/** Finding severity (`blocker` | `suggestion` | `nitpick`). */
export type ReviewSeverity = z.infer<typeof reviewSeveritySchema>;

/** A single validated reviewer finding. */
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;

/** A sub-agent's structured output as enforced by the SDK. */
export type AgentOutput = z.infer<typeof agentOutputSchema>;

/** A sub-agent's findings tagged with its category. */
export type AgentReview = z.infer<typeof agentReviewSchema>;

/**
 * JSON Schema handed to the SDK `outputFormat` so each sub-agent query is forced
 * to return a schema-valid {@link AgentOutput}. Derived once from the Zod schema.
 */
export const agentOutputJsonSchema = z.toJSONSchema(agentOutputSchema) as Record<string, unknown>;
