# Minimal C-02 contract fixtures

These are **synthetic English test markers**, not transcreations, SikhRI reference evidence, review history, or real evaluation results. `model` and `prompt_version` explicitly identify the finding stub. The rule catalog reads the authoritative resolved seed directly and preserves its wording and prefilters.

`draft.json` and `check-result.json` use the LAYER-07 sentence from `RULES_NOTES.md` §10, with an exact parenthesis span. `findings.json`, `references.json`, and `corrections.json` carry `data_label: "synthetic_test"` wrappers and IDs beginning with `synthetic-`. Their English markers are not SikhRI renderings or a real correction history. `eval-run.json` reports unavailable; no fake rates are supplied. The mock responses in `index.ts` are stateless examples; publishing is blocked, approval is unavailable, and drift/evaluation report unavailable evidence.

Gurmukhi must never be added here by hand. C-03 exports the private, git-ignored `sabad.demo.json` from BaniDB in each clone; its canonical shape is `{shabad_id, lines: [{line_id, shabad_id, ang, raag, writer, is_rahao, gurmukhi}]}`. IDs are strings, source text is already NFC, and no source metadata wrapper is included. Export provenance lives privately outside this payload.
