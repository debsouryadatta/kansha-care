import { eq, sql } from "drizzle-orm";
import { schema, type DbClient } from "@kansha/db";

export type ResolvedLocation =
  | {
      status: "resolved";
      source: "saved_location" | "coordinates" | "cache" | "geocoder";
      locationId: string | null;
      label: string;
      address: string;
      latitude: number;
      longitude: number;
      radiusKm: number | null;
    }
  | {
      status: "ambiguous";
      query: string;
      candidates: Array<{
        label: string;
        address: string;
        latitude: number;
        longitude: number;
      }>;
    }
  | {
      status: "not_found";
      query: string;
      reason: string;
    };

type GeocoderCandidate = {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  raw: unknown;
};

type GeoapifyResult = {
  results?: Array<{
    formatted?: string;
    address_line1?: string;
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    lat?: number;
    lon?: number;
  }>;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s.,-]/gu, "").replace(/\s+/g, " ").trim();
}

function coordinateQuery(query: string) {
  const match = query.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function savedLocationScore(query: string, label: string, address: string) {
  const q = normalize(query);
  const l = normalize(label);
  const a = normalize(address);
  if (q === l || q === a) return 100;
  if (l.includes(q)) return 88;
  if (a.includes(q)) return 76;
  if (q.includes(l) && l.length >= 3) return 72;
  return 0;
}

async function geocodeCandidates(query: string, options: { userAgent: string; geoapifyApiKey?: string | null }) {
  if (options.geoapifyApiKey) {
    const url = new URL("https://api.geoapify.com/v1/geocode/search");
    url.searchParams.set("text", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "3");
    url.searchParams.set("lang", "en");
    url.searchParams.set("apiKey", options.geoapifyApiKey);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Geocoder failed with ${response.status}`);
    const data = (await response.json()) as GeoapifyResult;
    return (data.results ?? [])
      .filter((item) => typeof item.lat === "number" && typeof item.lon === "number")
      .map((item): GeocoderCandidate => {
        const label = item.name ?? item.address_line1 ?? item.city ?? item.formatted ?? query;
        const address = item.formatted ?? [item.address_line1, item.city, item.state, item.country].filter(Boolean).join(", ");
        return {
          label,
          address: address || label,
          latitude: item.lat as number,
          longitude: item.lon as number,
          raw: item
        };
      });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "3");
  const response = await fetch(url, {
    headers: { "User-Agent": options.userAgent }
  });
  if (!response.ok) throw new Error(`Geocoder failed with ${response.status}`);
  const results = (await response.json()) as Array<{
    display_name?: string;
    name?: string;
    lat?: string;
    lon?: string;
  }>;
  return results
    .filter((item) => item.lat && item.lon)
    .map((item): GeocoderCandidate => ({
      label: item.name ?? item.display_name?.split(",")[0] ?? query,
      address: item.display_name ?? item.name ?? query,
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      raw: item
    }));
}

export async function resolveLocation(
  db: DbClient,
  input: {
    userId: string;
    query: string;
    defaultRadiusKm: number;
    userAgent: string;
    geoapifyApiKey?: string | null;
  }
): Promise<ResolvedLocation> {
  const query = input.query.trim();
  if (query.length < 2) {
    return { status: "not_found", query, reason: "Please provide a more specific location." };
  }

  const coordinates = coordinateQuery(query);
  if (coordinates) {
    return {
      status: "resolved",
      source: "coordinates",
      locationId: null,
      label: `${coordinates.latitude}, ${coordinates.longitude}`,
      address: `${coordinates.latitude}, ${coordinates.longitude}`,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      radiusKm: input.defaultRadiusKm
    };
  }

  const savedLocations = await db
    .select()
    .from(schema.monitoredLocations)
    .where(eq(schema.monitoredLocations.userId, input.userId));
  const savedMatches = savedLocations
    .map((location) => ({ location, score: savedLocationScore(query, location.label, location.address) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (savedMatches[0] && savedMatches[0].score >= 72) {
    const location = savedMatches[0].location;
    return {
      status: "resolved",
      source: "saved_location",
      locationId: location.id,
      label: location.label,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      radiusKm: location.radiusKm
    };
  }

  const [cached] = await db
    .select()
    .from(schema.geocodingCache)
    .where(sql`lower(${schema.geocodingCache.query}) = lower(${query})`)
    .limit(1);
  if (cached) {
    return {
      status: "resolved",
      source: "cache",
      locationId: null,
      label: cached.label,
      address: cached.label,
      latitude: cached.latitude,
      longitude: cached.longitude,
      radiusKm: input.defaultRadiusKm
    };
  }

  const candidates = await geocodeCandidates(query, input);
  if (candidates.length === 0) {
    return { status: "not_found", query, reason: "No geocoding result matched that location." };
  }
  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      query,
      candidates: candidates.slice(0, 3).map(({ label, address, latitude, longitude }) => ({
        label,
        address,
        latitude,
        longitude
      }))
    };
  }

  const [first] = candidates;
  await db
    .insert(schema.geocodingCache)
    .values({
      query,
      label: first.address,
      latitude: first.latitude,
      longitude: first.longitude,
      raw: first.raw
    })
    .onConflictDoNothing();

  return {
    status: "resolved",
    source: "geocoder",
    locationId: null,
    label: first.label,
    address: first.address,
    latitude: first.latitude,
    longitude: first.longitude,
    radiusKm: input.defaultRadiusKm
  };
}
