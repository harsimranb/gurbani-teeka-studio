import type { ApiResponse } from "../../contracts/api";
import type { Draft } from "../../contracts/domain";
import { getSourceStatus, getStore } from "./context";
import { ServiceError, type ParsedRequest } from "./http";

type SabadStatus = ApiResponse<"browseSabads">["sabads"][number]["status"];

/** Whole-Sabad status from its stored drafts; the same rule the workspace list shows (`sabadStatus` in components/workspace/model.ts). */
export function browseStatus(drafts: Draft[]): SabadStatus {
  if (drafts.length === 0) return "not_started";
  const published = drafts.filter((draft) => draft.status === "published").length;
  if (published === drafts.length) return "published";
  if (published > 0) return "partly_published";
  if (drafts.some((draft) => draft.status === "changes_requested")) return "changes_requested";
  if (drafts.some((draft) => draft.status === "draft")) return "draft";
  return "ready_for_review";
}

/**
 * FE-10: browse the whole loaded corpus. Filters are matched in SQLite and only the requested page is read;
 * each listed Sabad's status comes from its stored drafts. `raags` and `writers` list every value that can be filtered on.
 */
export function browseSabads(req: ParsedRequest<"browseSabads">): ApiResponse<"browseSabads"> {
  const source = getSourceStatus();
  if (!source.available) throw new ServiceError("unavailable", source.reason);
  const store = getStore();
  const { total, rows } = store.browseSabads({ ang: req.ang, raag: req.raag, writer: req.writer, limit: req.limit, offset: req.offset });
  return {
    total, limit: req.limit, offset: req.offset,
    sabads: rows.map((row) => ({
      shabad_id: row.shabad_id, ang: row.ang, last_ang: row.last_ang, raag: row.raag, writer: row.writer,
      line_count: row.line_count, first_line_gurmukhi: row.first_line_gurmukhi,
      status: browseStatus(store.listDraftsForSabad(row.shabad_id)),
    })),
    ...store.listSourceFacets(),
  };
}
