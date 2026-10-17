"use client";

import { Suspense } from "react";
import { WorkspaceView } from "@/components/workspace/WorkspaceView";

export default function WorkspacePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted" role="status">Loading…</p>}>
      <WorkspaceView />
    </Suspense>
  );
}
