import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold", className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
        <Trophy className="size-4.5" strokeWidth={2.5} />
      </span>
      {showText && (
        <span className="text-lg tracking-tight">
          Group<span className="text-primary">Stage</span>
        </span>
      )}
    </span>
  );
}
