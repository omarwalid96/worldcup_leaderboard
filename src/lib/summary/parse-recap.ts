export type RecapBlock =
  | { kind: "title"; text: string }
  | { kind: "section"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string };

/** Split plain-text /recap output into display blocks (title, sections, bullets). */
export function parseRecapBody(body: string): RecapBlock[] {
  const blocks: RecapBlock[] = [];
  let seenContent = false;
  let pendingBullet = false;

  for (const raw of body.split("\n")) {
    const text = raw.trim();
    if (!text) continue;

    // WhatsApp-style: bullet char alone on one line, text on the next.
    if (text === "•" || text === "-" || text === "*") {
      pendingBullet = true;
      seenContent = true;
      continue;
    }

    if (/^[•\-*]\s/.test(text)) {
      blocks.push({ kind: "bullet", text: text.replace(/^[•\-*]\s*/, "") });
      pendingBullet = false;
      seenContent = true;
      continue;
    }

    if (pendingBullet) {
      blocks.push({ kind: "bullet", text });
      pendingBullet = false;
      seenContent = true;
      continue;
    }

    if (!seenContent) {
      blocks.push({ kind: "title", text });
      seenContent = true;
      continue;
    }

    // "😂 الحزين section:" — short label ending in colon (no body on same line).
    if (text.endsWith(":") && text.length <= 96 && !/\d+-\d+/.test(text)) {
      blocks.push({ kind: "section", text });
      continue;
    }

    blocks.push({ kind: "paragraph", text });
  }

  return blocks;
}
