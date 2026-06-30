/**
 * Two vertical "paper-roll" ribbons that drop from the top on the home page,
 * like party streamers unrolling. CSS-only (animate-paper-drop). Fixed to the
 * screen corners, pointer-events-none so they never block taps. Each side gets a
 * small extra delay via inline animationDelay so they release a beat apart.
 * ponytail: no JS, no lib — a div with vertical text + the drop keyframe.
 */
const MESSAGE = "weedo top — wel ba2y kantalop 🐐🔥";

function Roll({ side, delay }: { side: "left" | "right"; delay: string }) {
  return (
    <div
      aria-hidden
      className={`animate-paper-drop pointer-events-none fixed top-0 z-30 ${
        side === "left" ? "left-2" : "right-2"
      }`}
      style={{ animationDelay: delay }}
    >
      {/* the little roll cap at the very top */}
      <div className="mx-auto h-2 w-10 rounded-b-sm bg-gold/70 shadow-md" />
      <div className="flex h-[60vh] w-9 items-center justify-center rounded-b-md border-x border-gold/40 bg-gradient-to-b from-gold/25 to-gold/5 shadow-lg backdrop-blur-sm">
        <span
          className="font-display text-xs tracking-widest text-gold whitespace-nowrap"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          {MESSAGE}
        </span>
      </div>
    </div>
  );
}

export function PaperRollBanners() {
  return (
    <>
      <Roll side="left" delay="0.1s" />
      <Roll side="right" delay="0.35s" />
    </>
  );
}
