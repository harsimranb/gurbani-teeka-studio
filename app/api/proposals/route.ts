import { fixtureRoute } from "../../../lib/server/services/fixture-route";

export function GET(request: Request) {
  return fixtureRoute("listProposals", request);
}

export function POST(request: Request) {
  return fixtureRoute("submitProposal", request);
}
