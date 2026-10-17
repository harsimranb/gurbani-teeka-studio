"use client";

import { ReviewGrid, ReviewQueue } from "@/components/review";

/** `/review`: the queue plus a prompt to pick a Sabad. */
export default function ReviewPage() {
  return (
    <ReviewGrid
      left={<ReviewQueue />}
      center={
        <div className="rounded-xl border border-dashed border-line-strong bg-card p-8">
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.01em] text-ink">Review</h1>
          <p className="mt-2 mb-0 text-sm text-muted">Select a Sabad to review.</p>
        </div>
      }
    />
  );
}
