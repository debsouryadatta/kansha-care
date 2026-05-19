import { cn } from "@kansha/ui";

export function MetricStrip({
  metrics
}: {
  metrics: Array<{ label: string; value: string | number; tone?: "default" | "warn" | "danger" | "good" }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-[24px] bg-white px-4 py-4 shadow-[0_18px_45px_rgba(79,70,229,0.06)] ring-1 ring-slate-200/70 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-950/5"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{metric.label}</div>
          <div
            className={cn(
              "mt-2 text-3xl font-semibold tracking-normal text-slate-950",
              metric.tone === "danger" && "text-rose-600",
              metric.tone === "warn" && "text-amber-600",
              metric.tone === "good" && "text-indigo-600"
            )}
          >
            {metric.value}
          </div>
        </div>
      ))}
    </div>
  );
}
