import { handleRoute } from "../../../../../lib/server/services/http";
import { approveProposal } from "../../../../../lib/server/services/proposals";

type Params = { proposal_id: string };

export async function POST(request: Request, { params }: { params: Promise<Params> }) {
  return handleRoute("approveProposal", request, await params, (req) => approveProposal(req));
}
