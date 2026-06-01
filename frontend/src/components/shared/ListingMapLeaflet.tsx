import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvent } from 'react-leaflet';
import L from 'leaflet';
import { formatTnd } from '@/lib/utils/format';

export interface MapListing {
  id: string;
  title: string;
  pricePerDay: number;
  location?: { type: string; coordinates: [number, number] } | null;
  images?: string[];
  category?: { name: string; slug: string } | null;
}

export interface ListingMapProps {
  listings: MapListing[];
  center: [number, number];
  zoom?: number;
  height?: string;
  userLocation?: [number, number];
  radiusKm?: number;
  /** Fires with the map's new center after the user pans/zooms. */
  onMoveEnd?: (center: [number, number], zoom: number) => void;
}

function makePriceIcon(price: number) {
  return L.divIcon({
    className: '',
    html: `<span style="display:inline-block;background:#3b82f6;color:#fff;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap;cursor:pointer">${formatTnd(price)}</span>`,
    iconAnchor: [0, 12],
    popupAnchor: [40, -14],
  });
}

const YOU_ARE_HERE_ICON = L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:22px;height:22px">
      <div style="position:absolute;inset:0;background:rgba(59,130,246,0.25);border-radius:50%;animation:pulse-ring 1.8s ease-out infinite"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:14px;height:14px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>
    </div>
    <style>
      @keyframes pulse-ring{0%{transform:scale(1);opacity:.8}100%{transform:scale(2.8);opacity:0}}
    </style>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -14],
});

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(container);
    map.invalidateSize();
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function MapFlyTo({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    const [lat, lng] = center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    map.setView(center, map.getZoom(), { animate: false });
  // only re-fly when the coords actually change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1]]);
  return null;
}

function MoveListener({ onMoveEnd }: { onMoveEnd: (c: [number, number], z: number) => void }) {
  useMapEvent('moveend', (e) => {
    const c = e.target.getCenter();
    onMoveEnd([c.lat, c.lng], e.target.getZoom());
  });
  return null;
}

export default function ListingMapLeaflet({
  listings,
  center,
  zoom = 12,
  height = '400px',
  userLocation,
  radiusKm,
  onMoveEnd,
}: ListingMapProps) {
  const valid = listings.filter(
    (l) =>
      Array.isArray(l.location?.coordinates) &&
      l.location!.coordinates.length === 2,
  );

  const flyTarget = userLocation ?? center;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom
      style={{ height, width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <InvalidateSize />
      {/* Fly to user location once it resolves */}
      <MapFlyTo center={flyTarget} />

      {/* Pan/zoom listener for "Search this area" */}
      {onMoveEnd && <MoveListener onMoveEnd={onMoveEnd} />}

      {/* Radius circle */}
      {userLocation && radiusKm && (
        <Circle
          center={userLocation}
          radius={radiusKm * 1000}
          pathOptions={{
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.06,
            weight: 2,
            dashArray: '10 6',
          }}
        />
      )}

      {/* "You are here" dot */}
      {userLocation && (
        <Marker position={userLocation} icon={YOU_ARE_HERE_ICON} zIndexOffset={1000}>
          <Popup>
            <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>You are here</p>
          </Popup>
        </Marker>
      )}

      {/* Listing price markers */}
      {valid.map((l) => {
        const [lng, lat] = l.location!.coordinates;
        return (
          <Marker key={l.id} position={[lat, lng]} icon={makePriceIcon(l.pricePerDay)}>
            <Popup>
              <div style={{ minWidth: 160 }}>
                {l.images?.[0] && (
                  <img
                    src={l.images[0]}
                    alt={l.title}
                    style={{
                      width: '100%',
                      height: 80,
                      objectFit: 'cover',
                      borderRadius: 6,
                      marginBottom: 6,
                    }}
                  />
                )}
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                  {l.title}
                </p>
                <p style={{ color: '#3b82f6', fontSize: 12, marginBottom: 6 }}>
                  {formatTnd(l.pricePerDay)}/day
                </p>
                <a
                  href={`/listings/${l.id}`}
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    background: '#3b82f6',
                    color: '#fff',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontSize: 12,
                    textDecoration: 'none',
                  }}
                >
                  View listing
                </a>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
