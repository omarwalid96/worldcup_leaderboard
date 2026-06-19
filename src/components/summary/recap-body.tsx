import { cn } from "@/lib/utils";
import { segmentMixedText } from "@/lib/summary/bidi-segment";
import { parseRecapBody } from "@/lib/summary/parse-recap";

/** Emphasise scorelines, ranks, and quoted banter inside a single-direction run. */
function HighlightRun({ text }: { text: string }) {
  const parts = text.split(/(\d+-\d+|#[0-9]+|"[^"]+"|'[^']+')/g);

  return (
    <>
      {parts.map((part, i) => {
        if (/^\d+-\d+$/.test(part)) {
          return (
            <span key={i} className="font-numeric text-base text-gold">
              {part}
            </span>
          );
        }
        if (/^#[0-9]+$/.test(part)) {
          return (
            <span key={i} className="font-numeric text-gold">
              {part}
            </span>
          );
        }
        if (
          (part.startsWith('"') && part.endsWith('"')) ||
          (part.startsWith("'") && part.endsWith("'"))
        ) {
          return (
            <span key={i} className="text-gold-light italic">
              {part}
            </span>
          );
        }
        return part;
      })}
    </>
  );
}

/** Franco-Arabic copy: isolated LTR islands (names, scores) in RTL paragraphs. */
function MixedText({ text, className }: { text: string; className?: string }) {
  const runs = segmentMixedText(text);

  return (
    <span className={className}>
      {runs.map((run, i) => (
        <span
          key={i}
          dir={run.dir}
          className={cn(
            "inline [unicode-bidi:isolate]",
            run.dir === "rtl" ? "font-arabic" : "font-sans",
          )}
        >
          <HighlightRun text={run.text} />
        </span>
      ))}
    </span>
  );
}

function sectionTone(text: string): "live" | "sad" | "default" {
  const lower = text.toLowerCase();
  if (lower.includes("live")) return "live";
  if (/حزين|sad|miss|roast|flop|fail/.test(lower)) return "sad";
  return "default";
}

export function RecapBody({
  body,
  className,
  compact = false,
}: {
  body: string;
  className?: string;
  /** Tighter spacing for the home-card preview. */
  compact?: boolean;
}) {
  const blocks = parseRecapBody(body);

  return (
    <div
      className={cn(
        "flex flex-col text-sm leading-8 text-foreground/90",
        compact ? "gap-2.5" : "gap-3.5",
        className,
      )}
    >
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "title":
            return (
              <p
                key={i}
                dir="rtl"
                className="border-b border-gold/25 pb-2 text-center font-display text-base tracking-wide text-gold"
              >
                <MixedText text={block.text} />
              </p>
            );

          case "section": {
            const tone = sectionTone(block.text);
            return (
              <p
                key={i}
                dir="rtl"
                className={cn(
                  "font-arabic text-[13px] font-semibold tracking-wide",
                  tone === "live" && "text-live",
                  tone === "sad" && "text-muted-foreground",
                  tone === "default" && "text-gold/90",
                )}
              >
                <MixedText text={block.text} />
              </p>
            );
          }

          case "bullet":
            return (
              <div
                key={i}
                dir="rtl"
                className="grid grid-cols-[1rem_1fr] items-start gap-x-2"
              >
                <span className="text-center text-gold" aria-hidden>
                  •
                </span>
                <p className="min-w-0 text-start">
                  <MixedText text={block.text} />
                </p>
              </div>
            );

          case "paragraph":
            return (
              <p key={i} dir="rtl" className="text-start">
                <MixedText text={block.text} />
              </p>
            );
        }
      })}
    </div>
  );
}
