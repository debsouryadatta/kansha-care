import * as React from "react";
import { cn } from "../lib/cn";

type ToastVariant = "success" | "error";

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
};

type ToastListener = (toasts: ToastItem[]) => void;

let toastSequence = 0;
let toasts: ToastItem[] = [];
const listeners = new Set<ToastListener>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  for (const listener of listeners) {
    listener(toasts);
  }
}

function dismiss(id: string) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

function push(message: string, variant: ToastVariant, duration = variant === "error" ? 4600 : 2600) {
  const id = `toast-${Date.now()}-${toastSequence++}`;
  const item = { id, message, variant, duration };
  toasts = [item, ...toasts].slice(0, 4);
  emit();

  if (duration > 0) {
    timers.set(id, setTimeout(() => dismiss(id), duration));
  }

  return id;
}

export const toast = {
  success: (message: string) => push(message, "success"),
  error: (message: string) => push(message, "error"),
  dismiss
};

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>(toasts);

  React.useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      aria-relevant="additions text"
      className="fixed right-0 top-0 z-[10000] flex max-h-screen w-full flex-col gap-2 p-4 sm:right-5 sm:top-5 sm:max-w-[340px] sm:p-0"
    >
      {items.map((item) => {
        const isError = item.variant === "error";
        return (
          <div
            key={item.id}
            role={isError ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex min-h-10 w-full items-center gap-2.5 rounded-2xl border bg-white px-3.5 py-2.5 text-sm text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.12)] ring-1 ring-black/5",
              isError ? "border-red-100 bg-red-50 text-red-950" : "border-emerald-100"
            )}
          >
            {isError ? (
              <ErrorIcon className="h-5 w-5 shrink-0 text-red-500" />
            ) : (
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                <SuccessIcon className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="min-w-0 flex-1 truncate font-medium leading-5">{item.message}</div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(item.id)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SuccessIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 10.5l3 3 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M7.5 7.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
