import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Country flag for a team. Falls back to a neutral placeholder for TBD
 * knockout slots (no ISO code).
 */
export function TeamFlag({
  code,
  alt,
  size = 28,
  className,
}: {
  code: string | null;
  alt: string;
  size?: number;
  className?: string;
}) {
  if (!code) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-grid place-items-center rounded-sm bg-muted text-[10px] font-semibold text-muted-foreground",
          className,
        )}
        style={{ width: size, height: Math.round(size * 0.72) }}
      >
        ?
      </span>
    );
  }
  return (
    <Image
      src={`https://flagcdn.com/w80/${code}.png`}
      alt={`${alt} flag`}
      width={size}
      height={Math.round(size * 0.72)}
      className={cn("rounded-sm object-cover shadow-sm ring-1 ring-black/20", className)}
      unoptimized
    />
  );
}
