import { describe, expect, it } from "vitest";
import { ApiErrorSchema, routes, type RouteName } from "../../contracts/api";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Response | Promise<Response>;
const modules = import.meta.glob<Record<string, Handler | undefined>>("../../../app/api/**/route.ts");

const routeNames = Object.keys(routes) as RouteName[];
const pathParams = (name: RouteName) => [...routes[name].path.matchAll(/:([a-z_]+)/g)].map((match) => match[1]);

function routeModulePath(name: RouteName): string {
  return `../../../app${routes[name].path.replace(/:([a-z_]+)/g, "[$1]")}/route.ts`;
}

/** A request that must be rejected by the contract, whatever the route does once a request is valid. */
function invalidRequest(name: RouteName) {
  const route = routes[name];
  const keys = pathParams(name);
  const encoded = (value: string) => route.path.replace(/:([a-z_]+)/g, () => encodeURIComponent(value));
  if (route.method === "POST") {
    // Valid path IDs, but a body that lacks every other required field.
    const params = Object.fromEntries(keys.map((key) => [key, "synthetic-id"]));
    return { request: new Request(`http://localhost${encoded("synthetic-id")}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), params };
  }
  if (keys.length) {
    // Blank path ID fails the nonblank ID contract.
    const params = Object.fromEntries(keys.map((key) => [key, " "]));
    return { request: new Request(`http://localhost${encoded(" ")}`, { method: "GET" }), params };
  }
  // GET routes without inputs: the wrong HTTP method is the only invalid request.
  return { request: new Request(`http://localhost${route.path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), params: {} };
}

describe("API route inventory", () => {
  it("declares all 19 routes", () => {
    expect(routeNames).toHaveLength(19);
    expect(routeNames).toContain("listPublications");
  });

  it.each(routeNames)("%s has a route file exporting its declared method", async (name) => {
    const loader = modules[routeModulePath(name)];
    expect(loader, `${name} route file`).toBeTypeOf("function");
    const module = await loader();
    expect(module[routes[name].method], `${name} ${routes[name].method}`).toBeTypeOf("function");
  });

  it.each(routeNames)("%s answers an invalid request with a 400 invalid_request error", async (name) => {
    const module = await modules[routeModulePath(name)]();
    const { request, params } = invalidRequest(name);
    // Wrong-method probes call the declared handler with a mismatched request method.
    const response = await module[routes[name].method]!(request, { params: Promise.resolve(params) });
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });

  it("rejects a blank review reason and a path/body ID mismatch", async () => {
    const module = await modules[routeModulePath("decide")]();
    const body = { draft_id: "d", draft_version: 1, ruleset_version: 1, finding_id: "f", action: "waive", reason: " ", reviewer: "R" };
    const post = (payload: unknown) => new Request("http://localhost/api/findings/f/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const blank = await module.POST!(post(body), { params: Promise.resolve({ finding_id: "f" }) });
    expect(blank.status).toBe(400);
    const mismatch = await module.POST!(post({ ...body, reason: "Because." }), { params: Promise.resolve({ finding_id: "other" }) });
    expect(mismatch.status).toBe(400);
    expect(ApiErrorSchema.parse(await mismatch.json()).error.code).toBe("invalid_request");
  });
});
