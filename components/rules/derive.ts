import type { Rule } from "@/lib/contracts/domain";

export type FilterKey = "active" | "later" | "guidance" | "process" | "removed" | "merged";

export const FILTERS: { key: FilterKey; label: string; scopes: Rule["resolution"]["scope"][] }[] = [
  { key: "active", label: "Active on transcreation", scopes: ["p0_check", "p0_suppressor", "p0_by_design"] },
  { key: "later", label: "Later", scopes: ["p1_check"] },
  { key: "guidance", label: "Reviewer guidance", scopes: ["review_lens"] },
  { key: "process", label: "Process only", scopes: ["out_of_scope"] },
  { key: "removed", label: "Removed", scopes: ["removed"] },
  { key: "merged", label: "Merged", scopes: ["merged"] },
];

export const SCOPE_LABEL: Record<Rule["resolution"]["scope"], string> = {
  p0_check: "Active check",
  p0_suppressor: "Active suppressor",
  p0_by_design: "Active, by design",
  p1_check: "Later",
  review_lens: "Reviewer guidance",
  out_of_scope: "Process only",
  removed: "Removed",
  merged: "Merged",
};

export function categoryOf(rule: Rule): FilterKey {
  return FILTERS.find((filter) => filter.scopes.includes(rule.resolution.scope))?.key ?? "active";
}

export function isActiveScope(rule: Rule): boolean {
  return categoryOf(rule) === "active";
}

export function countsByFilter(rules: Rule[]): Record<FilterKey, number> {
  const counts: Record<FilterKey, number> = { active: 0, later: 0, guidance: 0, process: 0, removed: 0, merged: 0 };
  for (const rule of rules) counts[categoryOf(rule)] += 1;
  return counts;
}

/** "LAYER-01", "LAYER-02", "LAYER-03" in catalog order become "LAYER-01 to 03". IDs only, no rewording. */
export function compressIds(ids: string[]): string[] {
  const parse = (id: string) => /^(.*?-)(\d+)$/.exec(id);
  const out: string[] = [];
  let i = 0;
  while (i < ids.length) {
    const first = parse(ids[i]);
    let j = i;
    if (first) {
      while (j + 1 < ids.length) {
        const next = parse(ids[j + 1]);
        const cur = parse(ids[j]);
        if (next && cur && next[1] === first[1] && Number(next[2]) === Number(cur[2]) + 1) j += 1;
        else break;
      }
    }
    if (j - i >= 2) out.push(`${ids[i]} to ${ids[j].slice(first![1].length)}`);
    else { for (let k = i; k <= j; k += 1) out.push(ids[k]); }
    i = j + 1;
  }
  return out;
}

/** The target rule ID named by a "merged" decision, when the decision text names one. */
export function mergedInto(rule: Rule): string | null {
  const match = /\bMerged into ([A-Z]+-\d+)/.exec(rule.decision ?? "");
  return match ? match[1] : null;
}

const DATE_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME.format(date);
}

/** Plain labels for the check methods in the catalog (descriptions of the method, not rule text). Unknown slugs fall back to the slug. */
const PLAN_LABEL: Record<string, string> = {
  manual: "Reviewer judgment, no automatic check",
  glossary: "Code: glossary and term match",
  prefilter_llm: "Code prefilter, then model confirms",
  style_llm: "Model compares against references",
  grammar_conditioned: "Needs Gurmukhi grammar features",
  generic_judge: "Model judges the approved free-text rule",
};
export function planLabel(plan: string): string {
  return PLAN_LABEL[plan] ?? plan;
}
