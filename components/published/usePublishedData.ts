"use client";

import { useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/contracts/api";
import type { Reference } from "@/lib/contracts/domain";
import { DATA_CHANGED_EVENT, callApi } from "@/lib/client/hooks";
import type { UnitData } from "./derive";
import { readPublishSeams } from "./mock-adapter";

type SabadResponse = ApiResponse<"getSabad">;
interface Loaded { shabadId: string; key: string; units: UnitData[]; references: Reference[] }

/**
 * Loads the report and publish gate of every authored unit in the Sabad, then reads the mock
 * publication seams. Re-runs on every `eko:data-changed` and whenever the Sabad's drafts change.
 * Pass the `getSabad` response (so the mock store has already been seeded by that first call).
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
        const units = await Promise.all(ids.map(async (id) => {
          const [report, gate] = await Promise.all([callApi("getReport", { draft_id: id }), callApi("getPublishGate", { draft_id: id })]);
          return { draft: report.draft, report, gate, publication: null } as UnitData;
        }));
        if (cancelled || ticket !== latest) return;
        const seams = readPublishSeams(shabadId, units.map((u) => u.draft.id));
        setLoaded({ shabadId, key: draftsKey, units: units.map((u) => ({ ...u, publication: seams.publications[u.draft.id] ?? null })), references: seams.references });
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
