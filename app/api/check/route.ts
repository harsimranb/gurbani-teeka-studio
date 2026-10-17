import { fixtureRoute } from "../../../lib/server/services/fixture-route";

export function POST(request: Request) {
  return fixtureRoute("runCodeChecks", request);
}
