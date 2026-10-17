"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApi } from "@/lib/client/hooks";
import { cn } from "@/lib/utils";

/** Tab bar shared by every /rules route. Counts come from listRules and listProposals. */
export function RulesTabs() {
  const pathname = usePathname();
  const rules = useApi("listRules", {});
  const proposals = useApi("listProposals", {});
  const ruleCount = rules.data ? rules.data.rules.length : null;
  const proposalCount = proposals.data ? proposals.data.proposals.length : null;

  const tabs = [
    { href: "/rules", label: "All rules", count: ruleCount, active: pathname === "/rules" },
    { href: "/rules/proposals", label: "Proposals", count: proposalCount, active: pathname.startsWith("/rules/proposals") },
    { href: "/rules/history", label: "Version history", count: null, active: pathname.startsWith("/rules/history") },
  ];

  return (
    <nav aria-label="Rules sections" className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center px-3.5 text-sm no-underline",
            tab.active ? "font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-ink)]" : "text-muted hover:text-ink",
          )}
        >
          {tab.label}{tab.count !== null ? ` · ${tab.count}` : ""}
        </Link>
      ))}
    </nav>
  );
}
