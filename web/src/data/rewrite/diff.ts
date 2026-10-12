export type DiffOp = ' ' | '+' | '-';

export interface DiffLine {
  op: DiffOp;
  text: string;
}

/** Line diff from `before` to `after` by longest common subsequence (AIR-25). */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  // lcs[i][j]: length of the LCS of a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ op: ' ', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ op: '-', text: a[i++] });
    } else {
      result.push({ op: '+', text: b[j++] });
    }
  }
  while (i < a.length) result.push({ op: '-', text: a[i++] });
  while (j < b.length) result.push({ op: '+', text: b[j++] });
  return result;
}
