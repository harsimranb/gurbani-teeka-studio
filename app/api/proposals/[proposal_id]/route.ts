import { fixtureRoute } from "../../../../lib/server/services/fixture-route";

type Params = { proposal_id: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  return fixtureRoute("getProposal", request, await params);
}
