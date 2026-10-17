import seed from "../../../_docs/rules/rules.resolved.json";
import { RuleSchema, type Rule } from "../../contracts/domain";
import { createRepository } from "../db/repo";

/** The v1 catalog exactly as `seedResolvedRules` stores it, without saving anything. */
export function buildResolvedRules(): Rule[] {
  // The resolved file is the sole rule-text source; no copy or rewording.
  return seed.rules.map((rule) => RuleSchema.parse({
    id: rule.id, text: rule.text, level: rule.level, layers: rule.resolution.layers,
    plan: rule.check_type, severity: rule.resolution.severity,
    decision: rule.resolution.decision, version: 1, status: "approved",
    source: "sikhri_seed", source_tag: rule.source_tag, prefilter: rule.prefilter,
    resolution: rule.resolution, provenance: null,
  }));
}

export function seedResolvedRules(repo: ReturnType<typeof createRepository>) {
  const catalog = buildResolvedRules();
  repo.saveRuleset(1, catalog);
  return { ruleset_version: 1, total: catalog.length,
    active: catalog.filter((rule) => rule.resolution.active).length };
}
