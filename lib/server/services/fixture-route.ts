import { ApiErrorSchema, routes, type RouteName } from "../../contracts/api";
import { mockResponses } from "../../contracts/fixtures";

const safeFixtureReads = new Set<RouteName>(["listSabads", "getSabad", "listRules", "getEval"]);

function invalidRequest(reason: string): Response {
  return Response.json(ApiErrorSchema.parse({ error: { code: "invalid_request", reason } }), { status: 400 });
}

/** F0 route boundary: validate requests and return only labelled fixtures or explicit unavailability. */
export async function fixtureRoute(name: RouteName, request: Request, params: Record<string, string> = {}): Promise<Response> {
  const route = routes[name];
  if (request.method !== route.method) return invalidRequest("HTTP method does not match this route.");

  let body: Record<string, unknown> = {};
  if (route.method === "POST") {
    try {
      const raw: unknown = await request.json();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalidRequest("Expected a JSON object.");
      body = raw as Record<string, unknown>;
    } catch {
      return invalidRequest("Expected a JSON request body.");
    }
  }
  if (Object.entries(params).some(([key, value]) => body[key] !== undefined && body[key] !== value)) {
    return invalidRequest("Path and body IDs do not match.");
  }
  if (!route.request.safeParse({ ...body, ...params }).success) {
    return invalidRequest("Request does not match its contract.");
  }

  if (!safeFixtureReads.has(name)) {
    return Response.json(ApiErrorSchema.parse({ error: {
      code: "unavailable", reason: "This route is a foundation skeleton; its stored workflow is not implemented yet.",
    } }), { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const payload = route.response.parse(mockResponses[name]);
  return Response.json(payload, { status: 200,
    headers: { "Cache-Control": "no-store", "X-Eko-Stub": "synthetic-fixture" } });
}
