/** A half-open range of UTF-16 code units, the contract's span convention (`text.slice(start, end)`). */
export interface Range { start: number; end: number }

/** True when two non-empty ranges share at least one code unit. Touching ranges (end === start) do not overlap. */
export function overlaps(a: Range, b: Range): boolean {
  return a.start < a.end && b.start < b.end && a.start < b.end && b.start < a.end;
}

// A word (letters, digits, marks, apostrophes) or one punctuation character; whitespace is not a token.
const TOKEN = /[\p{L}\p{N}\p{M}'’]+|[^\s\p{L}\p{N}\p{M}'’]/gu;

interface Token { text: string; start: number; end: number }

function tokenize(text: string): Token[] {
  return [...text.matchAll(TOKEN)].map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
}

/** Above this many tokens on either side the quadratic alignment is skipped and only the shared head and tail are anchored. */
const MAX_TOKENS = 3000;

/**
 * One contiguous reviewer edit. `span` is the replaced or deleted range in the PRE-edit text; it is
 * null for a pure insertion, which has nothing in the pre-edit text to align a finding to.
 */
export interface EditHunk { span: Range | null; before: string; after: string }

/**
 * Word-level diff of the pre-edit and approved text. Unchanged words are anchored by a longest common
 * subsequence; each gap between anchors is one hunk. Whitespace-only differences are not edits.
 * Deterministic: ties resolve toward earlier pre-edit tokens.
 */
export function editHunks(preEdit: string, postEdit: string): EditHunk[] {
  const pre = tokenize(preEdit);
  const post = tokenize(postEdit);
  const anchors: Array<[number, number]> = [];
  if (pre.length <= MAX_TOKENS && post.length <= MAX_TOKENS) {
    const width = post.length + 1;
    const table = new Uint32Array((pre.length + 1) * width);
    for (let i = pre.length - 1; i >= 0; i--) {
      for (let j = post.length - 1; j >= 0; j--) {
        table[i * width + j] = pre[i].text === post[j].text
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    for (let i = 0, j = 0; i < pre.length && j < post.length;) {
      if (pre[i].text === post[j].text) { anchors.push([i, j]); i++; j++; }
      else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++;
      else j++;
    }
  } else {
    let head = 0;
    while (head < pre.length && head < post.length && pre[head].text === post[head].text) { anchors.push([head, head]); head++; }
    let tail = 0;
    while (tail < pre.length - head && tail < post.length - head && pre[pre.length - 1 - tail].text === post[post.length - 1 - tail].text) tail++;
    for (let k = tail; k > 0; k--) anchors.push([pre.length - k, post.length - k]);
  }
  const hunks: EditHunk[] = [];
  const bounds: Array<[number, number]> = [[-1, -1], ...anchors, [pre.length, post.length]];
  for (let k = 1; k < bounds.length; k++) {
    const removed = pre.slice(bounds[k - 1][0] + 1, bounds[k][0]);
    const added = post.slice(bounds[k - 1][1] + 1, bounds[k][1]);
    if (removed.length === 0 && added.length === 0) continue;
    const after = added.length === 0 ? "" : postEdit.slice(added[0].start, added.at(-1)!.end);
    if (removed.length === 0) { hunks.push({ span: null, before: "", after }); continue; }
    const span = { start: removed[0].start, end: removed.at(-1)!.end };
    hunks.push({ span, before: preEdit.slice(span.start, span.end), after });
  }
  return hunks;
}
