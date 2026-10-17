import { fixtureRoute } from "../../../../lib/server/services/fixture-route";

type Params = { shabad_id: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  return fixtureRoute("getSabad", request, await params);
}
