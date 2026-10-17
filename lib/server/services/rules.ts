import type { ApiResponse } from "../../contracts/api";
import { getStore } from "./context";
import { currentRuleset } from "./state";

/** API-06: the current ruleset (v1 is seeded from the resolved SikhRI rules; approvals add versions). */
export function listRules(): ApiResponse<"listRules"> {
  const { version, rules } = currentRuleset(getStore());
  return { ruleset_version: version, rules };
}
