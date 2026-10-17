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

/** Add new seed decisions as a versioned snapshot; preserve old review history and approved proposals. */
export function reconcileResolvedRules(repo: ReturnType<typeof createRepository>): number {
  const latest = repo.getLatestRulesetVersion();
  if (latest === undefined) return seedResolvedRules(repo).ruleset_version;
  const current = repo.getRuleset(latest);
  const desired = new Map(buildResolvedRules().map((rule) => [rule.id, rule]));
  const currentSeed = current.filter((rule) => rule.source === "sikhri_seed");
  if (currentSeed.length !== desired.size || currentSeed.some((rule) => rule.text !== desired.get(rule.id)?.text)) return latest;
  const changed = currentSeed.some((rule) => JSON.stringify(rule.resolution) !== JSON.stringify(desired.get(rule.id)?.resolution));
  if (!changed) return latest;
  const next = current.map((rule) => {
    const replacement = desired.get(rule.id);
    return rule.source === "sikhri_seed" && replacement
      ? { ...rule, layers: replacement.layers, severity: replacement.severity, decision: replacement.decision,
          resolution: replacement.resolution, version: rule.version + 1 }
      : rule;
  });
  repo.saveRuleset(latest + 1, next);
  return latest + 1;
}
