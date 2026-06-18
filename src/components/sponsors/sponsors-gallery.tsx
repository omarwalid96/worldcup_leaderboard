"use client";

import { useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Plus, X, Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  uploadSponsor,
  removeSponsor,
  type SponsorRow,
} from "@/lib/sponsors/actions";

const MAX = 10;

/**
 * Shared "Sponsors" gallery — a horizontal swipeable strip of PORTRAIT images.
 * Any member can add (up to 10 total) or remove any. Tap an image to zoom
 * (centered lightbox). Shown on the home dashboard under "Open to predict".
 */
export function SponsorsGallery({ initial }: { initial: SponsorRow[] }) {
  const [items, setItems] = useState<SponsorRow[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [zoom, setZoom] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const layoutId = `sponsor-zoom-${useId()}`;

  const full = items.length >= MAX;

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Image must be smaller than 3MB.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadSponsor(fd);
      if (res.ok) {
        // Refetch is simplest; but optimistic insert keeps it snappy. The
        // server revalidates, so a navigation will reconcile. Reload list:
        const { listSponsors } = await import("@/lib/sponsors/actions");
        setItems(await listSponsors());
        toast.success("Sponsor added.");
      } else {
        toast.error(res.error ?? "Upload failed.");
      }
    });
  }

  function onRemove(id: string) {
    startTransition(async () => {
      const res = await removeSponsor(id);
      if (res.ok) {
        setItems((prev) => prev.filter((s) => s.id !== id));
      } else {
        toast.error(res.error ?? "Couldn't remove.");
      }
    });
  }

  // Nothing yet and nobody's looking — still render the section so people can add.
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <Megaphone className="size-4 text-gold" /> Sponsors
        </h2>
        <span className="text-xs text-muted-foreground/70">
          {items.length}/{MAX}
        </span>
      </div>

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {items.map((s) => (
          <div key={s.id} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setZoom(s.imageUrl)}
              className="block overflow-hidden rounded-xl border border-border/60 outline-none transition-transform hover:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/60 active:scale-[0.98]"
              aria-label="View sponsor"
            >
              {/* Portrait aspect (3:4) thumbnail. motion.img to match the
                  codebase's avoid-next/image pattern (user-uploaded URLs). */}
              <motion.img
                src={s.imageUrl}
                alt="Sponsor"
                className="h-44 w-32 object-cover"
                loading="lazy"
              />
            </button>
            <button
              type="button"
              onClick={() => onRemove(s.id)}
              disabled={isPending}
              aria-label="Remove sponsor"
              className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/70 text-white backdrop-blur transition-colors hover:bg-destructive disabled:opacity-50"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}

        {!full && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isPending}
            className="flex h-44 w-32 shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-gold/40 hover:text-foreground disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <Plus className="size-5" />
                <span className="text-xs font-medium">Add sponsor</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onSelect}
        disabled={isPending}
      />

      {/* Zoom lightbox */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {zoom && (
              <motion.div
                key="sponsor-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setZoom(null)}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
              >
                <motion.img
                  layoutId={layoutId}
                  transition={{ type: "spring", stiffness: 260, damping: 28 }}
                  onClick={(e) => e.stopPropagation()}
                  src={zoom}
                  alt="Sponsor"
                  className={cn(
                    "max-h-[85vh] w-auto max-w-full rounded-2xl border-2 border-gold/60 object-contain shadow-2xl shadow-gold/30",
                  )}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </section>
  );
}
