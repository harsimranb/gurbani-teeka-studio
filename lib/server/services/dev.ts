import { ApiErrorSchema } from "../../contracts/api";
import { resetStore, seedSyntheticDrafts } from "./context";

/** Dev routes are off in production unless mock mode is on. */
export const devRoutesEnabled = (): boolean => process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_USE_MOCKS === "1";

const notFound = () => Response.json(ApiErrorSchema.parse({ error: { code: "not_found", reason: "Not found." } }), { status: 404, headers: { "Cache-Control": "no-store" } });
const ok = (body: unknown) => Response.json(body, { headers: { "Cache-Control": "no-store" } });

/** POST /api/dev/reset: clears app data (drafts, runs, decisions, proposals, rulesets above v1, ID sequences). Source lines and ruleset v1 stay. */
export function devReset(): Response {
  if (!devRoutesEnabled()) return notFound();
  resetStore();
  return ok({ ok: true });
}

/** POST /api/dev/seed-synthetic: adds the labelled SYNTHETIC demo drafts (no checks run). */
export function devSeedSynthetic(): Response {
  if (!devRoutesEnabled()) return notFound();
  return ok({ drafts: seedSyntheticDrafts() });
}
