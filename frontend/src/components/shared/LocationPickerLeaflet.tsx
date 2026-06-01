import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useDebounce } from '@/lib/utils/useDebounce';
import { geoSearch, geoReverse, type GeoSearchResult } from '@/lib/api/geo';

const PIN_ICON = L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:30px;height:40px">
      <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:26px;height:26px;background:#ef4444;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:translateX(-50%) rotate(-45deg);box-shadow:0 3px 8px rgba(0,0,0,.4)"></div>
      <div style="position:absolute;top:8px;left:50%;transform:translateX(-50%);width:8px;height:8px;background:#fff;border-radius:50%"></div>
    </div>
  `,
  iconSize: [30, 40],
  iconAnchor: [15, 36],
});

type Suggestion = GeoSearchResult;

export interface LocationPickerValue {
  address: string;
  lat: number;
  lng: number;
}

interface Props {
  value: LocationPickerValue;
  onChange: (v: LocationPickerValue) => void;
  /** Default center if value.lat/lng are 0 (no pin placed yet). */
  defaultCenter?: [number, number];
  height?: string;
}

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    // ResizeObserver fires whenever the container actually changes size,
    // covering dynamic-import delays that rAF/setTimeout miss.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(container);
    map.invalidateSize(); // also call immediately
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function FlyTo({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    const [lat, lng] = center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    // setView is synchronous — avoids the async animation-frame NaN crash
    // that flyTo triggers when the map container hasn't fully laid out yet.
    map.setView(center, Math.max(map.getZoom(), 14), { animate: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1]]);
  return null;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const data = await geoReverse(lat, lng, 18);
  return data?.display_name || '';
}

export default function LocationPickerLeaflet({
  value,
  onChange,
  defaultCenter = [36.8578, 11.092],
  height = '300px',
}: Props) {
  const hasPin =
    Number.isFinite(value.lat) && Number.isFinite(value.lng) &&
    value.lat !== 0 && value.lng !== 0;
  const center: [number, number] = hasPin ? [value.lat, value.lng] : defaultCenter;

  const [query, setQuery] = useState(value.address);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [lastPicked, setLastPicked] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dq = useDebounce(query, 350);

  // Sync external value → input
  useEffect(() => { setQuery(value.address); }, [value.address]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSugg(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (dq.length < 3 || dq === lastPicked) { setSuggestions([]); return; }
    let cancelled = false;
    geoSearch(dq, { limit: 5, countryCode: 'tn' })
      .then((data) => {
        if (!cancelled) { setSuggestions(data); setShowSugg(data.length > 0); }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [dq, lastPicked]);

  function pickSuggestion(s: Suggestion) {
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lon);
    setLastPicked(s.display_name);
    setQuery(s.display_name);
    setShowSugg(false);
    onChange({ address: s.display_name, lat, lng });
  }

  async function handlePinDrag(lat: number, lng: number) {
    const newAddress = await reverseGeocode(lat, lng);
    setLastPicked(newAddress);
    setQuery(newAddress);
    onChange({ address: newAddress || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
  }

  return (
    <div className="space-y-2">
      {/* Address autocomplete */}
      <div className="relative" ref={wrapperRef}>
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5">
          <i className="fa-solid fa-magnifying-glass text-gray-400 text-sm" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setLastPicked(null); onChange({ ...value, address: e.target.value }); }}
            onFocus={() => { if (suggestions.length > 0) setShowSugg(true); }}
            placeholder="Search address (e.g. Sidi Bou Said, Tunisia)"
            className="w-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
        </div>
        {showSugg && suggestions.length > 0 && (
          <ul className="absolute left-0 top-full z-[2000] mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            {suggestions.map((s) => {
              const parts = s.display_name.split(', ');
              return (
                <li
                  key={s.place_id}
                  onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                  className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-gray-50"
                >
                  <i className="fa-solid fa-location-dot mt-0.5 shrink-0 text-gray-400 text-sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">{parts[0]}</span>
                    <span className="block truncate text-xs text-gray-400">{parts.slice(1).join(', ')}</span>
                  </span>
                </li>
              );
            })}
            <li className="border-t border-gray-100 px-4 py-1.5 text-[10px] text-gray-400">
              © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a> contributors
            </li>
          </ul>
        )}
      </div>

      {/* Map with draggable pin */}
      <div className="overflow-hidden rounded-lg border border-gray-300" style={{ height }}>
        <MapContainer center={center} zoom={hasPin ? 15 : 6} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <InvalidateSize />
          {hasPin && <FlyTo center={[value.lat, value.lng]} />}
          {hasPin && (
            <Marker
              position={[value.lat, value.lng]}
              icon={PIN_ICON}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target as L.Marker;
                  const p = m.getLatLng();
                  void handlePinDrag(p.lat, p.lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <p className="text-xs text-gray-500">
        {hasPin
          ? <>Pin at <strong>{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</strong> — drag to fine-tune.</>
          : 'Pick an address above to drop a pin.'}
      </p>
    </div>
  );
}
