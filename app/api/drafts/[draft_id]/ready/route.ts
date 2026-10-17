import { fixtureRoute } from "../../../../../lib/server/services/fixture-route";

type Params = { draft_id: string };

export async function POST(request: Request, { params }: { params: Promise<Params> }) {
  return fixtureRoute("markReady", request, await params);
}
