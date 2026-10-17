import { handleRoute } from "../../../../../lib/server/services/http";
import { listPublications } from "../../../../../lib/server/services/review";

type Params = { shabad_id: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  return handleRoute("listPublications", request, await params, (req) => listPublications(req));
}
