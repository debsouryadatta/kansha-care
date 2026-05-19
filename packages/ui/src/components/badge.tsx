import * as React from "react";
import { cn } from "../lib/cn";

type BadgeTone = "slate" | "green" | "yellow" | "orange" | "red" | "blue";

const tones: Record<BadgeTone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  yellow: "bg-amber-50 text-amber-700 ring-amber-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-indigo-50 text-indigo-700 ring-indigo-200"
};

export function Badge({
  tone = "slate",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
