export interface SourceLineFields {
  ID: number;
  ShabadID: number;
  SourceID: string;
  PageNo: number;
  Gurmukhi: string;
  GurmukhiUni: string;
  RaagEnglish: string;
  WriterEnglish: string;
}
export function hasRahaoMarker(legacy: string): boolean {
  // BaniDB source markers occur both after whitespace and in bracketed notation.
  return /(?:^|[\s\]])rhwau(?:[\s\]|[|.0-9]|$)/i.test(legacy);
}

export function normalizeSourceText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing Unicode source text; refusing to substitute or generate it.");
  }
  return value.normalize("NFC");
}

export function assertCompleteSabad(expected: number, actual: number): void {
  if (!Number.isSafeInteger(expected) || expected < 1 || expected !== actual) {
    throw new Error(`Incomplete Sabad: ${actual} stored lines for ${expected} source mappings.`);
  }
}

export function toDemoSabad(rows: SourceLineFields[], expectedShabadId?: number) {
  if (!rows.length) throw new Error("No source lines found for the Sabad.");
  if (expectedShabadId !== undefined && rows.some((row) => row.ShabadID !== expectedShabadId)) {
    throw new Error("Sabad header does not match source line IDs.");
  }
  const ids = new Set<number>();
  const shabadId = rows[0].ShabadID;
  return {
    shabad_id: String(shabadId),
    lines: rows.map((row) => {
      if (row.SourceID !== "G") throw new Error("Demo lines must come from SourceID G.");
      if (!Number.isSafeInteger(row.ID) || row.ID < 1 || ids.has(row.ID) ||
          !Number.isSafeInteger(shabadId) || shabadId < 1 || row.ShabadID !== shabadId) {
        throw new Error("Invalid, duplicate or mixed BaniDB source IDs.");
      }
      if (!Number.isInteger(row.PageNo) || row.PageNo < 1 || row.PageNo > 1430 ||
          typeof row.RaagEnglish !== "string" || !row.RaagEnglish.trim() ||
          typeof row.WriterEnglish !== "string" || !row.WriterEnglish.trim() ||
          typeof row.Gurmukhi !== "string" || !row.Gurmukhi.trim()) {
        throw new Error("Missing or invalid BaniDB line metadata.");
      }
      const gurmukhi = normalizeSourceText(row.GurmukhiUni);
      if (!/\p{Script=Gurmukhi}/u.test(gurmukhi)) {
        throw new Error("BaniDB Unicode field contains no Gurmukhi source text.");
      }
      ids.add(row.ID);
      return {
        line_id: String(row.ID),
        shabad_id: String(row.ShabadID),
        ang: row.PageNo,
        raag: row.RaagEnglish,
        writer: row.WriterEnglish,
        // BaniDB's legacy source field supplies the refrain marker; no text conversion.
        is_rahao: hasRahaoMarker(row.Gurmukhi),
        gurmukhi,
      };
    }),
  };
}
