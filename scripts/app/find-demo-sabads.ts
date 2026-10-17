import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import seed from "../../_docs/rules/rules.resolved.json";
import type { Sabad } from "../../lib/contracts/domain";
import { NOT_RECORDED, loadSqliteSabads, useFullSqlite } from "../../lib/server/ingest/banidb-source";

/** Alternatives of the TERM-02 prefilter pattern; the karta/kartar family is the pair where one extends the other by a base letter (not a vowel sign). */
export function kartarFamily(pattern: string): string[] {
  const body = /^\(\?:([\s\S]*)\)$/u.exec(pattern)?.[1];
  const alternatives = [...new Set((body ?? "").split("|").filter(Boolean))];
  const extendsByLetter = (long: string, short: string) => long.startsWith(short) && /^\p{L}$/u.test(long.slice(short.length));
  const family = alternatives.filter((a) => alternatives.some((b) => extendsByLetter(a, b) || extendsByLetter(b, a)));
  if (family.length !== 2) throw new Error(`Expected exactly two karta/kartar alternatives in the TERM-02 pattern, found ${family.length}.`);
  return family;
}

/** The glyph is read from the TERM-03 keywords: the keyword that is a single Gurmukhi character. */
export function openingGlyph(keywords: string[]): string {
  const glyphs = keywords.filter((k) => [...k].length === 1 && /\p{Script=Gurmukhi}/u.test(k));
  if (glyphs.length !== 1) throw new Error("Expected exactly one single-character Gurmukhi keyword in TERM-03.");
  return glyphs[0];
}

export const hasFamilyToken = (text: string, family: string[]) =>
  text.split(/[^\p{L}\p{M}]+/u).some((token) => family.some((alt) => token.startsWith(alt) && /^\p{M}*$/u.test(token.slice(alt.length))));

const dataComplete = (sabad: Sabad) => sabad.lines.some((l) => l.is_rahao) &&
  sabad.lines.every((l) => l.writer !== NOT_RECORDED && l.raag !== NOT_RECORDED);

/** Shortest first (4-10 lines preferred), then lowest ID. */
export function pickShortest(candidates: Sabad[]): Sabad | undefined {
  const rank = (s: Sabad) => [s.lines.length >= 4 && s.lines.length <= 10 ? 0 : 1, s.lines.length, Number(s.shabad_id)];
  return [...candidates].sort((a, b) => { const [x, y] = [rank(a), rank(b)]; return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; })[0];
}

const describe = (sabad: Sabad, reason: string) => ({
  shabad_id: sabad.shabad_id, reason, ang: sabad.lines[0].ang, raag: sabad.lines[0].raag,
  writer: sabad.lines[0].writer, line_count: sabad.lines.length,
});

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const output = "data/banidb/demo-sabads.json";
  execFileSync("git", ["check-ignore", "-q", "--", output], { cwd: root });
  if (!useFullSqlite(root)) throw new Error("The private data/banidb/banidb.sqlite copy is required to search the corpus (and BANIDB_SOURCE must not be \"fixture\").");
  const rules = new Map(seed.rules.map((rule) => [rule.id, rule]));
  const family = kartarFamily(rules.get("TERM-02")!.prefilter!.patterns.find((p) => p.action === "llm_confirm")!.pattern);
  const glyph = openingGlyph(rules.get("TERM-03")!.prefilter!.keywords);
  const complete = loadSqliteSabads(root).sabads.filter(dataComplete);
  const kartar = pickShortest(complete.filter((s) => s.lines.some((l) => hasFamilyToken(l.gurmukhi, family))));
  const opens = complete.filter((s) => s.lines[0].gurmukhi.trim().startsWith(glyph));
  const ikOankar = pickShortest(opens.filter((s) => s.shabad_id !== kartar?.shabad_id)) ?? pickShortest(opens);
  const kept = complete.find((s) => s.shabad_id === "1356");
  const picks = [
    ...(kept ? [describe(kept, "existing demo fixture (kept)")] : []),
    ...(kartar ? [describe(kartar, "complete Sabad with Rahao; a line contains a Kartar/Karta Divine-name form (TERM-02)")] : []),
    ...(ikOankar ? [describe(ikOankar, "complete Sabad with Rahao that opens with the Ik Onkar glyph (TERM-03)")] : []),
  ];
  const result = { provisional: true, sabads: picks };
  writeFileSync(resolve(root, output), JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : "Demo Sabad search failed."); process.exitCode = 1; }
}
