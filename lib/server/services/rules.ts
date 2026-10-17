import type { ApiResponse } from "../../contracts/api";
import { getStore } from "./context";
import { ServiceError, type ParsedRequest } from "./http";
import { currentRuleset } from "./state";

/** API-06: the current ruleset (v1 is seeded from the resolved SikhRI rules; approvals add versions). */
export function listRules(req: ParsedRequest<"listRules"> = {}): ApiResponse<"listRules"> {
  const store = getStore();
  if (req.ruleset_version !== undefined) {
    const rules = store.getRuleset(req.ruleset_version);
    if (rules.length === 0) throw new ServiceError("not_found", `Ruleset ${req.ruleset_version} is not available.`);
    return { ruleset_version: req.ruleset_version, rules };
  }
  const { version, rules } = currentRuleset(store);
  return { ruleset_version: version, rules };
}
