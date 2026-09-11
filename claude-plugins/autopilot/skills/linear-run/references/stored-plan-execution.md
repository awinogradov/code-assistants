# Stored-plan execution

| Source                  | Section                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Stored plan             | `### Summary`, `### Implementation Steps`, `### Files`, `### Context evidence` (v2; optional in v1) |
| Stored plan, **unused** | `### Pre-Implementation`, `### Post-Implementation`                                                 |
| Context Map             | Issue, Related TODOs, In-flight changes, Git state, Snapshot, Session history, Applicable standards |

The two unused sections are read past deliberately. They describe a branch and a post-implementation chain, and this skill supplies both from `run` — the branch because it must be created in _this_ checkout, and the chain because `run` owns it. Consuming a stored copy would mean executing a branch step written for a tree that no longer exists.

Freeze Summary, Implementation Steps, and Files without rewriting. Use Context evidence as retrieval pointers and constraint provenance, then reconcile it with current Applicable standards, including conditions, exceptions, and incompleteness. If a stored step conflicts with a current binding rule, stop and report the conflict; do not silently revise or execute it.
