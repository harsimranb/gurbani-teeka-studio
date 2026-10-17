import type { Draft } from "@/lib/contracts/domain";
import type { Tone } from "./StatusPill";

export type DraftStatus = Draft["status"];

/** Shared draft status to label and StatusPill tone. Usage: `<StatusPill tone={DRAFT_STATUS[d.status].tone}>{DRAFT_STATUS[d.status].label}</StatusPill>`. */
export const DRAFT_STATUS: Record<DraftStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  ready_for_review: { label: "Ready for review", tone: "info" },
  changes_requested: { label: "Changes requested", tone: "warning" },
  published: { label: "Published", tone: "ok" },
};
