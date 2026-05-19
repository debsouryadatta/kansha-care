import * as React from "react";
import { cn } from "../lib/cn";

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn("rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_rgba(79,70,229,0.08)]", className)}
      {...props}
    />
  );
}

export function PanelHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-slate-100 px-4 py-4", className)} {...props} />;
}

export function PanelBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}
