import { Suspense } from "react";
import { ProposalsView } from "@/components/proposals/ProposalsView";

export default function ProposalsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading proposals…</p>}>
      <ProposalsView />
    </Suspense>
  );
}
