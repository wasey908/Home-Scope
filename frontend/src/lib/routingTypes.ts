// Core routing types for the Advanced Multi-Mode Transit Intelligence System

export type TravelMode = "transit" | "driving" | "walking";

export type TimeWindowId = "weekday_peak_8am" | "weekday_offpeak_11am" | "saturday_midday";

export interface TimeWindowDef {
  id: TimeWindowId;
  label: string;
  shortLabel: string;
  getDate: () => Date;
}

export function getNextWeekday(): Date {
  const d = new Date();
  const day = d.getDay();
  // If today is weekday but time already passed, move to next weekday
  if (day >= 1 && day <= 5) {
    d.setDate(d.getDate() + 1);
    // If that lands on Saturday, skip to Monday
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  } else if (day === 0) {
    d.setDate(d.getDate() + 1);
  } else {
    // Saturday
    d.setDate(d.getDate() + 2);
  }
  return d;
}

export function getNextSaturday(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

export const TIME_WINDOWS: TimeWindowDef[] = [
  {
    id: "weekday_peak_8am",
    label: "Weekday Peak (8 AM)",
    shortLabel: "8am",
    getDate: () => { const d = getNextWeekday(); d.setHours(8, 0, 0, 0); return d; },
  },
  {
    id: "weekday_offpeak_11am",
    label: "Weekday Off-Peak (11 AM)",
    shortLabel: "11am",
    getDate: () => { const d = getNextWeekday(); d.setHours(11, 0, 0, 0); return d; },
  },
  {
    id: "saturday_midday",
    label: "Saturday Midday (12 PM)",
    shortLabel: "Sat",
    getDate: () => { const d = getNextSaturday(); d.setHours(12, 0, 0, 0); return d; },
  },
];

export interface TransitStep {
  type: "walking" | "transit";
  durationSec: number;
  distanceMeters: number;
  instruction?: string;
  lineName?: string;
  vehicleType?: string;
  departureStop?: string;
  arrivalStop?: string;
  numStops?: number;
  headsign?: string;
}

export interface RouteResult {
  homeId: number;
  placeId: number;
  mode: TravelMode;
  timeWindow: TimeWindowId;
  durationSec: number;
  distanceMeters: number;
  steps: TransitStep[];
  transferCount: number;
  walkingDurationSec: number;
  summaryText: string;
  departureTime: string;
  arrivalTime: string;
  polyline?: string;
}

export interface ModeBlendWeights {
  transit: number;
  driving: number;
  walking: number;
}

export interface RoutingSettings {
  modeBlendWeights: ModeBlendWeights;
}

export const DEFAULT_ROUTING_SETTINGS: RoutingSettings = {
  modeBlendWeights: { transit: 0.6, driving: 0.3, walking: 0.1 },
};

export interface HomeScore {
  homeId: number;
  address: string;
  rentMonthlyGBP: number;
  blendedCommuteMinutes: number;
  variabilityScore: number;
  robustnessScore: number;
  totalScore: number;
  variabilityLabel: string;
  robustnessLabel: string;
  perPlaceBreakdown: PlaceBreakdown[];
  perModeStats: Record<TravelMode, { avgMinutes: number; avgDistanceMiles: number }>;
  featureVector?: import("./preferenceLearning").HomeFeatureVector;
}

export interface PlaceBreakdown {
  placeId: number;
  placeName: string;
  weight: number;
  byMode: Record<TravelMode, ModeBreakdown>;
  byTimeWindow: Record<TimeWindowId, number>;
  blendedMinutes: number;
}

export interface ModeBreakdown {
  durationMin: number;
  distanceMiles: number;
  transferCount?: number;
  walkingMin?: number;
  steps?: TransitStep[];
}

export interface CalculationProgress {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  currentLabel: string;
  cancelled: boolean;
}

export interface DirectionsCacheEntry {
  result: RouteResult;
  fetchedAt: number;
}

export function makeCacheKey(
  homeLat: number, homeLng: number,
  placeLat: number, placeLng: number,
  mode: TravelMode, timeWindow: TimeWindowId
): string {
  return `${homeLat.toFixed(5)},${homeLng.toFixed(5)}|${placeLat.toFixed(5)},${placeLng.toFixed(5)}|${mode}|${timeWindow}`;
}

export const METERS_TO_MILES = 0.000621371;
