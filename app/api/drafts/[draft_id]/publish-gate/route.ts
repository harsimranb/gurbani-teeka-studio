import { handleRoute } from "../../../../../lib/server/services/http";
import { getPublishGate } from "../../../../../lib/server/services/review";

type Params = { draft_id: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  return handleRoute("getPublishGate", request, await params, (req) => getPublishGate(req));
}
