import { api, setToken, clearToken, getToken } from "./api";

export interface MockUser {
  email: string;
  createdAt: string;
}

export interface GuestData {
  places: string[];
  homes: { name: string; liked: boolean }[];
  travelModes: string[];
  maxCommute: number;
}

export function getSession(): MockUser | null {
  // Check if we have a token — if so, we're "logged in"
  // The actual user data is fetched async via getSessionAsync
  const token = getToken();
  if (!token) return null;
  // Return cached user if available
  try {
    const cached = localStorage.getItem("homescope_user_cache");
    if (cached) return JSON.parse(cached);
  } catch { /* ignore */ }
  // We have a token but no cached user — will be resolved async
  return { email: "loading...", createdAt: "" };
}

export async function getSessionAsync(): Promise<MockUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const data = await api.getMe();
    const user: MockUser = { email: data.email, createdAt: data.created_at };
    localStorage.setItem("homescope_user_cache", JSON.stringify(user));
    return user;
  } catch {
    // Token expired or invalid
    clearToken();
    localStorage.removeItem("homescope_user_cache");
    return null;
  }
}

export async function register(
  email: string,
  password: string
): Promise<{ ok: true; user: MockUser } | { ok: false; error: string }> {
  try {
    const data = await api.register(email, password);
    setToken(data.access_token);
    const user: MockUser = { email: email.trim().toLowerCase(), createdAt: new Date().toISOString() };
    localStorage.setItem("homescope_user_cache", JSON.stringify(user));
    return { ok: true, user };
  } catch (e: any) {
    return { ok: false, error: e.message || "Registration failed." };
  }
}

export async function login(
  email: string,
  password: string
): Promise<{ ok: true; user: MockUser } | { ok: false; error: string }> {
  try {
    const data = await api.login(email, password);
    setToken(data.access_token);
    const user: MockUser = { email: email.trim().toLowerCase(), createdAt: new Date().toISOString() };
    localStorage.setItem("homescope_user_cache", JSON.stringify(user));
    return { ok: true, user };
  } catch (e: any) {
    return { ok: false, error: e.message || "Login failed." };
  }
}

export function logout(): void {
  clearToken();
  localStorage.removeItem("homescope_user_cache");
}

// Guest data helpers — kept as localStorage for non-authenticated users
export function saveGuestData(data: Partial<GuestData>): void {
  try {
    const existing = JSON.parse(localStorage.getItem("homescope_guest_data") || "{}");
    localStorage.setItem("homescope_guest_data", JSON.stringify({ ...existing, ...data }));
  } catch {
    localStorage.setItem("homescope_guest_data", JSON.stringify(data));
  }
}

export function getGuestData(): Partial<GuestData> {
  try {
    return JSON.parse(localStorage.getItem("homescope_guest_data") || "{}");
  } catch {
    return {};
  }
}
