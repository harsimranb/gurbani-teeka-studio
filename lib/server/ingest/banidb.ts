import { readFileSync } from "node:fs";
import { SabadSchema } from "../../contracts/domain";
import { createRepository } from "../db/repo";

export function ingestDemoSabad(repo: ReturnType<typeof createRepository>, fixturePath: string) {
  const sabad = SabadSchema.parse(JSON.parse(readFileSync(fixturePath, "utf8")));
  repo.saveSabad(sabad);
  return { shabad_id: sabad.shabad_id, line_count: sabad.lines.length };
}
