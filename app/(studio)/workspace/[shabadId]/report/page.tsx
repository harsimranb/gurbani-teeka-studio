"use client";

import { use } from "react";
import { ReportView } from "@/components/report/ReportView";

export default function ReportPage({ params }: { params: Promise<{ shabadId: string }> }) {
  const { shabadId } = use(params);
  return <ReportView shabadId={shabadId} />;
}
