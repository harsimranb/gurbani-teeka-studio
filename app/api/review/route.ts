import { handleRoute } from "../../../lib/server/services/http";
import { reviewQueue } from "../../../lib/server/services/review";

export async function GET(request: Request) {
  return handleRoute("reviewQueue", request, {}, () => reviewQueue());
}
