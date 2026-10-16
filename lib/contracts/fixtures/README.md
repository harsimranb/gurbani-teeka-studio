# Minimal C-02 contract fixtures

These are **synthetic English test markers**, not transcreations, SikhRI reference evidence, review history, or real evaluation results. `model` and `prompt_version` explicitly identify the finding stub. The rule catalog reads the authoritative resolved seed directly and preserves its wording and prefilters.

`draft.json`, `check-result.json`, and `eval-run.json` provide only the payloads needed for the initial contract/client/engine seams. The mock responses in `index.ts` are stateless examples; publishing is blocked, approval is unavailable, and drift/evaluation report unavailable evidence. Broader fixture scenarios remain C-04.

Gurmukhi must never be added here by hand. C-03 exports the private, git-ignored `sabad.demo.json` from BaniDB in each clone; its canonical shape is `{shabad_id, lines: [{line_id, shabad_id, ang, raag, writer, is_rahao, gurmukhi}]}`. IDs are strings, source text is already NFC, and no source metadata wrapper is included. Export provenance lives privately outside this payload.
