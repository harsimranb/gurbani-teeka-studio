import { handleRoute } from "../../../lib/server/services/http";
import { saveDraft } from "../../../lib/server/services/drafts";

export async function POST(request: Request) {
  return handleRoute("saveDraft", request, {}, (req) => saveDraft(req));
}
