import { FindingSchema, findingMatchesInput } from "../../contracts/domain";
import type { Finding, FindingEvidenceContext } from "../../contracts/domain";

/**
 * CHK-09: keep only findings that are schema-valid, current, bound to an existing unit, rule and
 * reference, and whose quoted span equals `draft.text.slice(start, end)`. Duplicate IDs keep the first.
 */
export function validateFindings(candidates: unknown[], input: FindingEvidenceContext): Finding[] {
  const seen = new Set<string>();
  const valid: Finding[] = [];
  for (const candidate of candidates) {
    const parsed = FindingSchema.safeParse(candidate);
    if (!parsed.success || seen.has(parsed.data.id) || !findingMatchesInput(parsed.data, input)) continue;
    seen.add(parsed.data.id);
    valid.push(parsed.data);
  }
  return valid;
}
