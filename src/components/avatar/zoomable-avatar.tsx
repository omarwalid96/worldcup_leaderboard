"use client";

import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * An avatar that zooms into a centered, dimmed lightbox when tapped, then
 * shrinks back to its place when the backdrop is tapped. Uses motion's shared
 * `layoutId` so the same element animates from its spot to the centre and back
 * (a true "fly + grow" rather than a cross-fade).
 *
 * Drop-in for an <Avatar>: pass src/alt/fallback and the className for the
 * small (in-layout) size. The enlarged size is fixed (a big circle).
 */
export function ZoomableAvatar({
  src,
  alt,
  fallback,
  className,
  fallbackClassName,
}: {
  src?: string | null;
  alt: string;
  fallback: string;
  /** Classes for the in-layout (small) avatar — e.g. "size-16 border …". */
  className?: string;
  /** Classes for the fallback text bubble (matches the small avatar's style). */
  fallbackClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  // Unique per instance so multiple zoomable avatars don't share a layoutId.
  const layoutId = `zoom-avatar-${useId()}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${alt}'s photo larger`}
        className="rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-gold/60 active:scale-95"
      >
        <motion.div layoutId={open ? undefined : layoutId}>
          <Avatar className={className}>
            {src && <AvatarImage src={src} alt={alt} />}
            <AvatarFallback className={fallbackClassName}>{fallback}</AvatarFallback>
          </Avatar>
        </motion.div>
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-8 backdrop-blur-sm"
              >
                <motion.div
                  layoutId={layoutId}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "relative aspect-square w-full max-w-xs",
                  )}
                >
                  <Avatar className="size-full border-4 border-gold/70 shadow-2xl shadow-gold/30">
                    {src && <AvatarImage src={src} alt={alt} />}
                    <AvatarFallback className="bg-gold/15 text-6xl font-semibold text-gold">
                      {fallback}
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
