import { fixtureRoute } from "../../../lib/server/services/fixture-route";

export function GET(request: Request) {
  return fixtureRoute("listRules", request);
}
