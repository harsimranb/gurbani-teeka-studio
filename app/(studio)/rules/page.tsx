import { Suspense } from "react";
import { RulesCatalog } from "@/components/rules/RulesCatalog";

export default function RulesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading rules…</p>}>
      <RulesCatalog />
    </Suspense>
  );
}
