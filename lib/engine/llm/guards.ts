const NON_NEUTRAL = /\bincorrect\b|\bwrong\b|mistranslat\w*|\binaccurate\b|\bnot accurate\b|\berror in (the )?translation\b/i;
const REWRITE = /\b(replace|rewrite|rephrase|reword|should read|could read|consider (using|writing|rendering)|suggest(ed|ion|s)?|better rendering|recommended rendering|try using|prefer(able)?|should be|would be (closer|better|clearer)|render\s+(it\s+|this\s+)?as|could be (rendered|written)|might read)\b|\buse\s+["“'‘]/i;
// Double quotes, curly doubles, and single/curly-single quotes bounded by non-letters (so "draft's" is no quote).
const QUOTES = [/"([^"]*)"/g, /“([^”]*)”/g, /(?<![\p{L}\p{N}])['‘]([^'‘’]+)['’](?![\p{L}\p{N}])/gu];

// A run of Gurmukhi-block characters (letters, vowel signs, nasalisation marks, digits).
const GURMUKHI_RUN = /[\u0A00-\u0A7F]+/gu;

/** Hard rule 2: model text may name Gurmukhi only as whole words copied verbatim (NFC) from the evidence, never its own spelling. */
function gurmukhiFromEvidence(explanation: string, allowedQuotes: string[]): boolean {
  const runs = explanation.normalize("NFC").match(GURMUKHI_RUN);
  if (!runs) return true;
  const words = new Set(allowedQuotes.flatMap((text) => text.normalize("NFC").match(GURMUKHI_RUN) ?? []));
  return runs.every((run) => words.has(run));
}

/**
 * Hard rules 1, 2 and 5: a model explanation may not be non-neutral, propose wording, quote text that is not in
 * the evidence, or contain Gurmukhi other than whole words copied verbatim from the evidence.
 */
export function passesReviewGuards(explanation: string, allowedQuotes: string[] = []): boolean {
  if (!gurmukhiFromEvidence(explanation, allowedQuotes)) return false;
  const allowed = allowedQuotes.map((text) => text.toLowerCase());
  const quotesOk = QUOTES.every((pattern) => [...explanation.matchAll(pattern)].every((match) => allowed.some((text) => text.includes(match[1].toLowerCase()))));
  if (!quotesOk) return false;
  // Quoting the evidence (a draft saying "other translations are wrong") is not Eko's voice; everything outside quotes must be neutral.
  const unquoted = QUOTES.reduce((text, pattern) => text.replace(pattern, " "), explanation);
  return !NON_NEUTRAL.test(unquoted) && !REWRITE.test(unquoted);
}
