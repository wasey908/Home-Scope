// Google Directions API service — now delegates to backend API
// The backend handles rate-limiting, caching, and Google API calls directly

import { api } from "./api";
import {
  type TravelMode,
  type TimeWindowId,
  type RouteResult,
  type TransitStep,
  type CalculationProgress,
  TIME_WINDOWS,
} from "./routingTypes";

export interface RouteRequest {
  homeId: number;
  homeLat: number;
  homeLng: number;
  placeId: number;
  placeLat: number;
  placeLng: number;
  mode: TravelMode;
  timeWindow: TimeWindowId;
}

export async function computeAllRoutes(
  requests: RouteRequest[],
  onProgress: (progress: CalculationProgress) => void,
  cancelRef: { cancelled: boolean }
): Promise<RouteResult[]> {
  const progress: CalculationProgress = {
    totalRequests: requests.length,
    completedRequests: 0,
    failedRequests: 0,
    currentLabel: "Sending routes to server…",
    cancelled: false,
  };

  onProgress({ ...progress });

  if (cancelRef.cancelled) {
    progress.cancelled = true;
    onProgress({ ...progress });
    return [];
  }

  // Convert RouteRequest format to backend DirectionRequest format
  const directionRequests = requests.map((req) => ({
    originLat: req.homeLat,
    originLng: req.homeLng,
    destLat: req.placeLat,
    destLng: req.placeLng,
    mode: req.mode,
    timeWindow: req.timeWindow,
    homeId: req.homeId,
    placeId: req.placeId,
  }));

  // Send in batches to avoid overwhelming the backend
  const BATCH_SIZE = 20;
  const allResults: RouteResult[] = [];

  for (let i = 0; i < directionRequests.length; i += BATCH_SIZE) {
    if (cancelRef.cancelled) {
      progress.cancelled = true;
      onProgress({ ...progress });
      return allResults;
    }

    const batch = directionRequests.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(directionRequests.length / BATCH_SIZE);

    progress.currentLabel = `Processing batch ${batchNum}/${totalBatches}…`;
    onProgress({ ...progress });

    try {
      const response = await api.getDirections(batch);

      for (const result of response.results) {
        if (result) {
          allResults.push(result as RouteResult);
          progress.completedRequests++;
        } else {
          progress.failedRequests++;
        }
      }
    } catch (e) {
      console.error("Batch directions error:", e);
      progress.failedRequests += batch.length;
    }

    onProgress({ ...progress });
  }

  progress.currentLabel = "Done!";
  onProgress({ ...progress });

  return allResults;
}

// Robustness: fetch fallback route via backend
export async function fetchFallbackRoute(
  homeLat: number,
  homeLng: number,
  placeLat: number,
  placeLng: number,
  homeId: number,
  placeId: number
): Promise<RouteResult | null> {
  try {
    const response = await api.getDirections([
      {
        originLat: homeLat,
        originLng: homeLng,
        destLat: placeLat,
        destLng: placeLng,
        mode: "transit",
        timeWindow: "weekday_peak_8am",
        homeId,
        placeId,
      },
    ]);
    return response.results[0] as RouteResult | null;
  } catch {
    return null;
  }
}
