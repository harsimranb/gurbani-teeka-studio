import type { ApiResponse } from "../../lib/contracts/api";
import type { Tone } from "../ui/StatusPill";
import { DRAFT_STATUS } from "../ui/status";

export const BROWSE_PAGE_SIZE = 25;

export interface BrowseFilters { ang?: number; raag?: string; writer?: string; page: number }

type Params = { get(name: string): string | null };

/** Filters held in the workspace URL (`ang`, `raag`, `writer`, `page`); anything malformed is ignored. */
export function readFilters(params: Params): BrowseFilters {
  const ang = Number(params.get("ang"));
  const page = Number(params.get("page"));
  const text = (name: string) => params.get(name)?.trim() || undefined;
  return {
    ang: Number.isInteger(ang) && ang >= 1 && ang <= 1430 ? ang : undefined,
    raag: text("raag"),
    writer: text("writer"),
    page: Number.isInteger(page) && page >= 0 ? page : 0,
  };
}

export const isFiltered = (filters: BrowseFilters) => filters.ang !== undefined || filters.raag !== undefined || filters.writer !== undefined;

/** Workspace URL for a Sabad (or none) with the given filters, so choosing a Sabad keeps the list the person was browsing. */
export function workspaceHref(sabadId: string | null, filters: BrowseFilters): string {
  const query = new URLSearchParams();
  if (sabadId) query.set("sabad", sabadId);
  if (filters.ang !== undefined) query.set("ang", String(filters.ang));
  if (filters.raag) query.set("raag", filters.raag);
  if (filters.writer) query.set("writer", filters.writer);
  if (isFiltered(filters) && filters.page > 0) query.set("page", String(filters.page));
  const text = query.toString();
  return text ? `/workspace?${text}` : "/workspace";
}

export type BrowseStatus = ApiResponse<"browseSabads">["sabads"][number]["status"];

/** Browse status to label and StatusPill tone; the per-draft statuses reuse DRAFT_STATUS. */
export const BROWSE_STATUS: Record<BrowseStatus, { label: string; tone: Tone }> = {
  not_started: { label: "Not started", tone: "neutral" },
  draft: DRAFT_STATUS.draft,
  changes_requested: DRAFT_STATUS.changes_requested,
  ready_for_review: DRAFT_STATUS.ready_for_review,
  partly_published: { label: "Partly published", tone: "info" },
  published: DRAFT_STATUS.published,
};

/** "Ang 3" or "Ang 3–4". */
export const angLabel = (ang: number, lastAng: number) => (ang === lastAng ? `Ang ${ang}` : `Ang ${ang}–${lastAng}`);
