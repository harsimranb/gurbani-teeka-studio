import { handleRoute } from "../../../lib/server/services/http";
import { listProposals, submitProposal } from "../../../lib/server/services/proposals";

export async function GET(request: Request) {
  return handleRoute("listProposals", request, {}, () => listProposals());
}

export async function POST(request: Request) {
  return handleRoute("submitProposal", request, {}, (req) => submitProposal(req));
}
