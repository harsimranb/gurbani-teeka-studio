import { handleRoute } from "../../../../../lib/server/services/http";
import { getStore } from "../../../../../lib/server/services/context";

type Params = { shabad_id: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  return handleRoute("listPublications", request, await params, (req) => ({
    publications: getStore().listPublicationsForSabad(req.shabad_id),
  }));
}
