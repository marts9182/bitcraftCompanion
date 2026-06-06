import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Callout({ type = "info", children }: { type?: "info" | "warn"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "my-4 rounded-md border-l-4 p-4 text-sm",
        type === "warn" ? "border-amber-500 bg-amber-500/10" : "border-sky-500 bg-sky-500/10",
      )}
    >
      {children}
    </div>
  );
}
