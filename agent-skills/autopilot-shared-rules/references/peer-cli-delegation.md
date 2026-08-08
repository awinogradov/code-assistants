<!-- peer-cli:start -->

### Peer CLI delegation

The peer CLI runs a second model as a **colleague, not an authority** — its output is evaluated critically, never accepted blindly. Everything below is CLI-agnostic; **the invoking skill supplies the CLI name, the exec command, the resume syntax, and the flag table**, and this block covers everything that does not depend on which CLI is being driven.

**Delegation.** Compose the prompt as a complete, self-contained task description — the peer sees none of this conversation, so include the relevant paths, constraints, and expected output. The peer CLI operates on the current working directory; run it from the repository the task concerns, and reach for the invoking skill's directory flags only when the task lives elsewhere. Run the command, capture stdout (filtered as appropriate), and summarize the outcome for the user. Then tell the user they can resume this session at any time by asking to continue with additional analysis or changes.

**Following up.** After every peer command, use `AskUserQuestion` to confirm next steps, collect clarifications, or decide whether to resume. Resume with the invoking skill's resume syntax; the resumed session inherits the original model and settings, so pass no configuration flags unless the user explicitly requests a change. Restate the chosen model and mode settings when proposing follow-up actions.

**Critical evaluation.** The peer model has its own knowledge cutoff and limitations.

- **Trust your own knowledge** when confident. If the peer claims something you know is wrong, push back directly.
- **Research disagreements** with `WebSearch` or documentation before accepting the peer's claims.
- **Remember knowledge cutoffs** — the peer may not know about recent releases, APIs, or changes.
- **Don't defer blindly**, especially on model names/capabilities, recent library versions or API changes, and evolving best practices.

When the peer is wrong: state the disagreement to the user, provide evidence, and optionally resume the session to discuss — identify yourself as Claude using your actual current model name, frame it as a peer discussion (either AI could be wrong), and let the user decide on genuine ambiguity.

**Error handling.**

- Stop and report failures whenever the CLI's version check or a delegated command exits non-zero; ask for direction before retrying.
- Before using high-impact flags (the invoking skill lists them) ask permission via `AskUserQuestion` unless already granted.
- When output includes warnings or partial results, summarize them and ask how to adjust via `AskUserQuestion`.
- **IMPORTANT (stdin):** the peer CLI reads stdin and combines it with the prompt. When stdin is not a TTY but also not closed (background tasks, hooks, scripts), the process blocks forever waiting for input — append `</dev/null` to the command. Symptom of getting this wrong: zero bytes of stdout, zero CPU, process hangs.

<!-- peer-cli:end -->
