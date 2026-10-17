import { ApiErrorSchema, routes, type ApiError, type ApiRequest, type ApiResponse, type RouteName } from "../contracts/api";
import { notifyDataChanged } from "./events";
import { handleMock } from "./mock-handler";

export class ApiClientError extends Error {
  readonly code: ApiError["error"]["code"];
  readonly blockers: ApiError["error"]["blockers"];
  constructor(payload: ApiError) {
    super(payload.error.reason);
    this.name = "ApiClientError";
    this.code = payload.error.code;
    this.blockers = payload.error.blockers;
  }
}
export function createApiClient(options: { useMocks?: boolean; fetcher?: typeof fetch } = {}) {
  const useMocks = options.useMocks ?? process.env.NEXT_PUBLIC_USE_MOCKS === "1";
  const fetcher = options.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  return {
    async request<Name extends RouteName>(name: Name, rawRequest: ApiRequest<Name>): Promise<ApiResponse<Name>> {
      const route = routes[name];
      const request = route.request.parse(rawRequest);
      let payload: unknown;
      if (useMocks) {
        payload = await handleMock(name, request as ApiRequest<Name>);
      } else {
        const params = request as Record<string, unknown>;
        const path = route.path.replace(/:([a-z_]+)/g, (_, key: string) => encodeURIComponent(String(params[key])));
        const response = await fetcher(path, {
          method: route.method,
          ...(route.method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }),
        });
        try {
          payload = await response.json();
        } catch {
          // Not JSON (for example a framework error page): still surface a readable ApiClientError.
          if (!response.ok) throw new ApiClientError({ error: { code: response.status === 404 ? "not_found" : "internal_error", reason: `The server returned HTTP ${response.status} without a readable error body.` } });
          throw new Error("The server returned a response that was not valid JSON.");
        }
        if (!response.ok) {
          const parsedError = ApiErrorSchema.safeParse(payload);
          throw new ApiClientError(parsedError.success ? parsedError.data : { error: { code: "internal_error", reason: `The server returned HTTP ${response.status} with an unexpected error body.` } });
        }
      }
      const error = ApiErrorSchema.safeParse(payload);
      if (error.success) throw new ApiClientError(error.data);
      const parsed = route.response.parse(payload) as ApiResponse<Name>;
      // Tell mounted views (useApi) that stored data may have changed.
      if (route.method !== "GET") notifyDataChanged();
      return parsed;
    },
  };
}
export const api = createApiClient();
