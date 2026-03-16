/**
 * Central API client for communicating with the FastAPI backend.
 * Handles JWT token management, base URL configuration, and error handling.
 */

const API_BASE_URL = "/api";

const TOKEN_KEY = "homescope_token";

// ─── Token management ──────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ─── Fetch wrapper ─────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let msg = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      msg = body.detail || msg;
    } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

// ─── API methods ───────────────────────────────────────────────────

// Auth
export const api = {
  // Auth
  register: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getMe: () =>
    request<{ email: string; created_at: string }>("/auth/me"),

  // Scenarios
  listScenarios: () =>
    request<any[]>("/scenarios"),

  createScenario: (name?: string) =>
    request<any>("/scenarios", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  getScenario: (id: string) =>
    request<any>(`/scenarios/${id}`),

  updateScenario: (id: string, updates: Record<string, any>) =>
    request<any>(`/scenarios/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),

  deleteScenario: (id: string) =>
    request<void>(`/scenarios/${id}`, { method: "DELETE" }),

  // Scoring
  computeScores: (data: any) =>
    request<{ scores: any[] }>("/score", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Preferences
  getPreferences: () =>
    request<any>("/preferences"),

  updatePreferences: (data: any) =>
    request<any>("/preferences/update", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  resetPreferences: () =>
    request<any>("/preferences/reset", { method: "POST" }),

  // Geocoding
  geocode: (address: string) =>
    request<{ lat: number; lng: number; formattedAddress: string }>("/geocode", {
      method: "POST",
      body: JSON.stringify({ address }),
    }),

  // Directions
  getDirections: (requests: any[]) =>
    request<{ results: any[]; completedRequests: number; failedRequests: number }>(
      "/directions",
      {
        method: "POST",
        body: JSON.stringify({ requests }),
      }
    ),

  // ML Interactions
  logInteraction: (scenarioId: string, homeId: number, action: string) =>
    request<any>("/preferences/interaction", {
      method: "POST",
      body: JSON.stringify({ scenario_id: scenarioId, home_id: homeId, action }),
    }),

  // ML Status
  getMLStatus: () =>
    request<{
      model_available: boolean;
      model_version: number | null;
      trained_at: string | null;
      total_interactions: number;
      total_scenarios_with_feedback: number;
      training_threshold_met: boolean;
      interactions_needed: number;
      scenarios_needed: number;
      user_interactions: number;
      user_liked: number;
      user_disliked: number;
      metrics: any;
    }>("/ml/status"),

  triggerMLTraining: () =>
    request<any>("/ml/train", { method: "POST" }),

  // Health
  healthCheck: () => request<{ status: string }>("/health"),
};
