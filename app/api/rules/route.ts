import { handleRoute } from "../../../lib/server/services/http";
import { listRules } from "../../../lib/server/services/rules";

export async function GET(request: Request) {
  return handleRoute("listRules", request, {}, (req) => listRules(req));
}
