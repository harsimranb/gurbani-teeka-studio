import { handleRoute } from "../../../../lib/server/services/http";
import { getSabad } from "../../../../lib/server/services/drafts";

type Params = { shabad_id: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  return handleRoute("getSabad", request, await params, (req) => getSabad(req));
}
