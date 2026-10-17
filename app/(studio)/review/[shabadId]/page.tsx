"use client";

import { use } from "react";
import { SabadReview } from "@/components/review";

/** `/review/[shabadId]`: review decisions and the publish gate for one Sabad. */
export default function ReviewSabadPage({ params }: { params: Promise<{ shabadId: string }> }) {
  const { shabadId } = use(params);
  return <SabadReview shabadId={shabadId} />;
}
