import { afterEach, describe, expect, it, vi } from "vitest";
import { schema } from "@kansha/db";
import { resolveLocation } from "../packages/agent/src/geocode";

type FakeDbOptions = {
  locations?: any[];
  cache?: any[];
};

function queryRows(rows: any[]) {
  return {
    where() {
      return this;
    },
    limit(limit: number) {
      return Promise.resolve(rows.slice(0, limit));
    },
    then(resolve: (value: any[]) => void, reject: (reason: unknown) => void) {
      return Promise.resolve(rows).then(resolve, reject);
    }
  };
}

function makeDb({ locations = [], cache = [] }: FakeDbOptions = {}) {
  const insertedCache: any[] = [];
  const db = {
    insertedCache,
    select() {
      return {
        from(table: unknown) {
          if (table === schema.monitoredLocations) return queryRows(locations);
          if (table === schema.geocodingCache) return queryRows(cache);
          return queryRows([]);
        }
      };
    },
    insert(table: unknown) {
      return {
        values(value: unknown) {
          if (table === schema.geocodingCache) insertedCache.push(value);
          return {
            onConflictDoNothing: async () => undefined
          };
        }
      };
    }
  };
  return db as any;
}

const baseInput = {
  userId: "user-1",
  defaultRadiusKm: 500,
  userAgent: "kansha-tests@example.com"
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agent resolveLocation", () => {
  it("resolves a saved monitored location before calling a geocoder", async () => {
    const db = makeDb({
      locations: [
        {
          id: "loc-1",
          label: "Delhi",
          address: "Delhi, India",
          latitude: 28.6139,
          longitude: 77.209,
          radiusKm: 700
        }
      ]
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await resolveLocation(db, { ...baseInput, query: "near Delhi" });

    expect(result).toMatchObject({
      status: "resolved",
      source: "saved_location",
      locationId: "loc-1",
      radiusKm: 700
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts coordinate input directly", async () => {
    const result = await resolveLocation(makeDb(), { ...baseInput, query: "28.6139, 77.2090" });

    expect(result).toMatchObject({
      status: "resolved",
      source: "coordinates",
      latitude: 28.6139,
      longitude: 77.209,
      radiusKm: 500
    });
  });

  it("uses the geocoding cache on a miss from saved locations", async () => {
    const result = await resolveLocation(
      makeDb({
        cache: [
          {
            label: "Kathmandu, Nepal",
            latitude: 27.7172,
            longitude: 85.324
          }
        ]
      }),
      { ...baseInput, query: "Kathmandu" }
    );

    expect(result).toMatchObject({
      status: "resolved",
      source: "cache",
      label: "Kathmandu, Nepal"
    });
  });

  it("falls back to Nominatim and caches a single geocoder result", async () => {
    const db = makeDb();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          {
            name: "Tokyo",
            display_name: "Tokyo, Japan",
            lat: "35.6762",
            lon: "139.6503"
          }
        ]
      }))
    );

    const result = await resolveLocation(db, { ...baseInput, query: "Tokyo" });

    expect(result).toMatchObject({
      status: "resolved",
      source: "geocoder",
      label: "Tokyo",
      address: "Tokyo, Japan"
    });
    expect(db.insertedCache).toHaveLength(1);
  });

  it("returns ambiguity when the geocoder has several plausible matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { name: "Springfield", display_name: "Springfield, Illinois, USA", lat: "39.78", lon: "-89.64" },
          { name: "Springfield", display_name: "Springfield, Missouri, USA", lat: "37.20", lon: "-93.29" }
        ]
      }))
    );

    const result = await resolveLocation(makeDb(), { ...baseInput, query: "Springfield" });

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0].address).toContain("Illinois");
    }
  });
});
