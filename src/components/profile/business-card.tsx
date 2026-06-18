"use client";

import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { IdCard } from "lucide-react";

/**
 * A user's business card. Small, compact, mobile-friendly thumbnail that zooms
 * into the full card (centered, dimmed backdrop) when tapped — same lightbox
 * feel as the avatar. Rendered only when the profile has a business_card_url
 * (set manually in the DB); otherwise the caller renders nothing.
 *
 * The card image is a wide rectangle (e.g. 1040×600); we keep its aspect ratio.
 */
export function BusinessCard({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(false);
  const layoutId = `biz-card-${useId()}`;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <IdCard className="size-4 text-gold" /> Business card
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${name}'s business card`}
        className="block w-full max-w-xs overflow-hidden rounded-xl border border-border/60 outline-none transition-transform hover:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/60 active:scale-[0.98]"
      >
        <motion.img
          layoutId={open ? undefined : layoutId}
          src={url}
          alt={`${name}'s business card`}
          className="aspect-[1040/600] w-full object-cover"
          loading="lazy"
        />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="biz-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
              >
                <motion.img
                  layoutId={layoutId}
                  transition={{ type: "spring", stiffness: 260, damping: 28 }}
                  onClick={(e) => e.stopPropagation()}
                  src={url}
                  alt={`${name}'s business card`}
                  className="max-h-[80vh] w-full max-w-2xl rounded-2xl border-2 border-gold/60 object-contain shadow-2xl shadow-gold/30"
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </section>
  );
}
