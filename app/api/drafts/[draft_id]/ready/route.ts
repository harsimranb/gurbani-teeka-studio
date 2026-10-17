import { handleRoute } from "../../../../../lib/server/services/http";
import { markReady } from "../../../../../lib/server/services/review";

type Params = { draft_id: string };

export async function POST(request: Request, { params }: { params: Promise<Params> }) {
  return handleRoute("markReady", request, await params, (req) => markReady(req));
}
