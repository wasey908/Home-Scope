import { api } from "@/lib/api";
import { getSession } from "@/lib/mockAuth";

export interface ScenarioData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastCompletedStep: number;
  wizardInputs: {
    places?: Array<{ name: string; address: string; importance: number }>;
    homes?: Array<{ address: string; rent: string }>;
    travel?: {
      selectedTimes: string[];
      changesPreference: number;
      walkingPreference: number;
      learnPreferences: boolean;
      preferReliable: boolean;
    };
    routingSettings?: {
      modeBlendWeights: { transit: number; driving: number; walking: number };
    };
  };
  results?: Record<string, unknown>;
  feedback?: Record<number, "neutral" | "liked" | "disliked">;
  learnedPreferences?: Record<string, number> | null;
}

// Helper to convert backend response to ScenarioData format
function mapResponse(s: any): ScenarioData {
  return {
    id: s.id,
    name: s.name,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    lastCompletedStep: s.last_completed_step,
    wizardInputs: s.wizard_inputs || {},
    results: s.results,
    feedback: s.feedback,
    learnedPreferences: s.learned_preferences,
  };
}

export async function getAllScenarios(): Promise<ScenarioData[]> {
  try {
    const data = await api.listScenarios();
    return data.map(mapResponse);
  } catch {
    return [];
  }
}

export async function getScenario(id: string): Promise<ScenarioData | null> {
  try {
    const data = await api.getScenario(id);
    return mapResponse(data);
  } catch {
    return null;
  }
}

export async function createScenario(name?: string): Promise<ScenarioData> {
  const data = await api.createScenario(name);
  return mapResponse(data);
}

export async function updateScenario(
  id: string,
  updates: Partial<Omit<ScenarioData, "id" | "createdAt">>
): Promise<ScenarioData | null> {
  try {
    // Map frontend field names to backend field names
    const backendUpdates: Record<string, any> = {};
    if (updates.name !== undefined) backendUpdates.name = updates.name;
    if (updates.lastCompletedStep !== undefined) backendUpdates.last_completed_step = updates.lastCompletedStep;
    if (updates.wizardInputs !== undefined) backendUpdates.wizard_inputs = updates.wizardInputs;
    if (updates.results !== undefined) backendUpdates.results = updates.results;
    if (updates.feedback !== undefined) backendUpdates.feedback = updates.feedback;
    if (updates.learnedPreferences !== undefined) backendUpdates.learned_preferences = updates.learnedPreferences;

    const data = await api.updateScenario(id, backendUpdates);
    return mapResponse(data);
  } catch {
    return null;
  }
}

export async function renameScenario(id: string, name: string): Promise<ScenarioData | null> {
  return updateScenario(id, { name });
}

export async function deleteScenario(id: string): Promise<boolean> {
  try {
    await api.deleteScenario(id);
    return true;
  } catch {
    return false;
  }
}

export async function getLastScenario(): Promise<ScenarioData | null> {
  const all = await getAllScenarios();
  if (all.length === 0) return null;
  return all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
}

/** Migration is no longer needed — data lives in the database */
export function migrateExistingData(): void {
  // No-op: migration from localStorage is no longer needed
}
