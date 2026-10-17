"use client";

import type { ReactNode } from "react";
import { RulesTabs } from "@/components/rules/RulesTabs";

/** Shared by /rules, /rules/proposals and /rules/history: the tab bar, then the route's page. */
export default function RulesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[18px]">
      <RulesTabs />
      {children}
    </div>
  );
}
