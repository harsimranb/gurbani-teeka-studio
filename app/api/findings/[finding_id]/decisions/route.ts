import { handleRoute } from "../../../../../lib/server/services/http";
import { decide } from "../../../../../lib/server/services/review";

type Params = { finding_id: string };

export async function POST(request: Request, { params }: { params: Promise<Params> }) {
  return handleRoute("decide", request, await params, (req) => decide(req));
}
