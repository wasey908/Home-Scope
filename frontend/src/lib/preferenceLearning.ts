/**
 * Preference learning module — ML interaction logging.
 *
 * The old weight-shifting system is replaced by logging user interactions
 * (like/dislike/view) which feed the LightGBM LambdaMART ranking model.
 *
 * Legacy functions (loadWeights, updateWeights, computeWeightedScore) are
 * preserved for backward compatibility but no longer drive ranking.
 */

import { api, getToken } from "./api";

// ─── Types ──────────────────────────────────────────────────────────

export interface PreferenceWeights {
  transitTime: number;
  drivingTime: number;
  walkingTime: number;
  transferCount: number;
  walkingDuration: number;
  variability: number;
  reliability: number;
}

export interface HomeFeatureVector {
  transitTime: number;
  drivingTime: number;
  walkingTime: number;
  transferCount: number;
  walkingDuration: number;
  variability: number;
  reliability: number;
}

export type InteractionAction = "liked" | "disliked" | "viewed_details" | "selected_top";

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: PreferenceWeights = {
  transitTime: 0.20,
  drivingTime: 0.15,
  walkingTime: 0.10,
  transferCount: 0.10,
  walkingDuration: 0.10,
  variability: 0.15,
  reliability: 0.20,
};

const FEATURE_KEYS: (keyof PreferenceWeights)[] = [
  "transitTime", "drivingTime", "walkingTime",
  "transferCount", "walkingDuration", "variability", "reliability",
];

const IS_POSITIVE_FEATURE: Record<keyof PreferenceWeights, boolean> = {
  transitTime: false,
  drivingTime: false,
  walkingTime: false,
  transferCount: false,
  walkingDuration: false,
  variability: false,
  reliability: true,
};

// ─── ML Interaction API ─────────────────────────────────────────────

/**
 * Log a user interaction with a home for ML training.
 * Only works for authenticated users — silently skips for guests.
 */
export async function logInteraction(
  scenarioId: string,
  homeId: number,
  action: InteractionAction,
): Promise<void> {
  // Only log if user is authenticated
  if (!getToken()) return;

  try {
    await api.logInteraction(scenarioId, homeId, action);
  } catch {
    // Non-critical — interactions are best-effort
    console.warn("Failed to log interaction:", action, "for home", homeId);
  }
}

/**
 * Get ML system status — whether a trained model is available.
 */
export async function getMLStatus() {
  try {
    return await api.getMLStatus();
  } catch {
    return null;
  }
}

// ─── Legacy functions (backward compatibility) ──────────────────────

export async function loadWeights(): Promise<PreferenceWeights> {
  try {
    const data = await api.getPreferences();
    const { interactionCount, ...weights } = data;
    return weights;
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

export async function saveWeights(_w: PreferenceWeights): Promise<void> {
  // No-op — weights are managed server-side
}

export async function getInteractionCount(): Promise<number> {
  try {
    const data = await api.getPreferences();
    return data.interactionCount || 0;
  } catch {
    return 0;
  }
}

export async function incrementInteractionCount(): Promise<number> {
  const count = await getInteractionCount();
  return count;
}

export async function resetWeights(): Promise<PreferenceWeights> {
  try {
    const data = await api.resetPreferences();
    const { interactionCount, ...weights } = data;
    return weights;
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

export function computeAverageFeatures(allFeatures: HomeFeatureVector[]): HomeFeatureVector {
  const avg: HomeFeatureVector = {
    transitTime: 0, drivingTime: 0, walkingTime: 0,
    transferCount: 0, walkingDuration: 0, variability: 0, reliability: 0,
  };
  if (allFeatures.length === 0) return avg;
  for (const f of allFeatures) {
    for (const k of FEATURE_KEYS) {
      avg[k] += f[k];
    }
  }
  for (const k of FEATURE_KEYS) {
    avg[k] /= allFeatures.length;
  }
  return avg;
}

export async function updateWeights(
  current: PreferenceWeights,
  features: HomeFeatureVector,
  averageFeatures: HomeFeatureVector,
  direction: 1 | -1
): Promise<PreferenceWeights> {
  try {
    const data = await api.updatePreferences({
      features,
      averageFeatures,
      direction,
    });
    const { interactionCount, ...weights } = data;
    return weights;
  } catch {
    return _localUpdate(current, features, averageFeatures, direction);
  }
}

function _localUpdate(
  current: PreferenceWeights,
  features: HomeFeatureVector,
  averageFeatures: HomeFeatureVector,
  direction: 1 | -1
): PreferenceWeights {
  const LEARNING_RATE = 0.05;
  const updated = { ...current };
  for (const k of FEATURE_KEYS) {
    const delta = features[k] - averageFeatures[k];
    const sign = IS_POSITIVE_FEATURE[k] ? 1 : -1;
    updated[k] = Math.max(0.01, updated[k] + direction * sign * LEARNING_RATE * delta);
  }
  const total = FEATURE_KEYS.reduce((s, k) => s + updated[k], 0);
  for (const k of FEATURE_KEYS) {
    updated[k] = +(updated[k] / total).toFixed(4);
  }
  return updated;
}

export function computeWeightedScore(
  weights: PreferenceWeights,
  features: HomeFeatureVector
): number {
  let score = 0;
  for (const k of FEATURE_KEYS) {
    const goodness = IS_POSITIVE_FEATURE[k] ? features[k] : (1 - features[k]);
    score += weights[k] * goodness;
  }
  return score;
}
