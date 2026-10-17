import type { z } from "zod";
import { ApiErrorSchema, routes, type ApiError, type ApiResponse, type RouteName } from "../../contracts/api";

type ErrorCode = ApiError["error"]["code"];
type Blockers = ApiError["error"]["blockers"];

const STATUS: Record<ErrorCode, number> = {
  invalid_request: 400, not_found: 404, version_conflict: 409, publish_blocked: 409,
  drift_blocked: 409, unavailable: 503, internal_error: 500,
};
const HEADERS = { "Cache-Control": "no-store" };

/** Throw from a service or handler to return a contract-shaped error with the matching HTTP status. */
export class ServiceError extends Error {
  readonly code: ErrorCode;
  readonly blockers: Blockers;
  constructor(code: ErrorCode, reason: string, blockers?: Blockers) {
    super(reason);
    this.name = "ServiceError";
    this.code = code;
    this.blockers = blockers;
  }
}

/** The request a handler receives: `routes[name].request` after parsing. */
export type ParsedRequest<N extends RouteName> = z.output<(typeof routes)[N]["request"]>;

function errorResponse(code: ErrorCode, reason: string, blockers?: Blockers): Response {
  const payload = ApiErrorSchema.parse({ error: { code, reason, ...(blockers ? { blockers } : {}) } });
  return Response.json(payload, { status: STATUS[code], headers: HEADERS });
}

/**
 * The one wrapper every route handler uses: validates method, JSON body and path/body ID agreement,
 * parses the request with its contract, runs the handler, maps thrown ServiceErrors to ApiError JSON,
 * and validates the handler's result against the route's response contract.
 * `params` are the path params (`await context.params`); use `{}` for routes without any.
 */
export async function handleRoute<N extends RouteName>(
  name: N,
  request: Request,
  params: Record<string, string>,
  handler: (req: ParsedRequest<N>) => Promise<ApiResponse<N>> | ApiResponse<N>,
): Promise<Response> {
  const route = routes[name] as (typeof routes)[RouteName];
  if (request.method !== route.method) return errorResponse("invalid_request", "HTTP method does not match this route.");

  let body: Record<string, unknown> = {};
  // GET inputs beyond path params arrive as query-string text; the route's contract coerces numbers and rejects unknown keys.
  if (route.method === "GET") body = Object.fromEntries(new URL(request.url).searchParams);
  if (route.method === "POST") {
    try {
      const raw: unknown = await request.json();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return errorResponse("invalid_request", "Expected a JSON object.");
      body = raw as Record<string, unknown>;
    } catch {
      return errorResponse("invalid_request", "Expected a JSON request body.");
    }
  }
  if (Object.entries(params).some(([key, value]) => body[key] !== undefined && body[key] !== value)) {
    return errorResponse("invalid_request", "Path and body IDs do not match.");
  }
  const parsed = route.request.safeParse({ ...body, ...params });
  if (!parsed.success) {
    // Field paths and rule messages only: never echo submitted values.
    const detail = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "(request)"}: ${issue.message}`).join("; ");
    return errorResponse("invalid_request", `Request does not match its contract. ${detail}`);
  }

  let result: ApiResponse<N>;
  try {
    result = await handler(parsed.data as ParsedRequest<N>);
  } catch (error) {
    if (error instanceof ServiceError) return errorResponse(error.code, error.message, error.blockers);
    console.error(`[api:${name}] unhandled error`, error);
    return errorResponse("internal_error", "The server could not complete this request.");
  }

  const checked = route.response.safeParse(result);
  if (!checked.success) {
    console.error(`[api:${name}] response failed its contract`, checked.error.issues);
    return errorResponse("internal_error", "Response failed its contract");
  }
  return Response.json(checked.data, { status: 200, headers: HEADERS });
}
