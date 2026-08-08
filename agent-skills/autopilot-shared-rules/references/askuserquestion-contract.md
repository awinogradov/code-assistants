<!-- auq-contract:start -->

### AskUserQuestion content-preview contract

These rules govern every AskUserQuestion call that presents generated content for review — an issue, PR, commit message, or similar preview dialog. Simple choice dialogs that present no content are exempt from the preview requirement. The invoking skill supplies the concrete strings: the `question` and `header` text, the option labels and descriptions, and which of its dialogs this contract governs.

1. **`question` is FIXED TEXT** — use the EXACT string the invoking phase specifies. NEVER add generated content (titles, bodies, messages, diffs, file lists, metadata) to the question field.
2. **`header` is FIXED TEXT** — use the EXACT string the invoking phase specifies.
3. **`preview` carries the content** — when a dialog presents content for review, every option MUST include a `preview` field, and the full generated content goes ONLY in `preview` — NEVER in `question`, `label`, or `description`.
4. **`label` and `description` values are EXACT** — use the exact strings the invoking phase specifies. No abbreviations, no paraphrasing, no creative alternatives.
5. **ALL options are REQUIRED** — include every option the phase lists. NEVER omit "Cancel".
6. **Same `preview` on all options** — the user chooses an action, not content. All options show identical preview text.
7. **NO shorthand or placeholders in `preview`** — never pass `"..."`, `"<same content>"`, or a literal template token such as `<commit message>`. Substitute every placeholder with the fully resolved content and copy the full preview string literally into every option.

<!-- auq-contract:end -->
