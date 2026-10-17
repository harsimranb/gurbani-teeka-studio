import { handleRoute } from "../../../../../lib/server/services/http";
import { publish } from "../../../../../lib/server/services/review";

type Params = { draft_id: string };

export async function POST(request: Request, { params }: { params: Promise<Params> }) {
  return handleRoute("publish", request, await params, (req) => publish(req));
}
