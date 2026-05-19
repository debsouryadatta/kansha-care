import { motion, type Variants } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Database,
  Globe2,
  MapPin,
  RadioTower,
  ShieldCheck,
  Siren
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@kansha/ui";

const heroStats: Array<{ label: string; value: string; detail: string; icon: LucideIcon }> = [
  { label: "Source", value: "USGS", detail: "live GeoJSON feeds", icon: RadioTower },
  { label: "Coverage", value: "30d", detail: "backfilled history", icon: Database },
  { label: "Alerts", value: "24/7", detail: "Telegram escalation", icon: BellRing },
  { label: "Scope", value: "3", detail: "personal locations", icon: MapPin }
];

const workflow: Array<{ label: string; title: string; body: string; icon: LucideIcon }> = [
  {
    label: "Ingest",
    title: "Continuous public-event feed",
    body: "Live polls and startup backfill keep the dashboard useful before the first operator touch.",
    icon: RadioTower
  },
  {
    label: "Score",
    title: "Risk by magnitude, place, and time",
    body: "Global and personal-location views separate routine movement from events that deserve attention.",
    icon: Activity
  },
  {
    label: "Escalate",
    title: "Telegram alerts with context",
    body: "High-risk, local, swarm, and source-silence alerts include enough detail to act fast.",
    icon: Siren
  }
];

const operations = [
  "Live global dashboard",
  "Personal monitored locations",
  "Telegram connection state",
  "Source-health watchdog"
];

const mapMarkers = [
  { left: "18%", top: "45%", size: "h-3 w-3", delay: "0s" },
  { left: "34%", top: "34%", size: "h-2.5 w-2.5", delay: "0.6s" },
  { left: "53%", top: "55%", size: "h-4 w-4", delay: "1.1s" },
  { left: "70%", top: "40%", size: "h-3.5 w-3.5", delay: "1.7s" },
  { left: "83%", top: "62%", size: "h-2.5 w-2.5", delay: "2.2s" }
];

const easeOut = [0.22, 1, 0.36, 1] as const;
const smoothEase = [0.16, 1, 0.3, 1] as const;

const smoothPanel: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.72, ease: smoothEase }
  }
};

const smoothList: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.12,
      staggerChildren: 0.09
    }
  }
};

const smoothCard: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.985, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.68, ease: smoothEase }
  }
};

export function LandingPage() {
  return (
    <main className="dashboard-shell min-h-screen overflow-hidden text-slate-950">
      <section className="relative isolate px-3 py-3 sm:px-5 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: easeOut }}
          className="relative flex min-h-[calc(94svh-1.5rem)] overflow-hidden rounded-[32px] bg-slate-100 text-slate-950 shadow-[0_30px_110px_rgba(79,70,229,0.16)] ring-1 ring-white sm:rounded-[44px]"
        >
          <div className="landing-hero-visual absolute inset-0" aria-hidden="true" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(248,250,252,0.96)_0%,rgba(248,250,252,0.82)_46%,rgba(248,250,252,0.28)_100%)]" />
          <div className="absolute inset-x-6 top-6 z-10 h-px bg-white/70 sm:inset-x-10" />

          <div className="relative z-10 flex w-full flex-col">
            <header className="flex items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
              <Link to="/" className="group flex items-center gap-3" aria-label="Kansha Care home">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-600 text-sm font-black text-white shadow-xl shadow-indigo-200 transition group-hover:-translate-y-0.5">
                  KC
                </span>
                <span className="text-sm font-semibold text-slate-950 sm:text-base">Kansha Care</span>
              </Link>

              <nav className="flex items-center gap-2">
                <Button
                  asChild
                  variant="ghost"
                  className="hidden rounded-2xl bg-white/35 text-slate-700 shadow-sm ring-1 ring-white/60 backdrop-blur hover:bg-white hover:text-indigo-700 sm:inline-flex"
                >
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild className="rounded-2xl bg-indigo-600 px-5 text-white shadow-xl shadow-indigo-200 hover:bg-indigo-700">
                  <Link to="/signup">Start monitoring</Link>
                </Button>
              </nav>
            </header>

            <div className="grid flex-1 items-end gap-10 px-5 pb-7 pt-12 sm:px-8 sm:pb-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.62fr)] lg:px-12 lg:pb-12">
              <motion.div
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.14, ease: easeOut }}
                className="max-w-3xl"
              >
                <p className="mb-5 text-xs font-semibold uppercase tracking-[0.28em] text-indigo-700">Kansha Monitor</p>
                <h1 className="max-w-4xl text-5xl font-semibold leading-[0.96] tracking-normal text-slate-950 sm:text-7xl lg:text-8xl">
                  Earthquake monitoring, quietly handled
                </h1>
                <p className="mt-6 max-w-xl text-base font-medium leading-8 text-slate-700 sm:text-lg">
                  Ingest USGS events, monitor global risk, track personal locations, and send Telegram alerts from one calm dashboard.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button asChild size="lg" className="rounded-2xl bg-indigo-600 px-5 shadow-xl shadow-indigo-200 hover:bg-indigo-700">
                    <Link to="/signup">
                      Create account
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="secondary"
                    size="lg"
                    className="rounded-2xl border-0 bg-white/70 px-5 text-slate-950 shadow-sm ring-1 ring-white/80 backdrop-blur hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    <Link to="/login">Open dashboard</Link>
                  </Button>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 22, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.7, delay: 0.26, ease: easeOut }}
                whileHover={{ y: -4 }}
                className="relative justify-self-stretch rounded-[30px] bg-white/[0.92] p-4 text-slate-950 shadow-[0_30px_80px_rgba(79,70,229,0.16)] ring-1 ring-white/80 backdrop-blur-xl lg:max-w-[430px] lg:justify-self-end"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Live alert preview</p>
                    <h2 className="mt-3 text-3xl font-semibold leading-tight">M 5.1 near monitored region</h2>
                  </div>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                    <Siren className="h-5 w-5" />
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
                  <SignalMetric label="Window" value="24h" />
                  <SignalMetric label="Radius" value="500 km" />
                  <SignalMetric label="Threshold" value="M >= 4.0" />
                  <SignalMetric label="Channel" value="Telegram" />
                </div>

                <div className="mt-5 rounded-[22px] bg-slate-950 p-4 text-white">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-200">System now</p>
                      <p className="mt-1 text-xl font-semibold">Healthy feed</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                      <span className="h-2 w-2 rounded-full bg-indigo-600" />
                      Live
                    </span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      initial={{ width: "18%" }}
                      animate={{ width: "78%" }}
                      transition={{ duration: 1.1, delay: 0.55, ease: easeOut }}
                      className="h-full rounded-full bg-indigo-400"
                    />
                  </div>
                </div>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.38, ease: easeOut }}
              className="grid border-t border-white/60 bg-white/65 backdrop-blur-xl sm:grid-cols-2 xl:grid-cols-4"
            >
              {heroStats.map((stat) => (
                <div key={stat.label} className="flex items-center gap-3 border-white/70 px-5 py-4 sm:border-r lg:px-8">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                    <stat.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{stat.label}</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-slate-950">
                      {stat.value} <span className="font-medium text-slate-500">{stat.detail}</span>
                    </p>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-[1220px]">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.35 }}
            variants={smoothPanel}
            className="dashboard-panel landing-motion-panel overflow-hidden p-5 sm:p-6 lg:p-8"
          >
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600">Operational clarity</p>
                <h2 className="mt-3 text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
                  See the live system at a glance.
                </h2>
                <p className="mt-4 max-w-xl text-sm font-medium leading-7 text-slate-500 sm:text-base">
                  Know the feed is running, see the events that matter, and keep personal locations close without switching tools.
                </p>
              </div>

              <motion.div variants={smoothList} className="grid gap-3 sm:grid-cols-2">
                {operations.map((item) => (
                  <motion.div
                    key={item}
                    variants={smoothCard}
                    whileHover={{ y: -2, transition: { duration: 0.18, ease: "easeOut" } }}
                    className="landing-motion-card group flex items-center gap-3 rounded-[22px] bg-slate-50 px-4 py-4 ring-1 ring-slate-200/80 transition-colors duration-200 hover:bg-indigo-50 hover:ring-indigo-100"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/80 transition-colors duration-200 group-hover:ring-indigo-100">
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-semibold text-slate-800">{item}</span>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
        <div className="mx-auto grid max-w-[1220px] gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.35 }}
            variants={smoothPanel}
            className="lg:sticky lg:top-8"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600">From feed to response</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-slate-950 sm:text-5xl">
              Built like an emergency operations loop.
            </h2>
            <p className="mt-5 max-w-lg text-base font-medium leading-8 text-slate-500">
              Every screen has a job: know what happened, know where it matters, and know whether the alerting system is healthy.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.24, margin: "0px 0px -8% 0px" }}
            variants={smoothList}
            className="space-y-4"
          >
            {workflow.map((step) => (
              <motion.div
                key={step.label}
                variants={smoothCard}
                whileHover={{ y: -2, transition: { duration: 0.18, ease: "easeOut" } }}
                className="dashboard-panel landing-motion-card group p-4 transition-shadow duration-200 hover:shadow-xl hover:shadow-indigo-950/5 sm:p-5"
              >
                <div className="flex gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 transition-colors duration-200 group-hover:bg-indigo-600 group-hover:text-white">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">{step.label}</p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">{step.title}</h3>
                    <p className="mt-2 text-sm font-medium leading-7 text-slate-500">{step.body}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.55, ease: easeOut }}
          className="mx-auto grid max-w-[1220px] overflow-hidden rounded-[34px] bg-white text-slate-950 shadow-[0_30px_90px_rgba(79,70,229,0.12)] ring-1 ring-slate-200/80 lg:grid-cols-[1fr_0.75fr]"
        >
          <div className="relative min-h-[390px] overflow-hidden p-5 sm:p-8">
            <div className="landing-map-card absolute inset-0" aria-hidden="true" />
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-indigo-100 ring-1 ring-white/20">
                  <Globe2 className="h-4 w-4" />
                  Global activity
                </span>
                <span className="rounded-full bg-indigo-400/[0.15] px-3 py-1.5 text-xs font-semibold text-indigo-100 ring-1 ring-indigo-200/20">
                  refreshed every 60s
                </span>
              </div>

              <div className="relative mt-10 h-[260px] rounded-[28px] border border-white/10 bg-slate-900/[0.45]">
                <div className="absolute inset-5 rounded-[24px] border border-white/10" />
                <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-200/20" />
                <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-200/10" />
                {mapMarkers.map((marker) => (
                  <span
                    key={`${marker.left}-${marker.top}`}
                    className={`landing-marker absolute ${marker.size}`}
                    style={{ left: marker.left, top: marker.top, animationDelay: marker.delay }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white p-6 text-slate-950 sm:p-8 lg:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600">Ready when you are</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Open the dashboard and start monitoring.
            </h2>
            <p className="mt-4 text-sm font-medium leading-7 text-slate-500">
              Sign up, add monitored places, connect Telegram, and watch live events with the same clean operational UI.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-2xl bg-indigo-600 hover:bg-indigo-700">
                <Link to="/signup">
                  Create account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="rounded-2xl">
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
            <div className="mt-8 flex items-center gap-3 rounded-[22px] bg-slate-50 px-4 py-4 ring-1 ring-slate-200/80">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-slate-700">
                Role-aware views keep operators and admins in the same monitoring flow.
              </p>
            </div>
          </div>
        </motion.div>
      </section>
    </main>
  );
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3 ring-1 ring-slate-200/80">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}
