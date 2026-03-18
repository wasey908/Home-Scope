// Geocode cache: now delegates to backend API
// Falls back to Google Maps JS API if backend is unavailable

import { api } from "./api";

export interface GeocodedLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
}

// Local in-memory cache to avoid redundant API calls within the same session
const memoryCache: Record<string, GeocodedLocation> = {};

export function getCachedGeocode(address: string): GeocodedLocation | null {
  return memoryCache[address.trim().toLowerCase()] || null;
}

export function setCachedGeocode(address: string, location: GeocodedLocation) {
  memoryCache[address.trim().toLowerCase()] = location;
}

export async function geocodeAddress(
  address: string,
  _geocoder?: google.maps.Geocoder
): Promise<GeocodedLocation | null> {
  const key = address.trim().toLowerCase();

  // Check memory cache first
  const cached = memoryCache[key];
  if (cached) return cached;

  try {
    // Use backend API (which has its own DB cache)
    const result = await api.geocode(address);
    const location: GeocodedLocation = {
      lat: result.lat,
      lng: result.lng,
      formattedAddress: result.formattedAddress,
    };
    memoryCache[key] = location;
    return location;
  } catch (e) {
    console.warn("Backend geocoding failed, trying Google Maps JS API fallback:", e);

    // Fallback to Google Maps JS API if available
    if (_geocoder) {
      try {
        const result = await _geocoder.geocode({ address });
        if (result.results && result.results.length > 0) {
          const loc = result.results[0];
          const location: GeocodedLocation = {
            lat: loc.geometry.location.lat(),
            lng: loc.geometry.location.lng(),
            formattedAddress: loc.formatted_address,
          };
          memoryCache[key] = location;
          return location;
        }
      } catch (fallbackError) {
        console.warn("Fallback geocoding also failed:", fallbackError);
      }
    }

    return null;
  }
}
