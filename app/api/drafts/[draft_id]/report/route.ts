import { handleRoute } from "../../../../../lib/server/services/http";
import { getReport } from "../../../../../lib/server/services/drafts";

type Params = { draft_id: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  return handleRoute("getReport", request, await params, (req) => getReport(req));
}
