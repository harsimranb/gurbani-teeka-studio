"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import type { Rule } from "@/lib/contracts/domain";
import { Tag } from "@/components/ui";
import { cn } from "@/lib/utils";
import { planLabel } from "./derive";
import { RuleSeverity } from "./RuleSeverity";
import { VerbatimText } from "./VerbatimText";

export function RuleTable({ rules, selectedId, onSelect }: { rules: Rule[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, id: string) => {
    // Real links (the rule ID) handle themselves.
    if ((event.target as HTMLElement).closest("a")) return;
    onSelect(id);
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="bg-subtle text-left font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
            <th scope="col" className="px-4 py-2.5 font-semibold">Rule</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">What it checks</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Level</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">How Eko checks it</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Severity</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => {
            const selected = rule.id === selectedId;
            return (
              <tr
                key={rule.id}
                onClick={(event) => onRowClick(event, rule.id)}
                aria-selected={selected}
                className={cn("cursor-pointer border-t border-hint-bg align-top", selected ? "bg-accent-bg" : "hover:bg-subtle")}
              >
                <td className="px-4 py-3 align-top font-mono text-[13px] font-semibold whitespace-nowrap">
                  <Link
                    href={`/rules?rule=${encodeURIComponent(rule.id)}`}
                    replace
                    scroll={false}
                    aria-current={selected ? "true" : undefined}
                    className={cn("text-[13px] font-semibold underline-offset-2 hover:underline", selected ? "text-link" : "text-ink")}
                  >
                    {rule.id}
                  </Link>
                  {rule.source === "proposal" ? <div className="mt-1"><Tag tone="accent" className="font-sans">Added v{rule.version}</Tag></div> : null}
                </td>
                <td className="max-w-[360px] px-3 py-3 align-top">
                  <VerbatimText text={rule.text} className="line-clamp-2" />
                </td>
                <td className="px-3 py-3 align-top font-mono text-xs">{rule.level}</td>
                <td className="px-3 py-3 align-top text-body">
                  <div>{planLabel(rule.plan)}</div>
                  <div className="font-mono text-[11px] text-muted">{rule.plan}</div>
                  {rule.resolution.conditional ? <div className="mt-0.5 text-[13px] text-muted">{rule.resolution.conditional}</div> : null}
                </td>
                <td className="px-4 py-3 align-top"><RuleSeverity rule={rule} /></td>
              </tr>
            );
          })}
          {rules.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-muted">No rules in this group.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
