import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { geoReverse } from '@/lib/api/geo';

// Bumped each time detection logic changes so stale labels get invalidated.
const CACHE_KEY = 'rentai_user_location_v5';
const LEGACY_CACHE_KEYS = [
  'rentai_user_location',
  'rentai_user_location_v2',
  'rentai_user_location_v3',
  'rentai_user_location_v4',
];
const CACHE_TTL_MS = 30 * 60 * 1000;
// Manual override — set when the user picks a city by hand from the chip
// dropdown. Takes precedence over GPS and over savedHome. Never expires
// automatically; cleared when the user hits "Reset" or "Use my location".
const MANUAL_KEY = 'rentai_user_location_manual_v1';
// Browser geolocation on desktops without GPS is often 10–50 km off. We used
// to DISCARD anything > 10 km, but on most desktops that meant every reading
// got rejected and the chip stuck on "Tunis DEFAULT". We now trust the reading
// and just log a warning when it's approximate. Users can override via the
// chip dropdown ("Pick city" / "Reset to default").
const ACCURACY_APPROXIMATE_METERS = 10000;

// Centroid of Tunis (the city). The previous value (36.8578, 11.092) was
// actually in the Cap Bon peninsula near Hammamet/Nabeul.
export const TUNIS_DEFAULT = { lat: 36.8065, lng: 10.1815, cityName: 'Tunis' };

/** Clear the cached GPS-resolved location so the next render re-detects. */
export function clearLocationCache() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export interface UserLocation {
  lat: number;
  lng: number;
  cityName: string;
  loading: boolean;
  isDefault: boolean;
  permissionDenied: boolean;
  fromSavedHome: boolean;
  /** True when the city was set manually by the user (chip dropdown picker). */
  isManual: boolean;
  requestLocation: () => void;
  /** Clear all overrides (manual + cache) and re-run GPS detection. */
  resetLocation: () => void;
  /** Set the active location by hand (city picker). Persists across reloads. */
  setManualLocation: (loc: { lat: number; lng: number; cityName: string }) => void;
}

type LocationState = Omit<UserLocation, 'requestLocation' | 'resetLocation' | 'setManualLocation'>;

interface Cached {
  lat: number;
  lng: number;
  cityName: string;
  ts: number;
}

interface ManualOverride {
  lat: number;
  lng: number;
  cityName: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const data = await geoReverse(lat, lng, 10);
  const addr = data?.address as any;
  // Walk address granularity from city → smaller settlements → administrative
  // areas before falling back to display_name parsing. Tunisia's smaller
  // delegations don't always have a `city`/`town`, so we accept hamlet/suburb
  // before giving up and saying "Nearby".
  const name =
    addr?.city ||
    addr?.town ||
    addr?.village ||
    addr?.municipality ||
    addr?.hamlet ||
    addr?.suburb ||
    addr?.neighbourhood ||
    addr?.county ||
    addr?.state_district ||
    addr?.state;
  if (name) return name;

  // Last resort: take the first comma-separated component of the display string.
  const display = (data as any)?.display_name as string | undefined;
  if (display) {
    const first = display.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'Nearby';
}

function readCache(): Cached | null {
  if (typeof window === 'undefined') return null;
  for (const k of LEGACY_CACHE_KEYS) {
    try { localStorage.removeItem(k); } catch {}
  }
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: Cached = JSON.parse(raw);
    if (Date.now() - cached.ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function readManual(): ManualOverride | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(MANUAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.lat === 'number' &&
      typeof parsed?.lng === 'number' &&
      typeof parsed?.cityName === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeManual(loc: ManualOverride) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(MANUAL_KEY, JSON.stringify(loc)); } catch {}
}

function clearManual() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(MANUAL_KEY); } catch {}
}

function clearAllLocationCache() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(CACHE_KEY); } catch {}
  try { localStorage.removeItem(MANUAL_KEY); } catch {}
  for (const k of LEGACY_CACHE_KEYS) {
    try { localStorage.removeItem(k); } catch {}
  }
}

function writeCache(loc: Omit<Cached, 'ts'>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...loc, ts: Date.now() }));
  } catch {}
}

function doGetPosition(
  onSuccess: (pos: GeolocationPosition) => void,
  onError: () => void,
) {
  navigator.geolocation.getCurrentPosition(onSuccess, onError, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 5 * 60 * 1000,
  });
}

const INITIAL_STATE: LocationState = {
  ...TUNIS_DEFAULT,
  loading: true,
  isDefault: true,
  permissionDenied: false,
  fromSavedHome: false,
  isManual: false,
};

export function useUserLocation(): UserLocation {
  const { user } = useAuth();
  const savedHome =
    user && typeof user.homeLat === 'number' && typeof user.homeLng === 'number'
      ? { lat: user.homeLat, lng: user.homeLng, cityName: user.homeCityName || 'Saved home' }
      : null;

  const [state, setState] = useState<LocationState>(INITIAL_STATE);

  useEffect(() => {
    // 1) Manual override wins over everything else
    const manual = readManual();
    if (manual) {
      setState({
        lat: manual.lat,
        lng: manual.lng,
        cityName: manual.cityName,
        loading: false,
        isDefault: false,
        permissionDenied: false,
        fromSavedHome: false,
        isManual: true,
      });
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      // No GPS — fall back to saved home or default
      if (savedHome) {
        setState({
          lat: savedHome.lat,
          lng: savedHome.lng,
          cityName: savedHome.cityName,
          loading: false,
          isDefault: false,
          permissionDenied: false,
          fromSavedHome: true,
          isManual: false,
        });
      } else {
        setState(s => ({ ...s, loading: false }));
      }
      return;
    }

    const checkAndRequest = async () => {
      let alreadyDenied = false;
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        alreadyDenied = status.state === 'denied';
      } catch {
        // Permissions API not supported — try anyway
      }

      if (alreadyDenied) {
        if (savedHome) {
          setState({
            lat: savedHome.lat,
            lng: savedHome.lng,
            cityName: savedHome.cityName,
            loading: false,
            isDefault: false,
            permissionDenied: true,
            fromSavedHome: true,
            isManual: false,
          });
        } else {
          const cached = readCache();
          if (cached) {
            setState({
              lat: cached.lat, lng: cached.lng, cityName: cached.cityName,
              loading: false, isDefault: false, permissionDenied: true,
              fromSavedHome: false, isManual: false,
            });
          } else {
            setState(s => ({ ...s, loading: false, isDefault: true, permissionDenied: true }));
          }
        }
        return;
      }

      // Try cache first for fast initial paint, GPS will update it
      const cached = readCache();
      if (cached) {
        setState({
          lat: cached.lat, lng: cached.lng, cityName: cached.cityName,
          loading: false, isDefault: false, permissionDenied: false,
          fromSavedHome: false, isManual: false,
        });
      } else if (savedHome) {
        setState({
          lat: savedHome.lat, lng: savedHome.lng, cityName: savedHome.cityName,
          loading: true, isDefault: false, permissionDenied: false,
          fromSavedHome: true, isManual: false,
        });
      }

      doGetPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy;
          if (accuracy > ACCURACY_APPROXIMATE_METERS) {
            // eslint-disable-next-line no-console
            console.warn(`[useUserLocation] approximate reading (accuracy=${Math.round(accuracy)}m) — using anyway`);
          }
          let cityName = 'Nearby';
          try {
            cityName = await reverseGeocode(lat, lng);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[useUserLocation] reverse geocode failed — using "Nearby"', err);
          }
          writeCache({ lat, lng, cityName });
          setState({
            lat, lng, cityName,
            loading: false, isDefault: false, permissionDenied: false,
            fromSavedHome: false, isManual: false,
          });
        },
        () => {
          setState(s => ({
            ...s,
            loading: false,
            ...(s.isDefault ? { isDefault: true, permissionDenied: true } : { permissionDenied: true }),
          }));
        },
      );
    };

    void checkAndRequest();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    // Clear any manual override so GPS can take effect
    clearManual();
    setState(s => ({ ...s, loading: true, permissionDenied: false, isManual: false }));

    doGetPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        if (accuracy > ACCURACY_APPROXIMATE_METERS) {
          // eslint-disable-next-line no-console
          console.warn(`[useUserLocation] approximate reading (accuracy=${Math.round(accuracy)}m) — using anyway`);
        }
        let cityName = 'Nearby';
        try {
          cityName = await reverseGeocode(lat, lng);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[useUserLocation] reverse geocode failed — using "Nearby"', err);
        }
        writeCache({ lat, lng, cityName });
        setState({
          lat, lng, cityName,
          loading: false, isDefault: false, permissionDenied: false,
          fromSavedHome: false, isManual: false,
        });
      },
      () => {
        setState(s => ({ ...s, loading: false, isDefault: true, permissionDenied: true }));
      },
    );
  }, []);

  const resetLocation = useCallback(() => {
    clearAllLocationCache();
    setState({ ...INITIAL_STATE });
    requestLocation();
  }, [requestLocation]);

  const setManualLocation = useCallback(
    (loc: { lat: number; lng: number; cityName: string }) => {
      writeManual(loc);
      setState({
        lat: loc.lat,
        lng: loc.lng,
        cityName: loc.cityName,
        loading: false,
        isDefault: false,
        permissionDenied: false,
        fromSavedHome: false,
        isManual: true,
      });
    },
    [],
  );

  return { ...state, requestLocation, resetLocation, setManualLocation };
}
