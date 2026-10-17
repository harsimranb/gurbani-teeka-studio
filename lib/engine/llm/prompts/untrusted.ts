/** Wraps untrusted text in delimiters; a literal tag inside it is escaped so it cannot close the block early. */
export function untrusted(text: string): string {
  return `<untrusted>${text.replace(/<(\/?)untrusted/gi, "&lt;$1untrusted")}</untrusted>`;
}
