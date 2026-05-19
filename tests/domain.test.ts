import { describe, expect, it } from "vitest";
import jwt, { type JwtPayload } from "jsonwebtoken";
import {
  buildAlertDedupeKey,
  calculateRiskScore,
  extractRegion,
  getRiskLabel,
  haversineDistanceKm,
  magnitudeBand,
  normalizeUsgsFeature,
  usgsFeatureSchema
} from "@kansha/types";
import { sha256 } from "../apps/api/src/lib/crypto";
import { signAuthToken } from "../apps/api/src/middleware/auth";

describe("geo and risk helpers", () => {
  it("calculates Haversine distance between Delhi and Mumbai", () => {
    const distance = haversineDistanceKm({ lat: 28.6139, lng: 77.209 }, { lat: 19.076, lng: 72.8777 });
    expect(distance).toBeGreaterThan(1100);
    expect(distance).toBeLessThan(1200);
  });

  it("scores higher risk for close, recent, high magnitude events", () => {
    const score = calculateRiskScore(
      [
        {
          magnitude: 5.2,
          distanceKm: 80,
          time: new Date(),
          alert: "yellow",
          significance: 700
        }
      ],
      500
    );
    expect(score).toBeGreaterThan(60);
    expect(getRiskLabel(score)).toMatch(/Elevated|High/);
  });

  it("builds stable dedupe keys", () => {
    expect(buildAlertDedupeKey(["local-high", "user:1", "event:2"])).toBe("local-high:user_1:event_2");
  });
});

describe("USGS normalization", () => {
  it("normalizes an earthquake feature", () => {
    const feature = usgsFeatureSchema.parse({
      id: "us123",
      type: "Feature",
      properties: {
        mag: 4.6,
        place: "10 km S of Example City",
        time: 1_700_000_000_000,
        updated: 1_700_000_100_000,
        tsunami: 0,
        sig: 326,
        alert: "green",
        magType: "mb",
        url: "https://earthquake.usgs.gov/example"
      },
      geometry: {
        type: "Point",
        coordinates: [77.2, 28.6, 12]
      }
    });

    const normalized = normalizeUsgsFeature(feature);
    expect(normalized.usgsId).toBe("us123");
    expect(normalized.latitude).toBe(28.6);
    expect(normalized.longitude).toBe(77.2);
    expect(normalized.tsunami).toBe(false);
  });

  it("groups magnitude bands and regions", () => {
    expect(magnitudeBand(1.9)).toBe("<2.5");
    expect(magnitudeBand(4.5)).toBe("4.0-5.0");
    expect(magnitudeBand(5.1)).toBe(">=5.0");
    expect(extractRegion("42 km W of Abra Pampa, Argentina")).toBe("Argentina");
  });
});

describe("token hashing", () => {
  it("hashes Telegram tokens deterministically without storing raw values", () => {
    expect(sha256("connect-token")).toBe(sha256("connect-token"));
    expect(sha256("connect-token")).not.toBe("connect-token");
  });

  it("signs auth JWTs with user claims", () => {
    const secret = "test-jwt-secret-that-is-long-enough";
    const token = signAuthToken(
      {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        role: "user"
      },
      secret
    );
    const decoded = jwt.verify(token, secret) as JwtPayload;

    expect(decoded.sub).toBe("user-1");
    expect(decoded.email).toBe("test@example.com");
    expect(decoded.role).toBe("user");
  });
});
