import type { EarthquakeEventDTO, HealthDTO, MonitoredLocationDTO } from "@kansha/types";

export function eventDto(event: any): EarthquakeEventDTO {
  return {
    id: event.id,
    usgsId: event.usgsId,
    magnitude: event.magnitude,
    place: event.place,
    time: event.time.toISOString(),
    updated: event.updated ? event.updated.toISOString() : null,
    latitude: event.latitude,
    longitude: event.longitude,
    depthKm: event.depthKm,
    alert: event.alert,
    significance: event.significance,
    tsunami: event.tsunami,
    felt: event.felt,
    cdi: event.cdi,
    mmi: event.mmi,
    magType: event.magType,
    url: event.url
  };
}

export function locationDto(location: any): MonitoredLocationDTO {
  return {
    id: location.id,
    label: location.label,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    radiusKm: location.radiusKm,
    magnitudeThreshold: location.magnitudeThreshold,
    alertsEnabled: location.alertsEnabled,
    createdAt: location.createdAt.toISOString()
  };
}

export function healthDto(input: HealthDTO): HealthDTO {
  return input;
}
