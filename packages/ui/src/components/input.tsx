import * as React from "react";
import { cn } from "../lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
