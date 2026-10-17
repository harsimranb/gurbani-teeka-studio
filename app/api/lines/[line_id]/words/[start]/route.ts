import { handleRoute } from "../../../../../../lib/server/services/http";
import { lookupWord } from "../../../../../../lib/server/services/words";

type Params = { line_id: string; start: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  return handleRoute("lookupWord", request, await params, (req) => lookupWord(req));
}
