import type { PublishGate, Reference } from "@/lib/contracts/domain";
import { mockPublication, mockReferencesForSabad } from "@/lib/client/mock-store";

/** `gate` is the gate computed at publish time. */
export interface Publication { reference_id: string; approver: string; at: string; gate: PublishGate }

/**
 * TODO(API): there is no API route for "who published this draft, and when" or for the
 * published references of a Sabad. These two mock-only seams read browser localStorage
 * synchronously, so call this only on the client (inside an effect), after an API call
 * has seeded the mock store. Replace with real routes when they exist.
 */
export function readPublishSeams(shabadId: string, draftIds: string[]): { references: Reference[]; publications: Record<string, Publication | null> } {
  const publications: Record<string, Publication | null> = {};
  for (const id of draftIds) publications[id] = mockPublication(id);
  return { references: mockReferencesForSabad(shabadId), publications };
}
