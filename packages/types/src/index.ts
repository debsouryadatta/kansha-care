import { z } from "zod";

export const timeWindowSchema = z.enum(["1h", "24h", "7d", "30d"]);
export type TimeWindow = z.infer<typeof timeWindowSchema>;

export const userRoleSchema = z.enum(["admin", "user"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const alertTypeSchema = z.enum([
  "global_high_severity",
  "local_high_severity",
  "swarm",
  "source_silence",
  "daily_summary"
]);
export type AlertType = z.infer<typeof alertTypeSchema>;

export const alertSeveritySchema = z.enum(["info", "medium", "high", "critical"]);
export type AlertSeverity = z.infer<typeof alertSeveritySchema>;

export const defaultAlertConfig = {
  globalMagnitudeThreshold: 5,
  localMagnitudeThreshold: 4,
  localRadiusKm: 500,
  swarmRadiusKm: 200,
  swarmWindowMinutes: 30,
  swarmCountThreshold: 5,
  sourceSilenceMinutes: 10,
  dailySummaryHourIst: 9
} as const;

export type Coordinates = {
  lat: number;
  lng: number;
};

export type EarthquakeEventDTO = {
  id: string;
  usgsId: string;
  magnitude: number | null;
  place: string;
  time: string;
  updated: string | null;
  latitude: number;
  longitude: number;
  depthKm: number | null;
  alert: string | null;
  significance: number | null;
  tsunami: boolean;
  felt: number | null;
  cdi: number | null;
  mmi: number | null;
  magType: string | null;
  url: string | null;
  triggeredAlert?: boolean;
};

export type PaginatedEventsDTO = {
  events: EarthquakeEventDTO[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
};

export type MonitoredLocationDTO = {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  magnitudeThreshold: number;
  alertsEnabled: boolean;
  createdAt: string;
};

export type LocationSuggestionDTO = {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  city: string | null;
  region: string | null;
  country: string | null;
  source: "geoapify" | "photon";
};

export type RiskLabel = "Low" | "Watch" | "Elevated" | "High";

export type LocationStatsDTO = {
  location: MonitoredLocationDTO;
  riskScore: number;
  riskLabel: RiskLabel;
  counts: {
    last24h: number;
    last7d: number;
    last30d: number;
  };
  largestEvent: EarthquakeEventDTO | null;
  latestEvent: EarthquakeEventDTO | null;
  nearbyEvents: Array<EarthquakeEventDTO & { distanceKm: number }>;
};

export type HealthDTO = {
  backfillStatus: "pending" | "running" | "completed" | "failed";
  status: "healthy" | "degraded" | "down";
  lastSuccessfulPollAt: string | null;
  lastFailedPollAt: string | null;
  successRateLastHour: number;
  currentFailures: number;
  isSourceSilent: boolean;
  totalInserted: number;
  totalUpdated: number;
};

export const usgsFeatureSchema = z.object({
  id: z.string(),
  type: z.string(),
  properties: z.object({
    mag: z.number().nullable().optional(),
    place: z.string().nullable().optional(),
    time: z.number(),
    updated: z.number().nullable().optional(),
    tz: z.number().nullable().optional(),
    url: z.string().nullable().optional(),
    detail: z.string().nullable().optional(),
    felt: z.number().nullable().optional(),
    cdi: z.number().nullable().optional(),
    mmi: z.number().nullable().optional(),
    alert: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    tsunami: z.number().nullable().optional(),
    sig: z.number().nullable().optional(),
    net: z.string().nullable().optional(),
    code: z.string().nullable().optional(),
    ids: z.string().nullable().optional(),
    sources: z.string().nullable().optional(),
    types: z.string().nullable().optional(),
    nst: z.number().nullable().optional(),
    dmin: z.number().nullable().optional(),
    rms: z.number().nullable().optional(),
    gap: z.number().nullable().optional(),
    magType: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    title: z.string().nullable().optional()
  }),
  geometry: z.object({
    type: z.string(),
    coordinates: z.tuple([z.number(), z.number(), z.number().nullable()])
  })
});

export const usgsFeedSchema = z.object({
  type: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  features: z.array(usgsFeatureSchema)
});

export type UsgsFeature = z.infer<typeof usgsFeatureSchema>;

const earthRadiusKm = 6371;

export function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRad(b.lat - a.lat);
  const deltaLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function normalizeUsgsFeature(feature: UsgsFeature) {
  const [longitude, latitude, depthKm] = feature.geometry.coordinates;
  return {
    usgsId: feature.id,
    magnitude: feature.properties.mag ?? null,
    place: feature.properties.place ?? "Unknown location",
    time: new Date(feature.properties.time),
    updated: feature.properties.updated ? new Date(feature.properties.updated) : null,
    longitude,
    latitude,
    depthKm: depthKm ?? null,
    alert: feature.properties.alert ?? null,
    significance: feature.properties.sig ?? null,
    tsunami: Boolean(feature.properties.tsunami),
    felt: feature.properties.felt ?? null,
    cdi: feature.properties.cdi ?? null,
    mmi: feature.properties.mmi ?? null,
    magType: feature.properties.magType ?? null,
    url: feature.properties.url ?? null,
    raw: feature
  };
}

export function timeWindowToDate(window: TimeWindow, now = new Date()): Date {
  const ms =
    window === "1h"
      ? 60 * 60 * 1000
      : window === "24h"
        ? 24 * 60 * 60 * 1000
        : window === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms);
}

export function getRiskLabel(score: number): RiskLabel {
  if (score <= 25) return "Low";
  if (score <= 50) return "Watch";
  if (score <= 75) return "Elevated";
  return "High";
}

export type RiskEventInput = {
  magnitude: number | null;
  distanceKm: number;
  time: Date;
  alert: string | null;
  significance: number | null;
};

export function calculateRiskScore(events: RiskEventInput[], radiusKm: number, now = new Date()): number {
  if (events.length === 0) return 0;

  const score = events.reduce((total, event) => {
    const magnitude = Math.max(event.magnitude ?? 0, 0);
    const magnitudeScore = Math.min((magnitude / 7) * 45, 45);
    const proximityScore = Math.max(0, 25 * (1 - event.distanceKm / Math.max(radiusKm, 1)));
    const ageHours = Math.max((now.getTime() - event.time.getTime()) / (60 * 60 * 1000), 0);
    const recencyScore = Math.max(0, 20 * (1 - ageHours / (30 * 24)));
    const significanceScore = Math.min((event.significance ?? 0) / 1000, 1) * 6;
    const alertBonus =
      event.alert === "red" ? 20 : event.alert === "orange" ? 14 : event.alert === "yellow" ? 8 : 0;
    return total + magnitudeScore + proximityScore + recencyScore + significanceScore + alertBonus;
  }, 0);

  return Math.min(Math.round(score), 100);
}

export function buildAlertDedupeKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((part) => part !== null && part !== undefined && `${part}`.length > 0)
    .map((part) => `${part}`.replaceAll(":", "_"))
    .join(":");
}

export function magnitudeBand(magnitude: number | null): "<2.5" | "2.5-4.0" | "4.0-5.0" | ">=5.0" {
  if (magnitude === null || magnitude < 2.5) return "<2.5";
  if (magnitude < 4) return "2.5-4.0";
  if (magnitude < 5) return "4.0-5.0";
  return ">=5.0";
}

export function extractRegion(place: string): string {
  const clean = place.trim();
  const commaParts = clean.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length > 1) return commaParts.at(-1) ?? clean;
  const ofIndex = clean.toLowerCase().lastIndexOf(" of ");
  if (ofIndex >= 0) return clean.slice(ofIndex + 4).trim();
  return clean;
}
