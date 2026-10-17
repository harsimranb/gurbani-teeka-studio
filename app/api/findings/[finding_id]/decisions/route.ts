import { fixtureRoute } from "../../../../../lib/server/services/fixture-route";

type Params = { finding_id: string };

export async function POST(request: Request, { params }: { params: Promise<Params> }) {
  return fixtureRoute("decide", request, await params);
}
