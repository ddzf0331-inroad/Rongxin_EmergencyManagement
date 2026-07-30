import { mockCameraStream, mockEscapeRoutes, mockMapPoints, mockSnapshot } from "../data/mockDashboard";
import { mockEmergencyResponseSnapshot } from "../data/mockEmergencyResponse";
import type {
  CameraStream,
  ApiConfigTestResult,
  DashboardApiConfig,
  DashboardApiSourceKey,
  DashboardMapConfig,
  DashboardSnapshot,
  DutyStaff,
  EmergencyIncident,
  EmergencyResponseSnapshot,
  EscapeRoute,
  ExternalSourceResult,
  IncidentCreateInput,
  IncidentStatus,
  MapPoint,
  MsdsRecord,
} from "../types";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ??
  import.meta.env.VITE_SIMULATION_API_BASE_URL?.replace(/\/$/, "") ??
  "";
export const MAP_CONFIG_STORAGE_KEY = "emergency-dashboard-map-config-v1";
export const ACTIVE_INCIDENT_STORAGE_KEY = "emergency-dashboard-active-incident-v1";

async function readJson<T>(path: string, fallback: T): Promise<T> {
  if (!API_BASE) {
    return wait(fallback);
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    console.warn(`Dashboard API fallback for ${path}`, error);
    return wait(fallback);
  }
}

function wait<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), 180);
  });
}

function dashboardPlansFallback<T>(options: { page?: number; pageSize?: number }, error: unknown): ExternalSourceResult<T> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const list = (mockSnapshot.plans.items ?? []).map((plan) => ({
    ...plan,
    applicableArea: plan.applicableArea ?? plan.version,
  }));
  const start = (page - 1) * pageSize;
  return {
    sourceKey: "dashboardPlans",
    data: {
      list: list.slice(start, start + pageSize) as T[],
      total: list.length,
      page,
      pageSize,
    },
    fetchedAt: new Date().toISOString(),
    stale: true,
    errorMessage: error instanceof Error ? error.message : "第三方接口异常",
  };
}

function chemicalsFallback<T>(options: { page?: number; pageSize?: number }, error: unknown): ExternalSourceResult<T> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const list = mockEmergencyResponseSnapshot.msdsRecords as MsdsRecord[];
  const start = (page - 1) * pageSize;
  return {
    sourceKey: "chemicals",
    data: {
      list: list.slice(start, start + pageSize) as T[],
      total: list.length,
      page,
      pageSize,
    },
    fetchedAt: new Date().toISOString(),
    stale: true,
    errorMessage: error instanceof Error ? error.message : "第三方接口异常",
  };
}

function makeMapConfig(mapPoints: MapPoint[], escapeRoutes: EscapeRoute[]): DashboardMapConfig {
  return {
    version: 2,
    mapPoints,
    escapeRoutes,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeMapConfig(value: unknown): DashboardMapConfig | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DashboardMapConfig> & { version?: number };
  if (![1, 2].includes(candidate.version ?? 0) || !Array.isArray(candidate.mapPoints) || !Array.isArray(candidate.escapeRoutes)) return null;
  return {
    version: 2,
    mapPoints: candidate.mapPoints,
    escapeRoutes: candidate.escapeRoutes,
    calibration: candidate.version === 2 ? candidate.calibration : undefined,
    updatedAt: candidate.updatedAt ?? new Date().toISOString(),
  };
}

function isEmergencyIncident(value: unknown): value is EmergencyIncident {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EmergencyIncident>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.type === "string" &&
    candidate.status === "responding"
  );
}

async function incidentRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return payload as T;
}

async function integrationRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return payload as T;
}

export function readLocalMapConfig(): DashboardMapConfig | null {
  try {
    const raw = window.localStorage.getItem(MAP_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return normalizeMapConfig(parsed);
  } catch (error) {
    console.warn("Dashboard map config local read failed", error);
    return null;
  }
}

function writeLocalMapConfig(config: DashboardMapConfig) {
  window.localStorage.setItem(MAP_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function readLocalActiveIncident(): EmergencyIncident | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_INCIDENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isEmergencyIncident(parsed) ? parsed : null;
  } catch (error) {
    console.warn("Active incident local read failed", error);
    return null;
  }
}

function writeLocalActiveIncident(incident: EmergencyIncident) {
  window.localStorage.setItem(ACTIVE_INCIDENT_STORAGE_KEY, JSON.stringify(incident));
}

function clearLocalActiveIncident() {
  window.localStorage.removeItem(ACTIVE_INCIDENT_STORAGE_KEY);
}

export const dashboardApi = {
  getApiConfig(): Promise<DashboardApiConfig> {
    return integrationRequest<DashboardApiConfig>("/api/emergency-dashboard/api-config");
  },

  saveApiConfig(config: DashboardApiConfig): Promise<DashboardApiConfig> {
    return integrationRequest<DashboardApiConfig>("/api/emergency-dashboard/api-config", {
      method: "PUT",
      body: JSON.stringify(config),
    });
  },

  testApiConfig(sourceKey: DashboardApiSourceKey, config: DashboardApiConfig): Promise<ApiConfigTestResult> {
    return integrationRequest<ApiConfigTestResult>("/api/emergency-dashboard/api-config/test", {
      method: "POST",
      body: JSON.stringify({ sourceKey, config }),
    });
  },

  getExternalSource<T>(
    sourceKey: DashboardApiSourceKey,
    options: { page?: number; pageSize?: number; keyword?: string } = {},
  ): Promise<ExternalSourceResult<T>> {
    const query = new URLSearchParams({
      page: String(options.page ?? 1),
      pageSize: String(options.pageSize ?? 20),
    });
    if (options.keyword?.trim()) query.set("keyword", options.keyword.trim());
    return integrationRequest<ExternalSourceResult<T>>(
      `/api/emergency-dashboard/external/${sourceKey}?${query.toString()}`,
    ).catch((error) => {
      if (sourceKey === "dashboardPlans") return wait(dashboardPlansFallback<T>(options, error));
      if (sourceKey === "chemicals") return wait(chemicalsFallback<T>(options, error));
      throw error;
    });
  },

  getSnapshot(): Promise<DashboardSnapshot> {
    return readJson<DashboardSnapshot>("/api/emergency-dashboard/snapshot", mockSnapshot);
  },

  async getMapConfig(): Promise<DashboardMapConfig> {
    const localConfig = readLocalMapConfig();
    if (localConfig) return wait(localConfig);

    if (API_BASE) {
      try {
        const response = await fetch(`${API_BASE}/api/emergency-dashboard/map-config`, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const config = (await response.json()) as unknown;
        const normalized = normalizeMapConfig(config);
        if (normalized) return normalized;
      } catch (error) {
        console.warn("Dashboard map config API fallback", error);
      }
    }

    const [mapPoints, escapeRoutes] = await Promise.all([
      readJson<MapPoint[]>("/api/emergency-dashboard/map-points", mockMapPoints),
      readJson<EscapeRoute[]>("/api/emergency-dashboard/escape-routes", mockEscapeRoutes),
    ]);
    return makeMapConfig(mapPoints, escapeRoutes);
  },

  async saveMapConfig(config: DashboardMapConfig): Promise<DashboardMapConfig> {
    const normalized: DashboardMapConfig = {
      version: 2,
      mapPoints: config.mapPoints,
      escapeRoutes: config.escapeRoutes,
      calibration: config.calibration,
      updatedAt: new Date().toISOString(),
    };

    writeLocalMapConfig(normalized);

    if (API_BASE) {
      try {
        const response = await fetch(`${API_BASE}/api/emergency-dashboard/map-config`, {
          method: "PUT",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(normalized),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        console.warn("Dashboard map config API save failed; local config kept", error);
      }
    }

    return wait(normalized);
  },

  getMapPoints(): Promise<MapPoint[]> {
    return readJson<MapPoint[]>("/api/emergency-dashboard/map-points", mockMapPoints);
  },

  getEscapeRoutes(): Promise<EscapeRoute[]> {
    return readJson<EscapeRoute[]>("/api/emergency-dashboard/escape-routes", mockEscapeRoutes);
  },

  getAlerts() {
    return readJson("/api/emergency-dashboard/alerts", mockSnapshot.alerts);
  },

  getDutyStaff(keyword = ""): Promise<DutyStaff[]> {
    const normalized = keyword.trim();
    const fallback = normalized
      ? mockSnapshot.dutyStaff.filter((staff) =>
          `${staff.name}${staff.department}${staff.phone}`.includes(normalized),
        )
      : mockSnapshot.dutyStaff;

    const query = normalized ? `?keyword=${encodeURIComponent(normalized)}` : "";
    return readJson<DutyStaff[]>(`/api/emergency-dashboard/duty-staff${query}`, fallback);
  },

  getCameraStream(id: string): Promise<CameraStream> {
    return readJson<CameraStream>(`/api/emergency-dashboard/cameras/${id}/stream`, {
      ...mockCameraStream,
      id,
    });
  },

  async getActiveIncident(): Promise<EmergencyIncident | null> {
    try {
      const incident = await incidentRequest<EmergencyIncident | null>("/api/emergency/incidents/active");
      if (incident && isEmergencyIncident(incident)) {
        writeLocalActiveIncident(incident);
        return incident;
      }
      clearLocalActiveIncident();
      return null;
    } catch (error) {
      console.warn("Active incident API fallback", error);
      return wait(readLocalActiveIncident());
    }
  },

  listIncidents(filters: { keyword?: string; status?: IncidentStatus | ""; type?: string; deleted?: "active" | "deleted" } = {}): Promise<EmergencyIncident[]> {
    const query = new URLSearchParams();
    if (filters.keyword?.trim()) query.set("keyword", filters.keyword.trim());
    if (filters.status) query.set("status", filters.status);
    if (filters.type) query.set("type", filters.type);
    if (filters.deleted === "deleted") query.set("deleted", "only");
    const suffix = query.size ? `?${query.toString()}` : "";
    return incidentRequest<EmergencyIncident[]>(`/api/emergency/incidents${suffix}`);
  },

  createIncident(input: IncidentCreateInput): Promise<EmergencyIncident> {
    return incidentRequest<EmergencyIncident>("/api/emergency/incidents", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  deleteIncident(id: string): Promise<EmergencyIncident> {
    return incidentRequest<EmergencyIncident>(`/api/emergency/incidents/${id}`, {
      method: "DELETE",
    });
  },

  restoreIncident(id: string): Promise<EmergencyIncident> {
    return incidentRequest<EmergencyIncident>(`/api/emergency/incidents/${id}/restore`, {
      method: "POST",
      body: "{}",
    });
  },

  classifyNonEmergency(id: string): Promise<EmergencyIncident> {
    return incidentRequest<EmergencyIncident>(`/api/emergency/incidents/${id}/non-emergency`, {
      method: "POST",
      body: "{}",
    });
  },

  async startIncident(id: string): Promise<EmergencyIncident> {
    const incident = await incidentRequest<EmergencyIncident>(`/api/emergency/incidents/${id}/respond`, {
      method: "POST",
      body: "{}",
    });
    writeLocalActiveIncident(incident);
    return incident;
  },

  async terminateIncident(id: string, reasons: string[], note: string): Promise<EmergencyIncident> {
    const incident = await incidentRequest<EmergencyIncident>(`/api/emergency/incidents/${id}/terminate`, {
      method: "POST",
      body: JSON.stringify({ reasons, note }),
    });
    clearLocalActiveIncident();
    return incident;
  },

  getEmergencyResponseSnapshot(incidentId: string): Promise<EmergencyResponseSnapshot> {
    return readJson<EmergencyResponseSnapshot>(
      `/api/emergency-dashboard/incidents/${incidentId}/response`,
      mockEmergencyResponseSnapshot,
    );
  },
};
