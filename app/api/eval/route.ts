import { handleRoute } from "../../../lib/server/services/http";
import { getEval } from "../../../lib/server/services/eval";

export async function GET(request: Request) {
  return handleRoute("getEval", request, {}, () => getEval());
}
