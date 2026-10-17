"use client";

import { use } from "react";
import { PublishedView } from "@/components/published/PublishedView";

export default function PublishedPage({ params }: { params: Promise<{ shabadId: string }> }) {
  const { shabadId } = use(params);
  return <PublishedView shabadId={shabadId} />;
}
