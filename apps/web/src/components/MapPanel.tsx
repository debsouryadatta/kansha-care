import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { EarthquakeEventDTO, MonitoredLocationDTO } from "@kansha/types";
import { cn } from "@kansha/ui";

function markerIcon(magnitude: number | null, active = false) {
  const level = active ? "active" : (magnitude ?? 0) >= 5 ? "high" : (magnitude ?? 0) >= 4 ? "mid" : "low";
  const size = Math.max(10, Math.min(28, 8 + (magnitude ?? 1) * 3));
  return L.divIcon({
    className: "",
    html: `<div class="quake-marker quake-marker-${level}" style="width:${active ? size + 8 : size}px;height:${active ? size + 8 : size}px"></div>`,
    iconSize: [active ? size + 8 : size, active ? size + 8 : size],
    iconAnchor: [active ? size / 2 + 4 : size / 2, active ? size / 2 + 4 : size / 2]
  });
}

const locationIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:999px;background:#4f46e5;border:3px solid white;box-shadow:0 8px 18px rgba(79,70,229,.35)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const tileAttribution = '&copy; OpenStreetMap &copy; CARTO';
const tileUrl = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

export function GlobalMap({
  events,
  selectedEventId,
  onEventSelect,
  className
}: {
  events: EarthquakeEventDTO[];
  selectedEventId?: string;
  onEventSelect?: (event: EarthquakeEventDTO) => void;
  className?: string;
}) {
  const selectedEvent = selectedEventId ? events.find((event) => event.id === selectedEventId) : null;

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      scrollWheelZoom
      zoomControl
      className={cn("h-[360px] rounded-[24px]", className)}
    >
      <TileLayer attribution={tileAttribution} url={tileUrl} />
      <FlyToSelectedEvent event={selectedEvent} />
      {events.slice(0, 120).map((event) => (
        <Marker
          key={event.id}
          position={[event.latitude, event.longitude]}
          icon={markerIcon(event.magnitude, event.id === selectedEventId)}
          eventHandlers={{
            click: () => onEventSelect?.(event)
          }}
        >
          <Popup>
            <strong>M{event.magnitude ?? "?"}</strong>
            <br />
            {event.place}
            <br />
            {new Date(event.time).toLocaleString()}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

function FlyToSelectedEvent({ event }: { event: EarthquakeEventDTO | null | undefined }) {
  const map = useMap();

  useEffect(() => {
    if (!event) return;
    map.flyTo([event.latitude, event.longitude], Math.max(map.getZoom(), 4), {
      animate: true,
      duration: 0.65
    });
  }, [event, map]);

  return null;
}

export function LocationMap({
  location,
  events
}: {
  location: MonitoredLocationDTO;
  events: Array<EarthquakeEventDTO & { distanceKm: number }>;
}) {
  return (
    <MapContainer center={[location.latitude, location.longitude]} zoom={4} scrollWheelZoom={false} zoomControl={false} className="h-64 rounded-[22px]">
      <TileLayer attribution={tileAttribution} url={tileUrl} />
      <Marker position={[location.latitude, location.longitude]} icon={locationIcon}>
        <Popup>{location.label}</Popup>
      </Marker>
      {events.slice(0, 40).map((event) => (
        <Marker key={event.id} position={[event.latitude, event.longitude]} icon={markerIcon(event.magnitude)}>
          <Popup>
            <strong>M{event.magnitude ?? "?"}</strong>
            <br />
            {event.place}
            <br />
            {event.distanceKm} km away
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
