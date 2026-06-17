import Image from "next/image";
import { cn } from "@/lib/utils";
import brandMark from "../../public/brand-mark.jpg";

export function Brand({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold", className)}>
      <span className="relative grid size-8 place-items-center overflow-hidden rounded-lg shadow-lg shadow-primary/20">
        <Image
          src={brandMark}
          alt="Eznii Ya Dawly"
          fill
          sizes="32px"
          className="object-cover"
          priority
        />
      </span>
      {showText && (
        <span className="text-lg tracking-tight">
          Eznii <span className="text-primary">Ya Dawly</span>
        </span>
      )}
    </span>
  );
}
