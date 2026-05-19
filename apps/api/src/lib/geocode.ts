import { and, eq, sql } from "drizzle-orm";
import { schema, type DbClient } from "@kansha/db";
import type { LocationSuggestionDTO } from "@kansha/types";

type GeocodeResult = {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  raw: unknown;
};

type SuggestAddressOptions = {
  geoapifyApiKey?: string;
  userAgent: string;
  limit?: number;
};

type GeoapifyAutocompleteResult = {
  results?: Array<{
    place_id?: string;
    formatted?: string;
    address_line1?: string;
    address_line2?: string;
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    lat?: number;
    lon?: number;
  }>;
};

type PhotonFeatureCollection = {
  features?: Array<{
    geometry?: {
      coordinates?: [number, number];
    };
    properties?: {
      osm_type?: string;
      osm_id?: number | string;
      name?: string;
      street?: string;
      housenumber?: string;
      city?: string;
      district?: string;
      state?: string;
      country?: string;
      countrycode?: string;
    };
  }>;
};

function cleanParts(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
}

function dedupeSuggestions(suggestions: LocationSuggestionDTO[]) {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.address.toLowerCase()}|${suggestion.latitude.toFixed(5)}|${suggestion.longitude.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function suggestAddresses(query: string, options: SuggestAddressOptions): Promise<LocationSuggestionDTO[]> {
  const trimmed = query.trim();
  const limit = Math.min(Math.max(options.limit ?? 6, 1), 8);
  if (trimmed.length < 2) return [];

  if (options.geoapifyApiKey) {
    const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
    url.searchParams.set("text", trimmed);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("lang", "en");
    url.searchParams.set("apiKey", options.geoapifyApiKey);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Address suggestions failed with ${response.status}`);
    }

    const data = (await response.json()) as GeoapifyAutocompleteResult;
    return dedupeSuggestions(
      (data.results ?? [])
        .filter((item) => typeof item.lat === "number" && typeof item.lon === "number")
        .map((item, index) => {
          const label = item.name ?? item.address_line1 ?? item.city ?? item.formatted ?? trimmed;
          const address = item.formatted ?? cleanParts([item.address_line1, item.address_line2, item.city, item.state, item.country]).join(", ");
          return {
            id: item.place_id ?? `geoapify-${index}-${item.lat}-${item.lon}`,
            label,
            address: address || label,
            latitude: item.lat as number,
            longitude: item.lon as number,
            city: item.city ?? null,
            region: item.state ?? null,
            country: item.country ?? null,
            source: "geoapify" as const
          };
        })
    );
  }

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", "en");

  const response = await fetch(url, {
    headers: {
      "User-Agent": options.userAgent
    }
  });
  if (!response.ok) {
    throw new Error(`Address suggestions failed with ${response.status}`);
  }

  const data = (await response.json()) as PhotonFeatureCollection;
  return dedupeSuggestions(
    (data.features ?? [])
      .filter((feature) => {
        const coordinates = feature.geometry?.coordinates;
        return Array.isArray(coordinates) && coordinates.length >= 2;
      })
      .map((feature, index) => {
        const [longitude, latitude] = feature.geometry?.coordinates ?? [0, 0];
        const properties = feature.properties ?? {};
        const label = cleanParts([properties.name, properties.street]).join(", ") || trimmed;
        const address =
          cleanParts([
            properties.name,
            properties.housenumber && properties.street ? `${properties.housenumber} ${properties.street}` : properties.street,
            properties.district,
            properties.city,
            properties.state,
            properties.country
          ]).join(", ") || label;
        return {
          id: cleanParts([properties.osm_type, properties.osm_id]).join("-") || `photon-${index}-${latitude}-${longitude}`,
          label,
          address,
          latitude,
          longitude,
          city: properties.city ?? properties.district ?? null,
          region: properties.state ?? null,
          country: properties.country ?? properties.countrycode ?? null,
          source: "photon" as const
        };
      })
  );
}

export async function geocodeAddress(db: DbClient, query: string, userAgent: string): Promise<GeocodeResult> {
  const trimmed = query.trim();
  const cached = await db
    .select()
    .from(schema.geocodingCache)
    .where(sql`lower(${schema.geocodingCache.query}) = lower(${trimmed})`)
    .limit(1);

  if (cached[0]) {
    return {
      label: cached[0].label,
      address: cached[0].label,
      latitude: cached[0].latitude,
      longitude: cached[0].longitude,
      raw: cached[0].raw
    };
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent
    }
  });

  if (!response.ok) {
    throw new Error(`Geocoder failed with ${response.status}`);
  }

  const results = (await response.json()) as Array<{
    display_name?: string;
    lat?: string;
    lon?: string;
  }>;
  const first = results[0];
  if (!first?.lat || !first.lon) {
    throw new Error("No geocoding result found");
  }

  const result = {
    label: first.display_name ?? trimmed,
    address: first.display_name ?? trimmed,
    latitude: Number(first.lat),
    longitude: Number(first.lon),
    raw: first
  };

  await db
    .insert(schema.geocodingCache)
    .values({
      query: trimmed,
      label: result.label,
      latitude: result.latitude,
      longitude: result.longitude,
      raw: first
    })
    .onConflictDoNothing();

  return result;
}
