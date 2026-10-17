import { fixtureRoute } from "../../../../../lib/server/services/fixture-route";

type Params = { proposal_id: string };

export async function POST(request: Request, { params }: { params: Promise<Params> }) {
  return fixtureRoute("approveProposal", request, await params);
}
