import { ApiErrorSchema, routes, type ApiError, type ApiRequest, type ApiResponse, type RouteName } from "../contracts/api";
import { mockRequest } from "./mocks";

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
  const fetcher = options.fetcher ?? fetch;
  return {
    async request<Name extends RouteName>(name: Name, rawRequest: ApiRequest<Name>): Promise<ApiResponse<Name>> {
      const route = routes[name];
      const request = route.request.parse(rawRequest);
      let payload: unknown;
      if (useMocks) {
        payload = mockRequest(name);
      } else {
        const params = request as Record<string, unknown>;
        const path = route.path.replace(/:([a-z_]+)/g, (_, key: string) => encodeURIComponent(String(params[key])));
        const response = await fetcher(path, {
          method: route.method,
          ...(route.method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }),
        });
        payload = await response.json();
        if (!response.ok) throw new ApiClientError(ApiErrorSchema.parse(payload));
      }
      const error = ApiErrorSchema.safeParse(payload);
      if (error.success) throw new ApiClientError(error.data);
      return route.response.parse(payload) as ApiResponse<Name>;
    },
  };
}
export const api = createApiClient();
