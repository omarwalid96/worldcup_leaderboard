/**
 * Linear billboard banner that scrolls right-to-left forever, looping seamlessly.
 * Two identical tracks shifted by -50% (the shared `marquee` keyframe) so as one
 * copy exits left the other fills in from the right. Pure CSS, no JS.
 * ponytail: reuses the existing .animate-marquee — no new keyframe.
 */
export function HypeBanner({ name = "weedo" }: { name?: string }) {
  const message = `${name} top — wel ba2y kantalop 🐐🔥`;
  // Repeat the phrase a few times per track so a wide screen never shows a gap.
  const line = Array(6).fill(message).join("   •   ");
  return (
    <div className="overflow-hidden border-b border-gold/30 bg-gold/10 py-1.5">
      <div className="flex w-max animate-marquee whitespace-nowrap [--marquee-duration:30s]">
        <span className="px-4 text-sm font-display tracking-wide text-gold">
          {line}
          {"   •   "}
        </span>
        <span
          aria-hidden
          className="px-4 text-sm font-display tracking-wide text-gold"
        >
          {line}
          {"   •   "}
        </span>
      </div>
    </div>
  );
}
