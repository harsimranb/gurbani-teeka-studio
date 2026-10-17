import { describe, expect, it } from "vitest";
import { ApiErrorSchema, routes, type RouteName } from "../../contracts/api";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Response | Promise<Response>;
const modules = import.meta.glob<{ GET?: Handler; POST?: Handler }>("../../../app/api/**/route.ts");

const requests: Record<RouteName, Record<string, unknown>> = {
  listSabads: {}, getSabad: { shabad_id: "synthetic-sabad" },
  saveDraft: { draft_id: null, expected_version: null, shabad_id: "synthetic-sabad", line_ids: ["synthetic-line-1"], text: "SYNTHETIC TEST DATA", author: "Synthetic author" },
  getReport: { draft_id: "synthetic-draft" },
  runCodeChecks: { draft_id: "synthetic-draft", draft_version: 1, ruleset_version: 1, changed_line_ids: ["synthetic-line-1"] },
  runLlmChecks: { draft_id: "synthetic-draft", draft_version: 1, ruleset_version: 1, changed_line_ids: ["synthetic-line-1"] },
  markReady: { draft_id: "synthetic-draft", draft_version: 1, actor: "Synthetic actor" },
  reviewQueue: {},
  decide: { draft_id: "synthetic-draft", draft_version: 1, ruleset_version: 1, finding_id: "synthetic-finding", action: "waive", reason: "Synthetic review reason", reviewer: "Synthetic reviewer" },
  getPublishGate: { draft_id: "synthetic-draft" },
  publish: { draft_id: "synthetic-draft", draft_version: 1, ruleset_version: 1, actor: "Synthetic actor", departure_reasons: [] },
  getReference: { reference_id: "synthetic-reference" },
  listRules: {}, listProposals: {}, getProposal: { proposal_id: "synthetic-proposal" },
  submitProposal: { rule_text: "SYNTHETIC TEST RULE", example: "SYNTHETIC EXAMPLE", reason: "Synthetic reason", author: "Synthetic author" },
  approveProposal: { proposal_id: "synthetic-proposal", ruleset_version: 1, actor: "Synthetic actor", reason: "Synthetic reason", drift_override_reason: null },
  getEval: {},
};

function routeModulePath(name: RouteName): string {
  return `../../../app${routes[name].path.replace(/:([a-z_]+)/g, "[$1]")}/route.ts`;
}

function routeRequest(name: RouteName, input: Record<string, unknown>) {
  const route = routes[name];
  const params: Record<string, string> = {};
  const path = route.path.replace(/:([a-z_]+)/g, (_, key: string) => {
    const value = String(input[key]);
    params[key] = value;
    return encodeURIComponent(value);
  });
  const request = new Request(`http://localhost${path}`, {
    method: route.method,
    ...(route.method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : {}),
  });
  return { request, context: { params: Promise.resolve(params) } };
}

describe("P0 API route inventory", () => {
  it("provides each declared method/path and a contract-valid fixture or explicit error", async () => {
    expect(Object.keys(routes)).toHaveLength(18);
    const safeFixtureReads = new Set<RouteName>(["listSabads", "getSabad", "listRules", "getEval"]);
    for (const name of Object.keys(routes) as RouteName[]) {
      const loader = modules[routeModulePath(name)];
      expect(loader, `${name} route file`).toBeTypeOf("function");
      const module = await loader();
      const handler = module[routes[name].method];
      expect(handler, `${name} ${routes[name].method}`).toBeTypeOf("function");
      const { request, context } = routeRequest(name, requests[name]);
      const response = await handler!(request, context);
      const payload = await response.json();
      const success = routes[name].response.safeParse(payload).success;
      const explicitError = ApiErrorSchema.safeParse(payload).success;
      expect(success || explicitError, name).toBe(true);
      if (!safeFixtureReads.has(name)) {
        expect(explicitError, name).toBe(true);
        expect(response.status).toBeGreaterThanOrEqual(400);
      } else {
        expect(success, name).toBe(true);
        expect(response.status).toBe(200);
      }
      if (name === "getSabad") expect(payload.status).toBe("unavailable");
      if (name === "getEval") expect(payload.status).toBe("unavailable");
      if (name === "listRules") expect(payload.rules).toHaveLength(66);
    }
  });

  it("rejects a blank review reason and a path/body ID mismatch before returning a fixture", async () => {
    const module = await modules[routeModulePath("decide")]();
    const handler = module.POST!;
    const invalidReason = routeRequest("decide", { ...requests.decide, reason: " " });
    const first = await handler(invalidReason.request, invalidReason.context);
    expect(first.status).toBe(400);
    expect(ApiErrorSchema.parse(await first.json()).error.code).toBe("invalid_request");

    const mismatch = routeRequest("decide", requests.decide);
    const second = await handler(mismatch.request, { params: Promise.resolve({ finding_id: "other-finding" }) });
    expect(second.status).toBe(400);
    expect(ApiErrorSchema.parse(await second.json()).error.code).toBe("invalid_request");
  });
});
