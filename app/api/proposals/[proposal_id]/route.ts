import { handleRoute } from "../../../../lib/server/services/http";
import { getProposal } from "../../../../lib/server/services/proposals";

type Params = { proposal_id: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  return handleRoute("getProposal", request, await params, (req) => getProposal(req));
}
