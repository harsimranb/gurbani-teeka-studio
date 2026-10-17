import { fixtureRoute } from "../../../../../lib/server/services/fixture-route";

type Params = { draft_id: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  return fixtureRoute("getPublishGate", request, await params);
}
