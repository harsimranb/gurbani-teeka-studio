import { mockResponses } from "../contracts/fixtures";
import type { RouteName } from "../contracts/api";

/** Stateless C-02 examples. FE-02 can replace these with a stateful mock workflow. */
export function mockRequest(name: RouteName): unknown {
  return structuredClone(mockResponses[name]);
}
