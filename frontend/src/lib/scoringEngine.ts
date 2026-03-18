// Scoring engine: now delegates to backend API
// Kept as a thin wrapper to maintain the same interface for frontend consumers

import { api } from "./api";
import {
  type RouteResult,
  type RoutingSettings,
  type HomeScore,
} from "./routingTypes";
import { type PreferenceWeights } from "./preferenceLearning";

interface PlaceInput {
  id: number;
  name: string;
  weight: number;
}

interface HomeInput {
  id: number;
  address: string;
  rentMonthlyGBP: number;
  lat: number;
  lng: number;
}

export async function computeScores(
  routes: RouteResult[],
  homes: HomeInput[],
  places: PlaceInput[],
  settings: RoutingSettings,
  fallbackDurations: Record<string, number>,
  prefWeights?: PreferenceWeights
): Promise<HomeScore[]> {
  try {
    const response = await api.computeScores({
      routes,
      homes,
      places,
      settings,
      fallbackDurations,
      prefWeights: prefWeights || null,
    });
    return response.scores as HomeScore[];
  } catch (e) {
    console.error("Scoring API error:", e);
    return [];
  }
}
