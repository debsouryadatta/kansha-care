import React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Check,
  Gauge,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MapPin,
  Minus,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { Badge, Button, Input, cn, toast } from "@kansha/ui";
import type {
  EarthquakeEventDTO,
  HealthDTO,
  LocationStatsDTO,
  LocationSuggestionDTO,
  MonitoredLocationDTO,
  PaginatedEventsDTO,
  TimeWindow
} from "@kansha/types";
import { extractRegion } from "@kansha/types";
import { api, getErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { notifyError } from "../lib/notifications";
import { AgentWidget } from "../components/AgentWidget";
import { GlobalMap, LocationMap } from "../components/MapPanel";
import { MetricStrip } from "../components/dashboard/MetricStrip";

const eventPageSize = 8;

type Summary = {
  total: number;
  highestMagnitudeEvent: EarthquakeEventDTO | null;
  m4Plus: number;
  m5Plus: number;
  activeRegions: Array<{ region: string; count: number }>;
};

type TelegramStatus = {
  connected: boolean;
  canReconnect: boolean;
  chat: TelegramChatStatus | null;
};

type TelegramChatStatus = {
  username: string | null;
  firstName: string | null;
  linkedAt: string;
};

type TelegramConnectResult =
  | { connected: true; reactivated: true; chat: TelegramChatStatus }
  | { connected: false; reactivated: false; expiresInMinutes: number; url: string };

function isMobileBrowser() {
  return /Android|iPad|iPhone|iPod/i.test(window.navigator.userAgent);
}

function openTelegramConnectUrl(url: string) {
  if (isMobileBrowser()) {
    window.location.assign(url);
    return "redirect";
  }

  const openedWindow = window.open(url, "_blank");
  if (!openedWindow) {
    window.location.assign(url);
    return "redirect";
  }

  openedWindow.opener = null;
  return "new-tab";
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [timeWindow, setTimeWindow] = React.useState<TimeWindow>("24h");
  const [events, setEvents] = React.useState<EarthquakeEventDTO[]>([]);
  const [eventPagination, setEventPagination] = React.useState<PaginatedEventsDTO["pagination"]>({
    page: 1,
    pageSize: eventPageSize,
    total: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false
  });
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [health, setHealth] = React.useState<HealthDTO | null>(null);
  const [locations, setLocations] = React.useState<MonitoredLocationDTO[]>([]);
  const [locationStats, setLocationStats] = React.useState<LocationStatsDTO[]>([]);
  const [telegram, setTelegram] = React.useState<TelegramStatus | null>(null);
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);
  const [locationAddress, setLocationAddress] = React.useState("");
  const [locationLabel, setLocationLabel] = React.useState("");
  const [locationSuggestions, setLocationSuggestions] = React.useState<LocationSuggestionDTO[]>([]);
  const [selectedLocationSuggestion, setSelectedLocationSuggestion] = React.useState<LocationSuggestionDTO | null>(null);
  const [isSuggestingLocation, setIsSuggestingLocation] = React.useState(false);
  const [locationSuggestionError, setLocationSuggestionError] = React.useState("");
  const [eventSearch, setEventSearch] = React.useState("");
  const [eventPage, setEventPage] = React.useState(1);
  const [selectedEventId, setSelectedEventId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [isEventsLoading, setIsEventsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isTelegramConnecting, setIsTelegramConnecting] = React.useState(false);
  const requestSeq = React.useRef(0);
  const telegramPanelRef = React.useRef<HTMLDivElement>(null);
  const lastDashboardErrorToast = React.useRef("");

  const refresh = React.useCallback(async (options: { showLoader?: boolean; notifySuccess?: boolean; notifyOnError?: boolean } = {}) => {
    const { showLoader = true, notifySuccess = false, notifyOnError = true } = options;
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    setError("");
    if (showLoader) {
      setIsEventsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    try {
      const query = new URLSearchParams({
        window: timeWindow,
        page: String(eventPage),
        pageSize: String(eventPageSize)
      });
      const search = eventSearch.trim();
      if (search) query.set("q", search);

      const [eventsRes, summaryRes, healthRes, locationsRes, telegramRes] = await Promise.all([
        api<PaginatedEventsDTO>(`/events?${query.toString()}`),
        api<Summary>(`/summary/global?window=${timeWindow}`),
        api<HealthDTO>("/health"),
        api<{ locations: MonitoredLocationDTO[] }>("/locations"),
        api<TelegramStatus>("/telegram/status")
      ]);
      if (requestId !== requestSeq.current) return;
      setEvents(eventsRes.events);
      setEventPagination(eventsRes.pagination);
      if (eventsRes.pagination.page !== eventPage) {
        setEventPage(eventsRes.pagination.page);
      }
      setSummary(summaryRes);
      setHealth(healthRes);
      setLocations(locationsRes.locations);
      setTelegram(telegramRes);
      const stats = await Promise.all(
        locationsRes.locations.map((location) => api<LocationStatsDTO>(`/locations/${location.id}/stats`))
      );
      if (requestId !== requestSeq.current) return;
      setLocationStats(stats);
      setLastRefresh(new Date());
      lastDashboardErrorToast.current = "";
      if (notifySuccess) {
        toast.success("Dashboard refreshed");
      }
    } catch (err) {
      if (requestId !== requestSeq.current) return;
      const message = getErrorMessage(err, "Failed to refresh dashboard");
      setError(message);
      if (notifyOnError && message !== lastDashboardErrorToast.current) {
        notifyError(err, "Failed to refresh dashboard");
        lastDashboardErrorToast.current = message;
      }
    } finally {
      if (requestId === requestSeq.current) {
        setIsEventsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [eventPage, eventSearch, timeWindow]);

  React.useEffect(() => {
    void refresh({ showLoader: true });
    const timer = window.setInterval(() => void refresh({ showLoader: false }), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  React.useEffect(() => {
    const refreshQuietly = () => void refresh({ showLoader: false, notifyOnError: false });
    const refreshWhenVisible = () => {
      if (!document.hidden) refreshQuietly();
    };

    window.addEventListener("focus", refreshQuietly);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshQuietly);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  React.useEffect(() => {
    const query = locationAddress.trim();
    if (query.length < 2 || selectedLocationSuggestion?.address === locationAddress) {
      setLocationSuggestions([]);
      setLocationSuggestionError("");
      setIsSuggestingLocation(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSuggestingLocation(true);
      setLocationSuggestionError("");
      try {
        const result = await api<{ suggestions: LocationSuggestionDTO[] }>(
          `/locations/suggest?q=${encodeURIComponent(query)}&limit=6`,
          { signal: controller.signal }
        );
        setLocationSuggestions(result.suggestions);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = getErrorMessage(err, "Suggestions unavailable");
        setLocationSuggestions([]);
        setLocationSuggestionError(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsSuggestingLocation(false);
        }
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [locationAddress, selectedLocationSuggestion]);

  const eventPageCount = eventPagination.totalPages;
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ??
    events[0] ??
    summary?.highestMagnitudeEvent ??
    null;

  React.useEffect(() => {
    if (!events.length) {
      setSelectedEventId(null);
      return;
    }
    if (!selectedEventId || !events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  async function addLocation(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const selectedSuggestion =
      selectedLocationSuggestion?.address === locationAddress ? selectedLocationSuggestion : null;
    try {
      await api("/locations", {
        method: "POST",
        body: JSON.stringify({
          address: selectedSuggestion?.address ?? locationAddress,
          label: locationLabel || selectedSuggestion?.label || undefined,
          latitude: selectedSuggestion?.latitude,
          longitude: selectedSuggestion?.longitude
        })
      });
      setLocationAddress("");
      setLocationLabel("");
      setLocationSuggestions([]);
      setSelectedLocationSuggestion(null);
      await refresh({ showLoader: false });
      toast.success("Location added");
    } catch (err) {
      const message = notifyError(err, "Could not add location");
      setError(message);
    }
  }

  async function updateLocation(location: MonitoredLocationDTO, patch: Partial<MonitoredLocationDTO>) {
    try {
      await api(`/locations/${location.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          radiusKm: patch.radiusKm,
          magnitudeThreshold: patch.magnitudeThreshold,
          alertsEnabled: patch.alertsEnabled
        })
      });
      await refresh({ showLoader: false });
      toast.success("Settings saved");
    } catch (err) {
      notifyError(err, "Could not save alert settings");
      throw err;
    }
  }

  async function deleteLocation(location: MonitoredLocationDTO) {
    try {
      await api(`/locations/${location.id}`, { method: "DELETE" });
      await refresh({ showLoader: false });
      toast.success("Location removed");
    } catch (err) {
      notifyError(err, "Could not remove location");
    }
  }

  async function disconnectTelegram() {
    try {
      await api("/telegram/disconnect", { method: "POST" });
      await refresh({ showLoader: false });
      toast.success("Telegram disconnected");
    } catch (err) {
      notifyError(err, "Could not disconnect Telegram");
    }
  }

  async function connectTelegram() {
    if (isTelegramConnecting) return;
    setIsTelegramConnecting(true);
    try {
      const result = await api<TelegramConnectResult>("/telegram/connect-token", { method: "POST" });
      if (result.connected) {
        await refresh({ showLoader: false });
        toast.success("Telegram reconnected");
        return;
      }

      const openMode = openTelegramConnectUrl(result.url);
      if (openMode === "new-tab") {
        toast.success("Telegram link opened");
      }
    } catch (err) {
      notifyError(err, "Could not start Telegram connection");
    } finally {
      setIsTelegramConnecting(false);
    }
  }

  function scrollToTelegramPanel() {
    telegramPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const name = user?.name?.split(" ")[0] ?? "there";
  const displayedEventStart = eventPagination.total === 0 ? 0 : (eventPagination.page - 1) * eventPagination.pageSize + 1;
  const displayedEventEnd = Math.min(eventPagination.page * eventPagination.pageSize, eventPagination.total);

  function changeTimeWindow(item: TimeWindow) {
    if (item === timeWindow) return;
    setSelectedEventId(null);
    setEventPage(1);
    setTimeWindow(item);
  }

  async function handleLogout() {
    try {
      await logout();
      toast.success("Signed out");
    } catch (err) {
      notifyError(err, "Could not sign out");
    }
  }

  function updateEventSearch(value: string) {
    setSelectedEventId(null);
    setEventPage(1);
    setEventSearch(value);
  }

  const metrics = [
    { label: `Events (${timeWindow})`, value: summary?.total ?? "-", tone: "default" as const },
    { label: `M >= 4 (${timeWindow})`, value: summary?.m4Plus ?? "-", tone: "warn" as const },
    { label: `M >= 5 (${timeWindow})`, value: summary?.m5Plus ?? "-", tone: "danger" as const },
    {
      label: "System now",
      value: health?.status ?? "-",
      tone: health?.status === "healthy" ? ("good" as const) : health?.status === "down" ? ("danger" as const) : ("warn" as const)
    }
  ];

  return (
    <main className="dashboard-shell min-h-screen text-slate-950">
      <div className="min-h-screen lg:grid lg:grid-cols-[88px_minmax(0,1fr)]">
        <DashboardNav isAdmin={user?.role === "admin"} />

        <div className="min-w-0 px-3 py-3 sm:px-5 lg:px-6 lg:py-6">
          <div className="mx-auto max-w-[1660px]">
            <TopBar
              userName={user?.name ?? "Kansha user"}
              isAdmin={user?.role === "admin"}
              lastRefresh={lastRefresh}
              eventSearch={eventSearch}
              setEventSearch={updateEventSearch}
              onRefresh={() => refresh({ showLoader: false, notifySuccess: true })}
              onLogout={handleLogout}
              isRefreshing={isRefreshing}
            />

            {telegram && !telegram.connected && (
              <TelegramConnectBanner
                canReconnect={telegram.canReconnect}
                isConnecting={isTelegramConnecting}
                onConnect={connectTelegram}
                onOpenTelegramPanel={scrollToTelegramPanel}
              />
            )}

            {error && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 shadow-sm">
                {error}
              </div>
            )}

            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="mt-5 space-y-5"
            >
              <section className="dashboard-hero">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-500">Earthquake operations</p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">Operations</h1>
                  <p className="mt-1 text-sm font-medium text-slate-500">Hello {name}, welcome back.</p>
                </div>
                <WindowScope timeWindow={timeWindow} lastRefresh={lastRefresh} />
              </section>

              <div className="relative space-y-5">
                <MetricStrip metrics={metrics} />

                <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.78fr)]">
                <div className="dashboard-panel relative min-w-0 overflow-hidden">
                  <div className="flex flex-col gap-4 border-b border-slate-100/90 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      <div className="rounded-2xl bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 sm:px-4">
                        Time window
                      </div>
                      <div className="flex rounded-2xl bg-slate-100/80 p-1">
                        {(["1h", "24h", "7d", "30d"] as TimeWindow[]).map((item) => (
                          <button
                            key={item}
                            onClick={() => changeTimeWindow(item)}
                            className={cn(
                              "inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-all sm:px-4",
                              timeWindow === item
                                ? "bg-white text-indigo-700 shadow-sm shadow-slate-200"
                                : "text-slate-500 hover:text-slate-900"
                            )}
                          >
                            {item}
                            {timeWindow === item && isEventsLoading && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="hidden items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 sm:flex">
                      <CircleDot className="h-4 w-4" />
                      {eventPagination.total.toLocaleString()} events in {timeWindow}
                    </div>
                  </div>

                  <EventTable
                    events={events}
                    selectedEventId={selectedEvent?.id ?? null}
                    onSelect={(event) => setSelectedEventId(event.id)}
                  />

                  <Pagination
                    page={eventPagination.page}
                    pageCount={eventPageCount}
                    total={eventPagination.total}
                    pageSize={eventPageSize}
                    onPageChange={setEventPage}
                  />
                </div>

                <div className="space-y-5">
                  <section className="dashboard-panel relative overflow-hidden p-3 sm:p-4">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-950">Live event map</h2>
                        <p className="text-sm text-slate-500">Current page of global activity with selected event context.</p>
                      </div>
                    </div>
                    <div className="relative overflow-hidden rounded-[28px] bg-slate-100">
                      <GlobalMap
                        events={events}
                        selectedEventId={selectedEvent?.id}
                        onEventSelect={(event) => setSelectedEventId(event.id)}
                        className="h-[420px] min-h-[420px] rounded-[28px] sm:h-[520px] xl:h-[610px]"
                      />
                      {selectedEvent && <SelectedEventCard event={selectedEvent} />}
                    </div>
                  </section>

                  <section className="grid gap-4 sm:grid-cols-2">
                    <SystemHealth health={health} />
                    <div ref={telegramPanelRef} className="scroll-mt-24">
                      <TelegramPanel
                        telegram={telegram}
                        isConnecting={isTelegramConnecting}
                        onConnect={connectTelegram}
                        onDisconnect={disconnectTelegram}
                      />
                    </div>
                  </section>
                </div>
                </section>

                <LoadingOverlay
                  active={isEventsLoading}
                  label={
                    eventPagination.total > 0
                      ? `Updating ${timeWindow} data: events ${displayedEventStart}-${displayedEventEnd} of ${eventPagination.total.toLocaleString()}`
                      : `Updating ${timeWindow} data`
                  }
                />
              </div>

              <section className="dashboard-panel p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Monitored locations</h2>
                    <p className="mt-1 text-sm text-slate-500">Add up to 3 places. Defaults monitor M &gt;= 4.0 within 500 km.</p>
                  </div>
                  <Badge tone="blue" className="w-fit bg-indigo-50 text-indigo-700 ring-indigo-100">
                    {locations.length}/3 locations
                  </Badge>
                </div>
                <form onSubmit={addLocation} className="mt-4 grid items-start gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(14rem,0.85fr)_auto]">
                  <LocationSuggestInput
                    value={locationAddress}
                    suggestions={locationSuggestions}
                    isLoading={isSuggestingLocation}
                    error={locationSuggestionError}
                    disabled={locations.length >= 3}
                    onChange={(value) => {
                      setLocationAddress(value);
                      setSelectedLocationSuggestion(null);
                    }}
                    onSelect={(suggestion) => {
                      setLocationAddress(suggestion.address);
                      setSelectedLocationSuggestion(suggestion);
                      setLocationSuggestions([]);
                      if (!locationLabel.trim()) {
                        setLocationLabel(suggestion.label);
                      }
                    }}
                  />
                  <Input
                    placeholder="Label, optional"
                    value={locationLabel}
                    onChange={(event) => setLocationLabel(event.target.value)}
                    disabled={locations.length >= 3}
                    className="h-11 rounded-2xl border-0 bg-slate-50 ring-1 ring-slate-200/80 focus:ring-indigo-100"
                  />
                  <Button disabled={locations.length >= 3 || !locationAddress.trim()} className="h-11 whitespace-nowrap rounded-2xl bg-indigo-600 px-5 hover:bg-indigo-700">
                    <MapPin className="h-4 w-4" />
                    Add location
                  </Button>
                </form>

                <div className="mt-5 grid gap-4 xl:grid-cols-3">
                  {locationStats.map((stat) => (
                    <LocationCard
                      key={stat.location.id}
                      stat={stat}
                      onUpdate={updateLocation}
                      onDelete={deleteLocation}
                    />
                  ))}
                </div>
              </section>
            </motion.section>
          </div>
        </div>
      </div>
      <AgentWidget />
    </main>
  );
}

function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const items = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", active: true },
    ...(isAdmin ? [{ label: "Admin", icon: ShieldCheck, href: "/admin" }] : [])
  ];

  return (
    <aside className="sticky top-0 z-20 flex border-b border-slate-200/70 bg-white/85 px-3 py-2 backdrop-blur-xl lg:min-h-screen lg:flex-col lg:items-center lg:border-b-0 lg:border-r lg:px-0 lg:py-6">
      <a href="/dashboard" className="mr-3 grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-sm font-black text-white shadow-xl shadow-indigo-200 lg:mr-0">
        KC
      </a>
      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:mt-8 lg:flex-none lg:flex-col lg:overflow-visible">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.label}
              href={item.href}
              aria-label={item.label}
              title={item.label}
              className={cn(
                "grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-slate-500 transition-all hover:bg-indigo-50 hover:text-indigo-700",
                item.active && "bg-indigo-600 text-white shadow-xl shadow-indigo-200 hover:bg-indigo-600 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5" />
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

function TopBar({
  userName,
  isAdmin,
  lastRefresh,
  eventSearch,
  setEventSearch,
  onRefresh,
  onLogout,
  isRefreshing
}: {
  userName: string;
  isAdmin: boolean;
  lastRefresh: Date | null;
  eventSearch: string;
  setEventSearch: (value: string) => void;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
  isRefreshing: boolean;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="group relative flex min-h-12 flex-1 items-center rounded-[24px] bg-white px-4 shadow-[0_18px_45px_rgba(79,70,229,0.08)] ring-1 ring-slate-200/70 sm:max-w-3xl">
        <span className="sr-only">Search events</span>
        <input
          value={eventSearch}
          onChange={(event) => setEventSearch(event.target.value)}
          placeholder="Search"
          className="h-12 min-w-0 flex-1 bg-transparent pr-10 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
        />
        <Search className="absolute right-4 h-5 w-5 text-slate-500 transition-colors group-focus-within:text-indigo-600" />
      </label>

      <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end">
        {isAdmin && (
          <Button asChild variant="secondary" size="sm" className="h-11 rounded-2xl border-0 bg-white px-4 shadow-sm ring-1 ring-slate-200/70">
            <a href="/admin">Admin</a>
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void onRefresh()}
          className="h-11 rounded-2xl border-0 bg-white px-3 shadow-sm ring-1 ring-slate-200/70"
          title={lastRefresh ? `Last refresh ${lastRefresh.toLocaleTimeString()}` : "Refresh dashboard"}
        >
          <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        <div className="flex min-w-0 items-center gap-2 rounded-[24px] bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-200/70">
          <div className="hidden min-w-0 pl-2 text-right sm:block">
            <p className="truncate text-sm font-semibold text-slate-900">{userName}</p>
            <p className="text-xs font-medium text-slate-400">{isAdmin ? "Admin" : "User"}</p>
          </div>
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-950 text-white">
            <UserRound className="h-5 w-5" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => void onLogout()} className="h-9 w-9 rounded-xl px-0" title="Logout">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function WindowScope({ timeWindow, lastRefresh }: { timeWindow: TimeWindow; lastRefresh: Date | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[22px] bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200/70">
      <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">Window: {timeWindow}</span>
      <span className="text-slate-500">Metrics, list, and map use this window</span>
      {lastRefresh && <span className="text-slate-400">Updated {formatTime(lastRefresh.toISOString())}</span>}
    </div>
  );
}

function EventTable({
  events,
  selectedEventId,
  onSelect
}: {
  events: EarthquakeEventDTO[];
  selectedEventId: string | null;
  onSelect: (event: EarthquakeEventDTO) => void;
}) {
  if (events.length === 0) {
    return <div className="px-4 py-10 text-center text-sm font-medium text-slate-500">No events match the current filters.</div>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto px-3 py-2 md:block">
        <table className="w-full min-w-[560px] border-separate border-spacing-y-2 text-left text-sm">
          <thead className="text-xs font-semibold text-slate-400">
            <tr>
              <SortableHeader label="Event" />
              <SortableHeader label="Magnitude" />
              <SortableHeader label="Depth" />
              <SortableHeader label="Alert" />
              <SortableHeader label="Time" />
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const selected = event.id === selectedEventId;
              return (
                <tr
                  key={event.id}
                  onClick={() => onSelect(event)}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                      keyEvent.preventDefault();
                      onSelect(event);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Show ${extractRegion(event.place)} on map`}
                  className={cn("group cursor-pointer transition-all", selected && "text-white")}
                >
                  <td className={cn(rowClassName(selected), "rounded-l-2xl pl-4")}>
                    <div className="max-w-[260px]">
                      <p className="truncate font-semibold">{extractRegion(event.place)}</p>
                      <p className={cn("mt-0.5 truncate text-xs", selected ? "text-indigo-100" : "text-slate-400")}>{event.place}</p>
                    </div>
                  </td>
                  <td className={rowClassName(selected)}>
                    <MagnitudeBadge event={event} selected={selected} />
                  </td>
                  <td className={rowClassName(selected)}>{event.depthKm ?? "?"} km</td>
                  <td className={rowClassName(selected)}>
                    <AlertBadge alert={event.alert} selected={selected} />
                  </td>
                  <td className={cn(rowClassName(selected), "rounded-r-2xl pr-4")}>
                    <div className="font-medium">{formatShortDate(event.time)}</div>
                    <div className={cn("text-xs", selected ? "text-indigo-100" : "text-slate-400")}>{formatTime(event.time)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-3 md:hidden">
        {events.map((event) => {
          const selected = event.id === selectedEventId;
          return (
            <button
              key={event.id}
              onClick={() => onSelect(event)}
              className={cn(
                "w-full rounded-2xl p-4 text-left transition-all",
                selected ? "bg-indigo-600 text-white shadow-xl shadow-indigo-200" : "bg-slate-50 text-slate-900"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{extractRegion(event.place)}</p>
                  <p className={cn("mt-1 line-clamp-2 text-sm", selected ? "text-indigo-100" : "text-slate-500")}>{event.place}</p>
                </div>
                <MagnitudeBadge event={event} selected={selected} />
              </div>
              <div className={cn("mt-4 grid grid-cols-3 gap-2 text-xs font-semibold", selected ? "text-indigo-100" : "text-slate-500")}>
                <span>{formatShortDate(event.time)}</span>
                <span>{event.depthKm ?? "?"} km</span>
                <span>{event.tsunami ? "Tsunami" : "No tsunami"}</span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function SortableHeader({ label, className }: { label: string; className?: string }) {
  return (
    <th className={cn("px-3 py-2", className)}>
      <span className="inline-flex items-center whitespace-nowrap">{label}</span>
    </th>
  );
}

function rowClassName(selected: boolean) {
  return cn(
    "bg-slate-50/80 px-3 py-3.5 font-medium transition-all group-hover:bg-indigo-50/80",
    selected && "bg-indigo-600 group-hover:bg-indigo-600"
  );
}

function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 text-sm font-medium text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing {start}-{end} of {total} events
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="h-9 rounded-xl border-0 bg-slate-50 px-3 shadow-none ring-1 ring-slate-200/70"
          aria-label="Previous events page"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-20 text-center text-slate-700">
          {page} / {pageCount}
        </span>
        <Button
          variant="secondary"
          size="sm"
          className="h-9 rounded-xl border-0 bg-slate-50 px-3 shadow-none ring-1 ring-slate-200/70"
          aria-label="Next events page"
          disabled={page >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function LoadingOverlay({ active, label }: { active: boolean; label: string }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: active ? 1 : 0, pointerEvents: active ? "auto" : "none" }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 z-[500] flex items-start justify-center bg-white/72 pt-[clamp(5.5rem,14vh,10rem)] backdrop-blur-[3px]"
      aria-hidden={!active}
    >
      <motion.div
        initial={false}
        animate={{ y: active ? 0 : 8, scale: active ? 1 : 0.98 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-xl shadow-indigo-950/10 ring-1 ring-slate-200/80"
      >
        <span className="relative grid h-7 w-7 place-items-center rounded-full bg-indigo-50 text-indigo-600">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          <span className="absolute inset-0 rounded-full border border-indigo-100" />
        </span>
        <span>{label}</span>
      </motion.div>
    </motion.div>
  );
}

function TelegramConnectBanner({
  canReconnect,
  isConnecting,
  onConnect,
  onOpenTelegramPanel
}: {
  canReconnect: boolean;
  isConnecting: boolean;
  onConnect: () => Promise<void>;
  onOpenTelegramPanel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="mt-4 flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-white/92 px-4 py-3 shadow-lg shadow-indigo-950/5 backdrop-blur sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Send className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{canReconnect ? "Reconnect Telegram to get alerts." : "Enable Telegram to get alerts."}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            {canReconnect
              ? "Your previous Telegram chat is saved. Reconnect to resume alerts."
              : "Connect Telegram to receive live earthquake updates and local alert notifications."}
          </p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={canReconnect ? () => void onConnect() : onOpenTelegramPanel}
        disabled={canReconnect && isConnecting}
        className="h-9 rounded-xl bg-indigo-600 px-4 hover:bg-indigo-700 sm:shrink-0"
      >
        {canReconnect ? (isConnecting ? "Reconnecting" : "Reconnect") : "Go to Telegram"}
      </Button>
    </motion.div>
  );
}

function SelectedEventCard({ event }: { event: EarthquakeEventDTO }) {
  return (
    <motion.div
      key={event.id}
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28 }}
      className="absolute bottom-4 left-4 right-4 z-[450] max-w-[420px] rounded-[24px] bg-white/95 p-4 shadow-2xl shadow-indigo-950/15 ring-1 ring-slate-200/80 backdrop-blur md:left-auto md:right-5 md:w-[390px]"
    >
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-lg font-bold text-white">
          M{event.magnitude?.toFixed(1) ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-slate-950">{extractRegion(event.place)}</h3>
            <AlertBadge alert={event.alert} />
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{event.place}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-semibold text-slate-500">
            <span>Depth {event.depthKm ?? "?"} km</span>
            <span>Sig {event.significance ?? "-"}</span>
            <span>{formatShortDate(event.time)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SystemHealth({ health }: { health: HealthDTO | null }) {
  const lastPollLabel = health?.lastSuccessfulPollAt ? formatCompactDateTime(health.lastSuccessfulPollAt) : "Never";
  const lastPollAge = health?.lastSuccessfulPollAt ? formatRelativeAge(health.lastSuccessfulPollAt) : null;

  return (
    <section className="dashboard-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">System health</h2>
          <p className="text-sm text-slate-500">Ingestion freshness</p>
        </div>
        <div className={cn("grid h-10 w-10 place-items-center rounded-2xl", health?.status === "healthy" ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600")}>
          <Gauge className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 space-y-3 text-sm">
        {health ? (
          <>
            <InfoLine label="Backfill" value={health.backfillStatus} />
            <InfoLine
              label="Last poll"
              value={
                <span className="flex flex-col items-end leading-tight">
                  <span>{lastPollLabel}</span>
                  {lastPollAge && <span className="mt-1 text-xs font-semibold text-slate-400">{lastPollAge}</span>}
                </span>
              }
            />
            <InfoLine label="Success rate" value={`${health.successRateLastHour}%`} />
            <InfoLine label="Failures" value={health.currentFailures} />
            <InfoLine label="Inserted" value={health.totalInserted} />
            {health.isSourceSilent && (
              <div className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">USGS feed silence detected.</div>
            )}
          </>
        ) : (
          <p className="text-slate-500">Waiting for health data...</p>
        )}
      </div>
    </section>
  );
}

function TelegramPanel({
  telegram,
  isConnecting,
  onConnect,
  onDisconnect
}: {
  telegram: TelegramStatus | null;
  isConnecting: boolean;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  const chatName = telegram?.chat?.username ? `@${telegram.chat.username}` : telegram?.chat?.firstName ?? null;
  const statusText = telegram?.connected
    ? chatName ?? "Connected"
    : telegram?.canReconnect
      ? chatName
        ? `Previously linked as ${chatName}`
        : "Previous Telegram chat saved."
      : "Open a one-time link from here.";
  const connectLabel = telegram?.connected ? "Connected" : telegram?.canReconnect ? "Reconnect" : "Connect";

  return (
    <section className="dashboard-panel p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Send className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-950">Telegram alerts</h2>
          <p className="truncate text-sm text-slate-500">{statusText}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void onConnect()} disabled={telegram?.connected || isConnecting} className="rounded-2xl bg-indigo-600 hover:bg-indigo-700">
          {isConnecting ? "Connecting..." : connectLabel}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void onDisconnect()}
          disabled={!telegram?.connected}
          className="rounded-2xl border-0 bg-slate-50 shadow-none ring-1 ring-slate-200/80"
        >
          Disconnect
        </Button>
      </div>
    </section>
  );
}

function InfoLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 text-right font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function LocationSuggestInput({
  value,
  suggestions,
  isLoading,
  error,
  disabled,
  onChange,
  onSelect
}: {
  value: string;
  suggestions: LocationSuggestionDTO[];
  isLoading: boolean;
  error: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSelect: (suggestion: LocationSuggestionDTO) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [popoverBox, setPopoverBox] = React.useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const hasQuery = value.trim().length >= 2;
  const showPanel = open && hasQuery && (isLoading || suggestions.length > 0 || Boolean(error));

  const updatePopoverBox = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const gutter = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(rect.width, 720, viewportWidth - gutter * 2);
    const left = Math.min(Math.max(rect.left, gutter), viewportWidth - width - gutter);
    const top = rect.bottom + 8;
    const availableBelow = Math.max(168, viewportHeight - top - gutter);

    setPopoverBox({
      top,
      left,
      width,
      maxHeight: Math.min(336, availableBelow)
    });
  }, []);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [suggestions]);

  React.useLayoutEffect(() => {
    if (!showPanel) {
      setPopoverBox(null);
      return;
    }

    updatePopoverBox();
    window.addEventListener("resize", updatePopoverBox);
    window.addEventListener("scroll", updatePopoverBox, true);
    return () => {
      window.removeEventListener("resize", updatePopoverBox);
      window.removeEventListener("scroll", updatePopoverBox, true);
    };
  }, [showPanel, updatePopoverBox]);

  function chooseSuggestion(suggestion: LocationSuggestionDTO) {
    onSelect(suggestion);
    setOpen(false);
  }

  const panel =
    showPanel && popoverBox
      ? createPortal(
          <motion.div
            id="location-suggestions"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            style={{
              position: "fixed",
              top: popoverBox.top,
              left: popoverBox.left,
              width: popoverBox.width,
              maxHeight: popoverBox.maxHeight,
              zIndex: 10000
            }}
            className="overflow-hidden rounded-[22px] bg-white p-2 shadow-2xl shadow-indigo-950/16 ring-1 ring-slate-200/90"
          >
            {isLoading ? (
              <div className="flex items-center gap-3 px-3 py-3 text-sm font-semibold text-slate-600">
                <LoaderCircle className="h-4 w-4 animate-spin text-indigo-600" />
                Finding places
              </div>
            ) : error ? (
              <div className="px-3 py-3 text-sm text-slate-500">Suggestions unavailable. You can still add manually.</div>
            ) : (
              <div className="overflow-y-auto pr-1" style={{ maxHeight: popoverBox.maxHeight - 16 }}>
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.id}
                    id={`location-suggestion-${suggestion.id}`}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      chooseSuggestion(suggestion);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-[18px] px-3 py-3 text-left transition",
                      activeIndex === index ? "bg-indigo-50 text-indigo-950" : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-2xl bg-white text-indigo-600 ring-1 ring-indigo-100">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{suggestion.label}</span>
                      <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-slate-500">{suggestion.address}</span>
                      {(suggestion.city || suggestion.region || suggestion.country) && (
                        <span className="mt-1 block truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          {[suggestion.city, suggestion.region, suggestion.country].filter(Boolean).join(" / ")}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>,
          document.body
        )
      : null;

  return (
    <div className="min-w-0">
      <div ref={anchorRef} className="relative">
        <Input
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="location-suggestions"
          aria-activedescendant={showPanel && suggestions[activeIndex] ? `location-suggestion-${suggestions[activeIndex].id}` : undefined}
          autoComplete="off"
          placeholder="Search city or address"
          value={value}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && suggestions.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => (index + 1) % suggestions.length);
            }
            if (event.key === "ArrowUp" && suggestions.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
            }
            if (event.key === "Enter" && showPanel && suggestions[activeIndex]) {
              event.preventDefault();
              chooseSuggestion(suggestions[activeIndex]);
            }
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          required
          className="h-11 min-w-0 rounded-2xl border-0 bg-slate-50 pl-10 ring-1 ring-slate-200/80 focus:ring-indigo-100"
        />
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
      {panel}
    </div>
  );
}

function LocationCard({
  stat,
  onUpdate,
  onDelete
}: {
  stat: LocationStatsDTO;
  onUpdate: (location: MonitoredLocationDTO, patch: Partial<MonitoredLocationDTO>) => Promise<void>;
  onDelete: (location: MonitoredLocationDTO) => Promise<void>;
}) {
  const [radiusKm, setRadiusKm] = React.useState(stat.location.radiusKm);
  const [magnitudeThreshold, setMagnitudeThreshold] = React.useState(stat.location.magnitudeThreshold);
  const [alertsEnabled, setAlertsEnabled] = React.useState(stat.location.alertsEnabled);
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");

  React.useEffect(() => {
    setRadiusKm(stat.location.radiusKm);
    setMagnitudeThreshold(stat.location.magnitudeThreshold);
    setAlertsEnabled(stat.location.alertsEnabled);
    setEditing(false);
    setSaveError("");
  }, [stat.location]);

  async function save() {
    const nextRadius = Math.round(radiusKm);
    const nextMagnitude = Number(magnitudeThreshold.toFixed(1));
    if (!Number.isFinite(nextRadius) || nextRadius < 10 || nextRadius > 3000) {
      const message = "Radius must be between 10 and 3000 km.";
      setSaveError(message);
      toast.error("Check radius");
      return;
    }
    if (!Number.isFinite(nextMagnitude) || nextMagnitude < 0 || nextMagnitude > 10) {
      const message = "Magnitude threshold must be between 0 and 10.";
      setSaveError(message);
      toast.error("Check magnitude");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      await onUpdate(stat.location, {
        radiusKm: nextRadius,
        magnitudeThreshold: nextMagnitude,
        alertsEnabled
      });
      setEditing(false);
    } catch (err) {
      setSaveError(getErrorMessage(err, "Could not save alert settings"));
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    setRadiusKm(stat.location.radiusKm);
    setMagnitudeThreshold(stat.location.magnitudeThreshold);
    setAlertsEnabled(stat.location.alertsEnabled);
    setSaveError("");
    setEditing(false);
  }

  return (
    <section className="rounded-[24px] bg-slate-50/85 p-4 ring-1 ring-slate-200/70 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-xl hover:shadow-indigo-950/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-950">{stat.location.label}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{stat.location.address}</p>
        </div>
        <Badge tone={riskTone(stat.riskLabel)} className={riskBadgeClass(stat.riskLabel)}>
          {stat.riskLabel} {stat.riskScore}
        </Badge>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
        <SmallStat label="24h" value={stat.counts.last24h} />
        <SmallStat label="7d" value={stat.counts.last7d} />
        <SmallStat label="30d" value={stat.counts.last30d} />
      </div>
      <div className="mt-4 overflow-hidden rounded-[22px]">
        <LocationMap location={stat.location} events={stat.nearbyEvents} />
      </div>

      <div className="mt-4 rounded-[22px] bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
        {editing ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberControl
                label="Radius"
                suffix="km"
                value={radiusKm}
                min={10}
                max={3000}
                step={50}
                onChange={setRadiusKm}
              />
              <NumberControl
                label="Magnitude threshold"
                prefix="M"
                value={magnitudeThreshold}
                min={0}
                max={10}
                step={0.1}
                decimals={1}
                onChange={setMagnitudeThreshold}
              />
            </div>
            <SwitchControl
              label="Telegram local alerts"
              description={alertsEnabled ? "Local alerts can be sent for this location." : "Local alerts are paused for this location."}
              checked={alertsEnabled}
              onChange={setAlertsEnabled}
            />
            <p className="rounded-2xl bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700">
              Draft rule: {alertsEnabled ? `M >= ${magnitudeThreshold.toFixed(1)} within ${Math.round(radiusKm)} km.` : "Alerts disabled."}
            </p>
            {saveError && <p className="text-sm font-semibold text-rose-600">{saveError}</p>}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            <SettingStat label="Radius" value={`${stat.location.radiusKm} km`} />
            <SettingStat label="Threshold" value={`M >= ${stat.location.magnitudeThreshold}`} />
            <SettingStat label="Local alerts" value={stat.location.alertsEnabled ? "Enabled" : "Paused"} active={stat.location.alertsEnabled} />
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {stat.location.alertsEnabled
            ? `Next Telegram local alert: M >= ${stat.location.magnitudeThreshold} within ${stat.location.radiusKm} km.`
            : "Telegram local alerts are paused for this location."}
        </p>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => cancelEditing()}
                disabled={saving}
                className="rounded-xl border-0 bg-slate-50 shadow-none ring-1 ring-slate-200/80"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={saving} className="rounded-xl bg-indigo-600 hover:bg-indigo-700">
                <Check className="h-4 w-4" />
                {saving ? "Saving" : "Save"}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditing(true)}
              className="rounded-xl border-0 bg-indigo-50 text-indigo-700 shadow-none ring-1 ring-indigo-100 hover:bg-indigo-100"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void onDelete(stat.location)} className="rounded-xl">
            Remove
          </Button>
        </div>
      </div>
    </section>
  );
}

function SettingStat({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3 ring-1 ring-slate-200/70">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className={cn("mt-1 text-sm font-bold text-slate-800", active && "text-indigo-700")}>{value}</p>
    </div>
  );
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  decimals = 0,
  prefix,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  function clamp(next: number) {
    if (!Number.isFinite(next)) return min;
    const normalized = decimals > 0 ? Number(next.toFixed(decimals)) : Math.round(next);
    return Math.min(max, Math.max(min, normalized));
  }

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <div className="grid h-11 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200/80 focus-within:ring-2 focus-within:ring-indigo-100">
        <button
          type="button"
          className="grid h-full place-items-center text-slate-500 transition hover:bg-white hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 items-center justify-center gap-1 border-x border-slate-200/70 px-2">
          {prefix && <span className="text-sm font-bold text-slate-400">{prefix}</span>}
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={Number.isFinite(value) ? value : ""}
            onChange={(event) => onChange(clamp(Number(event.target.value)))}
            className="min-w-0 flex-1 bg-transparent text-center text-sm font-bold text-slate-950 outline-none"
          />
          {suffix && <span className="text-sm font-bold text-slate-400">{suffix}</span>}
        </div>
        <button
          type="button"
          className="grid h-full place-items-center text-slate-500 transition hover:bg-white hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </label>
  );
}

function SwitchControl({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-left ring-1 ring-slate-200/80 transition hover:bg-indigo-50/70 hover:ring-indigo-100"
      aria-pressed={checked}
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-800">{label}</span>
        <span className="mt-0.5 block text-xs font-medium text-slate-500">{description}</span>
      </span>
      <span
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full p-1 transition",
          checked ? "bg-indigo-600" : "bg-slate-300"
        )}
      >
        <span
          className={cn(
            "block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
            checked && "translate-x-5"
          )}
        />
      </span>
    </button>
  );
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-slate-200/70">
      <div className="text-lg font-semibold text-slate-950">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function MagnitudeBadge({ event, selected = false }: { event: EarthquakeEventDTO; selected?: boolean }) {
  const mag = event.magnitude ?? 0;
  return (
    <span
      className={cn(
        "inline-flex min-w-16 justify-center rounded-xl px-2.5 py-1 text-sm font-bold ring-1",
        selected
          ? "bg-white/15 text-white ring-white/40"
          : mag >= 5
            ? "bg-rose-50 text-rose-600 ring-rose-100"
            : mag >= 4
              ? "bg-amber-50 text-amber-600 ring-amber-100"
              : "bg-indigo-50 text-indigo-600 ring-indigo-100"
      )}
    >
      M{event.magnitude?.toFixed(1) ?? "?"}
    </span>
  );
}

function AlertBadge({ alert, selected = false }: { alert: string | null; selected?: boolean }) {
  const value = alert ?? "none";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1",
        selected
          ? "bg-white/15 text-white ring-white/30"
          : value === "red"
            ? "bg-red-50 text-red-700 ring-red-100"
            : value === "orange"
              ? "bg-orange-50 text-orange-700 ring-orange-100"
              : value === "yellow"
                ? "bg-amber-50 text-amber-700 ring-amber-100"
                : "bg-slate-100 text-slate-500 ring-slate-200"
      )}
    >
      {value}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1",
        severity === "critical"
          ? "bg-red-50 text-red-700 ring-red-100"
          : severity === "high"
            ? "bg-rose-50 text-rose-700 ring-rose-100"
            : severity === "medium"
              ? "bg-amber-50 text-amber-700 ring-amber-100"
              : "bg-indigo-50 text-indigo-700 ring-indigo-100"
      )}
    >
      {severity}
    </span>
  );
}

function riskTone(label: LocationStatsDTO["riskLabel"]) {
  return label === "High" ? "red" : label === "Elevated" ? "orange" : label === "Watch" ? "yellow" : "blue";
}

function riskBadgeClass(label: LocationStatsDTO["riskLabel"]) {
  return cn(label === "Low" && "bg-indigo-50 text-indigo-700 ring-indigo-100");
}

function formatAlertType(value: string) {
  return value.replaceAll("_", " ");
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatCompactDateTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) {
    return `Today, ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatRelativeAge(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
