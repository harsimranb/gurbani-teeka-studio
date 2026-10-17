import { handleRoute } from "../../../../lib/server/services/http";
import { getReference } from "../../../../lib/server/services/review";

type Params = { reference_id: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  return handleRoute("getReference", request, await params, (req) => getReference(req));
}
