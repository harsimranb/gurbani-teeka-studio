"use client";

import { useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/contracts/api";
import type { Publication } from "@/lib/contracts/domain";
import { DATA_CHANGED_EVENT, callApi } from "@/lib/client/hooks";
import type { UnitData } from "./derive";

type SabadResponse = ApiResponse<"getSabad">;
interface Loaded { shabadId: string; key: string; units: UnitData[] }

/**
 * Loads the report and publish gate of every authored unit in the Sabad, plus the Sabad's
 * publications (`listPublications`, newest last). Re-runs on every `eko:data-changed` and
 * whenever the Sabad's drafts change.
 */
export function usePublishedData(shabadId: string, sabad: SabadResponse | null): { loaded: Loaded | null; error: Error | null } {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const draftsKey = sabad?.status === "available" ? JSON.stringify(sabad.drafts.map((d) => [d.id, d.version, d.status])) : null;

  useEffect(() => {
    if (draftsKey === null) return;
    const ids = (JSON.parse(draftsKey) as [string, number, string][]).map((entry) => entry[0]);
    let cancelled = false;
    let latest = 0;
    const load = async () => {
      const ticket = ++latest;
      try {
        const [publicationsRes, units] = await Promise.all([
          callApi("listPublications", { shabad_id: shabadId }),
          Promise.all(ids.map(async (id) => {
            const [report, gate] = await Promise.all([callApi("getReport", { draft_id: id }), callApi("getPublishGate", { draft_id: id })]);
            return { draft: report.draft, report, gate, publication: null } as UnitData;
          })),
        ]);
        if (cancelled || ticket !== latest) return;
        // Newest last: a later publication of the same draft replaces an earlier one.
        const byDraft = new Map<string, Publication>();
        for (const publication of publicationsRes.publications) byDraft.set(publication.draft_id, publication);
        setLoaded({ shabadId, key: draftsKey, units: units.map((u) => ({ ...u, publication: byDraft.get(u.draft.id) ?? null })) });
        setError(null);
      } catch (e) {
        if (!cancelled && ticket === latest) setError(e instanceof Error ? e : new Error(String(e)));
      }
    };
    void load();
    window.addEventListener(DATA_CHANGED_EVENT, load);
    return () => { cancelled = true; window.removeEventListener(DATA_CHANGED_EVENT, load); };
  }, [shabadId, draftsKey]);

  return { loaded: loaded && loaded.shabadId === shabadId ? loaded : null, error };
}
