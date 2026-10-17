import type { Rule } from "../../contracts/domain";

/** Active, approved transcreation rules the engine actually checks (scope `p0_check`). */
export function checkedRules(rules: Rule[]): Rule[] {
  return rules.filter((rule) => rule.status === "approved" && rule.resolution.active
    && rule.resolution.scope === "p0_check" && rule.resolution.layers.includes("transcreation"));
}

export interface CompiledPattern { regex: RegExp; action: string; index: number }

// Seed patterns use a leading Python-style `(?i)`; JavaScript expresses it as the `i` flag.
export function compilePrefilter(rule: Rule): CompiledPattern[] {
  return (rule.prefilter?.patterns ?? []).map((entry, index) => {
    const insensitive = entry.pattern.startsWith("(?i)");
    const source = insensitive ? entry.pattern.slice(4) : entry.pattern;
    const flags = new Set([..."g", ...entry.flags, ...(insensitive ? "i" : "")]);
    return { regex: new RegExp(source, [...flags].join("")), action: entry.action, index };
  });
}

export interface PatternHit { start: number; end: number; text: string; action: string; patternIndex: number }

/** Deterministic actions (`flag`, `flag_if_*`) outrank `llm_confirm`. */
export function isDeterministic(action: string): boolean { return action === "flag" || action.startsWith("flag_if_"); }

/**
 * Every match of every pattern, then overlap resolution: when hits overlap, the most specific
 * action wins (deterministic over `llm_confirm`), then the longer span, then the earlier pattern.
 * Offsets are UTF-16 code units, end-exclusive.
 */
export function scanPatterns(patterns: CompiledPattern[], text: string): PatternHit[] {
  const all: PatternHit[] = [];
  for (const { regex, action, index } of patterns) {
    for (const match of text.matchAll(new RegExp(regex.source, regex.flags))) {
      if (match[0].length === 0) continue;
      all.push({ start: match.index, end: match.index + match[0].length, text: match[0], action, patternIndex: index });
    }
  }
  const rank = (hit: PatternHit) => (isDeterministic(hit.action) ? 1 : 0);
  all.sort((a, b) => rank(b) - rank(a) || (b.end - b.start) - (a.end - a.start) || a.patternIndex - b.patternIndex || a.start - b.start);
  const kept: PatternHit[] = [];
  for (const hit of all) if (!kept.some((other) => hit.start < other.end && other.start < hit.end)) kept.push(hit);
  return kept.sort((a, b) => a.start - b.start);
}
