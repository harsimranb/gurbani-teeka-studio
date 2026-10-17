import { devSeedSynthetic } from "../../../../lib/server/services/dev";

export const dynamic = "force-dynamic";

export function POST() {
  return devSeedSynthetic();
}
