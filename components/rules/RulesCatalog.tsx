"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { rulesetLabel } from "@/lib/contracts/domain";
import { useApi } from "@/lib/client/hooks";
import { Banner, buttonStyles } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FILTERS, categoryOf, compressIds, countsByFilter, mergedInto, type FilterKey } from "./derive";
import { RuleDetail } from "./RuleDetail";
import { RuleTable } from "./RuleTable";

export function RulesCatalog() {
  const router = useRouter();
  const params = useSearchParams();
  const ruleParam = params.get("rule");
  const { data, error } = useApi("listRules", {});
  const rules = useMemo(() => data?.rules ?? [], [data]);

  const paramRule = ruleParam ? rules.find((rule) => rule.id === ruleParam) ?? null : null;
  const [picked, setPicked] = useState<FilterKey | null>(null);
  const [seenParam, setSeenParam] = useState<string | null>(null);
  // A link to a rule (?rule=ID) switches to the group that rule belongs to.
  if (paramRule && paramRule.id !== seenParam) {
    setSeenParam(paramRule.id);
    setPicked(categoryOf(paramRule));
  }
  if (!paramRule && seenParam !== null) setSeenParam(null);
  const filter: FilterKey = picked ?? "active";

  const counts = useMemo(() => countsByFilter(rules), [rules]);
  const seedCount = rules.filter((rule) => rule.source === "sikhri_seed").length;
  const addedCount = rules.length - seedCount;
  const visible = useMemo(() => {
    const scopes = FILTERS.find((item) => item.key === filter)?.scopes ?? [];
    return rules.filter((rule) => scopes.includes(rule.resolution.scope));
  }, [rules, filter]);

  // Without a valid ?rule in this group, the first row is shown in the detail panel.
  const selected = paramRule && visible.includes(paramRule) ? paramRule : visible[0] ?? null;

  const footnote = useMemo(() => {
    const idsFor = (...keys: FilterKey[]) => rules.filter((rule) => keys.includes(categoryOf(rule))).map((rule) => rule.id);
    return {
      inactive: compressIds(idsFor("later", "guidance", "process")),
      removed: idsFor("removed"),
      merged: rules.filter((rule) => categoryOf(rule) === "merged"),
    };
  }, [rules]);

  const select = (id: string) => router.replace(`/rules?rule=${encodeURIComponent(id)}`, { scroll: false });
  const choose = (key: FilterKey) => {
    setPicked(key);
    if (paramRule && categoryOf(paramRule) !== key) router.replace("/rules", { scroll: false });
  };

  if (error && !data) return <Banner tone="error">Could not load the rules: {error.message}</Banner>;
  if (!data) return <p role="status" className="text-sm text-muted">Loading rules…</p>;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-[1_1_560px]">
          <h1 className="m-0 text-[28px] font-semibold tracking-tight text-ink">Ruleset {rulesetLabel(data.ruleset_version)}</h1>
          <p className="mt-0.5 mb-0 max-w-[820px] text-sm text-muted">
            {seedCount} rules from SikhRI&apos;s published Approach and Methodology{addedCount > 0 ? ` plus ${addedCount} added by approved proposals` : ""}, verbatim, with the team&apos;s decision beside each. Eko checks the English transcreation only, so {counts.active} rules are active today.
          </p>
        </div>
        <Link href="/rules/proposals" className={cn(buttonStyles({ variant: "primary" }), "min-h-11 px-[18px] no-underline")}>Propose a rule</Link>
      </div>

      <div role="group" aria-label="Filter by decision" className="flex flex-wrap gap-1.5">
        {FILTERS.map((item) => {
          const on = item.key === filter;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={on}
              onClick={() => choose(item.key)}
              className={cn(
                "min-h-9 cursor-pointer rounded-full px-3 text-[13px]",
                on ? "border border-navy bg-navy font-semibold text-white" : "border border-line-strong bg-card text-body hover:bg-subtle",
              )}
            >
              {item.label} · {counts[item.key]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label={FILTERS.find((item) => item.key === filter)?.label} className="min-w-0 flex-[999_1_620px] overflow-hidden rounded-xl border border-line bg-card">
          <RuleTable rules={visible} selectedId={selected?.id ?? null} onSelect={select} />
          <div className="flex flex-col gap-1 border-t border-divider bg-subtle px-4 py-3 text-[13px] leading-[1.6] text-body">
            {footnote.inactive.length > 0 ? <p className="m-0"><b className="font-semibold text-ink">Inactive while only the transcreation is reviewed:</b> {footnote.inactive.join(", ")}.</p> : null}
            {footnote.removed.length > 0 ? <p className="m-0"><b className="font-semibold text-ink">Removed by the team:</b> {footnote.removed.join(", ")}.</p> : null}
            {footnote.merged.length > 0 ? (
              <p className="m-0">
                <b className="font-semibold text-ink">Merged:</b>{" "}
                {footnote.merged.map((rule) => { const into = mergedInto(rule); return into ? `${rule.id} into ${into}` : rule.id; }).join(", ")}.
              </p>
            ) : null}
          </div>
        </section>
        <div className="min-w-0 flex-[1_1_380px]">
          {selected
            ? <RuleDetail rule={selected} />
            : <div className="rounded-xl border border-dashed border-line-strong p-5 text-sm text-muted">Select a rule to see its text, check plan and provenance.</div>}
        </div>
      </div>
    </div>
  );
}
