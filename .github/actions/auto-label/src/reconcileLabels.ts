/**
 * Pure set-reconciliation for a PR's workspace labels. Given the labels currently
 * on the PR (already filtered to our prefix) and the labels the diff should carry,
 * it returns which to add and which to remove — no I/O, so it is trivially tested.
 *
 * @example
 *   reconcileLabels(["a/old", "a/x"], ["a/x", "a/new"]);
 *   // { add: ["a/new"], remove: ["a/old"] }
 */

/** The add/remove delta to apply to a pull request's labels. */
export interface LabelReconciliation {
  add: string[];
  remove: string[];
}

/**
 * Computes the add/remove delta between the current and desired label sets.
 * Order-independent; both lists are de-duplicated and sorted for stable output.
 */
export function reconcileLabels(current: string[], desired: string[]): LabelReconciliation {
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);
  return {
    add: dedupeSorted(desired.filter((label) => !currentSet.has(label))),
    remove: dedupeSorted(current.filter((label) => !desiredSet.has(label))),
  };
}

function dedupeSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
