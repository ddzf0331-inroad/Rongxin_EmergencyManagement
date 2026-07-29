import type { ChemicalProfile, ReleaseScenario, SimulationRun, WeatherInput } from "../types";

const API_BASE = (import.meta.env.VITE_SIMULATION_API_BASE_URL ?? "http://127.0.0.1:8765").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const value = response.status === 204 ? undefined : await response.json();
  if (!response.ok) {
    const detail = value as { message?: string; error?: { message?: string }; fields?: string[] } | undefined;
    const error = new Error(detail?.message ?? detail?.error?.message ?? `HTTP ${response.status}`) as Error & { fields?: string[] };
    error.fields = detail?.fields;
    throw error;
  }
  return value as T;
}

export const simulationApi = {
  health: () => request<{ status: string; slabAvailable: boolean; engineVersion: string }>("/api/accident-simulation/health", { cache: "no-store" }),
  getChemicals: () => request<ChemicalProfile[]>("/api/accident-simulation/chemicals"),
  createChemical: (chemical: Omit<ChemicalProfile, "id">) => request<ChemicalProfile>("/api/accident-simulation/chemicals", { method: "POST", body: JSON.stringify(chemical) }),
  updateChemical: (chemical: ChemicalProfile) => request<ChemicalProfile>(`/api/accident-simulation/chemicals/${chemical.id}`, { method: "PUT", body: JSON.stringify(chemical) }),
  deleteChemical: (id: string) => request<void>(`/api/accident-simulation/chemicals/${id}`, { method: "DELETE" }),
  getWeather: () => request<WeatherInput>("/api/accident-simulation/weather/current"),
  run: (chemicalId: string, scenario: ReleaseScenario, weather: WeatherInput) => request<SimulationRun>("/api/accident-simulation/runs", { method: "POST", body: JSON.stringify({ chemicalId, scenario, weather }) }),
  getRuns: () => request<Array<{ id: string; createdAt: string; status: string }>>("/api/accident-simulation/runs"),
};
