import { runCodeChecks } from "../../../lib/server/services/checks";
import { handleRoute } from "../../../lib/server/services/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleRoute("runCodeChecks", request, {}, (req) => runCodeChecks(req));
}
