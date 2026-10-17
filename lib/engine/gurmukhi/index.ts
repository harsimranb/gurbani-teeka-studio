import { WordSchema, type Line, type Rule, type Sabad, type Word } from "../../contracts/domain";

export interface Token { surface: string; stem_key: string; ending_matra: string; start: number; end: number; index: number }
export interface DivineNameFamily { key: string; alternatives: string[]; stemKeys: string[] }
export interface DivineNameHit { line_id: string; family: string; token: Token }

// Dependent vowel signs U+0A3E-U+0A4C plus nasal marks (adak bindi, bindi, tippi).
const ENDING_MATRA = /[\u0A3E-\u0A4C\u0A01\u0A02\u0A70]+$/u;
const PUNCT_OR_DIGIT = /^[\p{P}\p{S}\p{N}\u0964\u0965]+$/u;

export function tokenize(gurmukhi: string): Token[] {
  if (gurmukhi.normalize("NFC") !== gurmukhi) throw new Error("tokenize requires NFC input");
  const tokens: Token[] = [];
  for (const match of gurmukhi.matchAll(/\S+/gu)) {
    const surface = match[0];
    if (PUNCT_OR_DIGIT.test(surface)) continue;
    const run = ENDING_MATRA.exec(surface)?.[0] ?? "";
    const split = run.length > 0 && run.length < surface.length;
    const start = match.index;
    tokens.push({ surface, stem_key: split ? surface.slice(0, -run.length) : surface, ending_matra: split ? run : "", start, end: start + surface.length, index: tokens.length });
  }
  return tokens;
}

export function toWords(line: Line): Word[] {
  return tokenize(line.gurmukhi).map((token) => WordSchema.parse({ line_id: line.line_id, index: token.index, surface: token.surface, stem_key: token.stem_key, ending_matra: token.ending_matra }));
}

export function divineNameFamilies(rules: Rule[]): DivineNameFamily[] {
  const rule = rules.find((candidate) => candidate.id === "TERM-02");
  if (!rule) return [];
  const alternatives: string[] = [];
  for (const entry of rule.prefilter?.patterns ?? []) {
    if (entry.action !== "llm_confirm") continue;
    const body = /^\(\?:([\s\S]*)\)$/u.exec(entry.pattern)?.[1];
    if (body) for (const alternative of body.split("|")) if (alternative && !alternatives.includes(alternative)) alternatives.push(alternative);
  }
  const stems = alternatives.map((alternative) => tokenize(alternative)[0]?.stem_key ?? alternative);
  const group = alternatives.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])));
  for (let i = 0; i < stems.length; i++) for (let j = i + 1; j < stems.length; j++) {
    if (stems[i].startsWith(stems[j]) || stems[j].startsWith(stems[i])) group[root(j)] = root(i);
  }
  const families = new Map<number, DivineNameFamily>();
  alternatives.forEach((alternative, i) => {
    const id = root(i);
    const family = families.get(id) ?? { key: stems[i], alternatives: [], stemKeys: [] };
    family.alternatives.push(alternative);
    if (!family.stemKeys.includes(stems[i])) family.stemKeys.push(stems[i]);
    if (stems[i].length < family.key.length) family.key = stems[i];
    families.set(id, family);
  });
  return [...families.values()];
}

// A homograph sharing a stem can match; hits are evidence for a later model check, not findings.
export function findDivineNames(line: Line, families: DivineNameFamily[]): DivineNameHit[] {
  const hits: DivineNameHit[] = [];
  for (const token of tokenize(line.gurmukhi)) {
    const family = families.find((candidate) => candidate.stemKeys.includes(token.stem_key));
    if (family) hits.push({ line_id: line.line_id, family: family.key, token });
  }
  return hits;
}

export function sabadDivineNames(sabad: Sabad, rules: Rule[]): DivineNameHit[] {
  const families = divineNameFamilies(rules);
  return sabad.lines.flatMap((line) => findDivineNames(line, families));
}
