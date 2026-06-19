export type DirRun = { dir: "ltr" | "rtl"; text: string };

const ARABIC_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_RE = /[A-Za-z]/;

/** Token = Arabic chunk, Latin word/phrase, scoreline, rank, or quoted string. */
const TOKEN_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+|[A-Za-z][A-Za-z0-9]*(?:[ \t][A-Za-z0-9]+)*|\d+-\d+|#[0-9]+|"[^"]+"|'[^']+'/g;

function classifyToken(token: string): "ltr" | "rtl" {
  if (ARABIC_RE.test(token)) return "rtl";
  if (LATIN_RE.test(token) || /^\d+-\d+$/.test(token) || /^#\d+$/.test(token)) {
    return "ltr";
  }
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return ARABIC_RE.test(token.slice(1, -1)) ? "rtl" : "ltr";
  }
  return "rtl";
}

function mergeAdjacent(runs: DirRun[]): DirRun[] {
  const out: DirRun[] = [];
  for (const run of runs) {
    const prev = out[out.length - 1];
    if (prev && prev.dir === run.dir) prev.text += run.text;
    else out.push({ ...run });
  }
  return out;
}

/**
 * Split Franco-Arabic recap copy into isolated LTR/RTL runs so English names,
 * scores, and Arabic banter render in natural reading order.
 */
export function segmentMixedText(text: string): DirRun[] {
  if (!text) return [];

  const runs: DirRun[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const gap = text.slice(lastIndex, match.index);
      if (gap) {
        if (runs.length === 0) runs.push({ dir: "rtl", text: gap });
        else runs[runs.length - 1]!.text += gap;
      }
    }
    runs.push({ dir: classifyToken(match[0]), text: match[0] });
    lastIndex = TOKEN_RE.lastIndex;
  }

  if (lastIndex < text.length) {
    const tail = text.slice(lastIndex);
    if (runs.length === 0) runs.push({ dir: "rtl", text: tail });
    else runs[runs.length - 1]!.text += tail;
  }

  return mergeAdjacent(runs);
}
