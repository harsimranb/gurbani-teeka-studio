import { handleRoute } from "../../../lib/server/services/http";
import { browseSabads } from "../../../lib/server/services/browse";

export async function GET(request: Request) {
  return handleRoute("browseSabads", request, {}, (req) => browseSabads(req));
}
