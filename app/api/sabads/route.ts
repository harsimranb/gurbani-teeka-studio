import { handleRoute } from "../../../lib/server/services/http";
import { listSabads } from "../../../lib/server/services/drafts";

export async function GET(request: Request) {
  return handleRoute("listSabads", request, {}, () => listSabads());
}
