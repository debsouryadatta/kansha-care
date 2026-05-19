import type { EarthquakeEventDTO } from "@kansha/types";

export function globalHighMessage(event: EarthquakeEventDTO, dashboardUrl: string) {
  return [
    "High severity earthquake",
    "",
    "Trigger: Magnitude >= 5.0 globally",
    "Severity: High",
    `Magnitude: ${event.magnitude ?? "unknown"}`,
    `Location: ${event.place}`,
    `Time: ${new Date(event.time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
    `Depth: ${event.depthKm ?? "unknown"} km`,
    `USGS alert: ${event.alert ?? "not set"}`,
    `Tsunami: ${event.tsunami ? "Yes" : "No"}`,
    "",
    `Dashboard: ${dashboardUrl}`,
    event.url ? `USGS: ${event.url}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function localHighMessage(event: EarthquakeEventDTO, location: string, distanceKm: number, dashboardUrl: string) {
  return [
    "Local earthquake alert",
    "",
    "Trigger: monitored location threshold matched",
    "Severity: High",
    `Monitored location: ${location}`,
    `Magnitude: ${event.magnitude ?? "unknown"}`,
    `Earthquake location: ${event.place}`,
    `Distance: ${Math.round(distanceKm)} km`,
    `Time: ${new Date(event.time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
    `Depth: ${event.depthKm ?? "unknown"} km`,
    "",
    `Dashboard: ${dashboardUrl}`,
    event.url ? `USGS: ${event.url}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function sourceSilenceMessage(minutes: number, lastSuccess: Date | null, failures: number, dashboardUrl: string) {
  return [
    "Data source silence",
    "",
    `USGS feed has not been successfully polled for ${minutes} minutes.`,
    `Last successful poll: ${lastSuccess ? lastSuccess.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "never"} IST`,
    `Recent failures: ${failures}`,
    "System status: degraded",
    "",
    `Dashboard: ${dashboardUrl}`
  ].join("\n");
}

export function swarmMessage(count: number, region: string, highestMagnitude: number | null, dashboardUrl: string) {
  return [
    "Swarm detected",
    "",
    `Trigger: ${count} earthquakes within 30 minutes inside 200 km`,
    `Region: ${region}`,
    `Highest magnitude: ${highestMagnitude ?? "unknown"}`,
    "Severity: Medium",
    "",
    `Dashboard: ${dashboardUrl}`
  ].join("\n");
}
