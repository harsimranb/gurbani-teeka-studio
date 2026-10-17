import { callApi } from "@/lib/client/hooks";
import { ApiClientError } from "@/lib/client/api";
import { notifyDataChanged } from "@/lib/client/events";
import type { Draft } from "@/lib/contracts/domain";

export function errorReason(error: unknown): string {
  return error instanceof ApiClientError || error instanceof Error ? error.message : "Something went wrong.";
}
export const isConflict = (error: unknown) => error instanceof ApiClientError && error.code === "version_conflict";

export interface PhaseHooks {
  /** A phase request is in flight (or finished) for this draft. */
  setRunning: (draftId: string, phase: "code" | "llm", running: boolean) => void;
  onError: (message: string) => void;
}

/** A stale check is dropped by the server (version_conflict). Not an error to show, but views must reload so the missing run offers a re-run. */
function onStale(error: unknown, hooks: PhaseHooks): void {
  if (isConflict(error)) notifyDataChanged();
  else hooks.onError(errorReason(error));
}

/** Re-check only the draft's own lines: await the code phase, then start the model phase without awaiting it. */
export async function checkDraft(draft: Pick<Draft, "id" | "version" | "line_ids">, hooks: PhaseHooks): Promise<void> {
  try {
    const { ruleset_version } = await callApi("listRules", {});
    const request = { draft_id: draft.id, draft_version: draft.version, ruleset_version, changed_line_ids: draft.line_ids };
    hooks.setRunning(draft.id, "code", true);
    try { await callApi("runCodeChecks", request); } finally { hooks.setRunning(draft.id, "code", false); }
    hooks.setRunning(draft.id, "llm", true);
    callApi("runLlmChecks", request)
      .catch((error: unknown) => onStale(error, hooks))
      .finally(() => hooks.setRunning(draft.id, "llm", false));
  } catch (error) {
    onStale(error, hooks);
  }
}

/** Retry one phase for one draft (used by the Retry link on a failed phase). */
export async function retryPhase(draft: Pick<Draft, "id" | "version" | "line_ids">, phase: "code" | "llm", hooks: PhaseHooks): Promise<void> {
  try {
    const { ruleset_version } = await callApi("listRules", {});
    const request = { draft_id: draft.id, draft_version: draft.version, ruleset_version, changed_line_ids: draft.line_ids };
    hooks.setRunning(draft.id, phase, true);
    try { await callApi(phase === "code" ? "runCodeChecks" : "runLlmChecks", request); } finally { hooks.setRunning(draft.id, phase, false); }
  } catch (error) {
    onStale(error, hooks);
  }
}
