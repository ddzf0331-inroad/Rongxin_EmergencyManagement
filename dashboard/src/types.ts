export type MapLayerKey =
  | "camera"
  | "material"
  | "plan"
  | "personnel"
  | "hazard"
  | "drill"
  | "alarm"
  | "duty"
  | "escapeRoute";

export type Severity = "low" | "medium" | "high" | "critical";

export interface MapPoint {
  id: string;
  layer: MapLayerKey;
  name: string;
  x: number;
  y: number;
  z?: number;
  status?: string;
  severity?: Severity;
  detailUrl?: string;
  payload: Record<string, string | number | boolean | null | undefined>;
}

export interface EscapeRoute {
  id: string;
  name: string;
  exitName: string;
  status: "畅通" | "拥堵" | "封闭";
  color: string;
  points: Array<{ x: number; y: number }>;
  payload: Record<string, string | number | boolean | null | undefined>;
}

export interface DashboardMapConfig {
  version: 2;
  mapPoints: MapPoint[];
  escapeRoutes: EscapeRoute[];
  calibration?: MapCalibration;
  updatedAt: string;
}

export interface CalibrationPoint {
  id: string;
  mapX: number;
  mapY: number;
  eastM: number;
  northM: number;
}

export interface MapCalibration {
  controlPoints: CalibrationPoint[];
  validationPoints: CalibrationPoint[];
  physicalToMapMatrix: number[];
  mapToPhysicalMatrix: number[];
  rmsErrorM: number;
  maxErrorM: number;
  validForSimulation: boolean;
  updatedAt: string;
}

export interface ChemicalProfile {
  id: string;
  name: string;
  cas: string;
  phase: "gas" | "liquefiedGas";
  molarMassKgMol: number;
  gasDensityKgM3: number;
  liquidDensityKgM3: number;
  boilingPointK: number;
  vaporPressurePa: number;
  vaporHeatCapacityJkgK: number;
  liquidHeatCapacityJkgK: number;
  latentHeatJkg: number;
  gamma: number;
  erpg1Ppm: number;
  erpg2Ppm: number;
  erpg3Ppm: number;
  erpgUnit: "ppm";
  erpgSource: string;
  erpgVersion: string;
  propertySource: string;
  propertyVersion: string;
  updatedAt?: string;
}

export interface WeatherInput {
  windSpeedMS: number;
  windDirectionDeg: number;
  temperatureK: number;
  pressurePa: number;
  relativeHumidityPct: number;
  stabilityClass: "A" | "B" | "C" | "D" | "E" | "F" | "";
  surfaceRoughnessM: number;
  windMeasurementHeightM?: number;
  observedAt: string;
  source: string;
  corrected: boolean;
  units?: Record<string, string>;
}

export interface ReleaseScenario {
  releaseType: "pressurizedGas" | "liquefiedGas" | "instantaneous";
  inventoryKg: number;
  isolationTimeS: number;
  releaseTemperatureK: number;
  releaseHeightM: number;
  holeDiameterM?: number;
  vesselPressurePa?: number;
  dischargeCoefficient?: number;
  poolAreaM2?: number;
  poolHeatFluxWM2?: number;
  massTransferCoefficientMS?: number;
  vaporPressurePa?: number;
  sourceCoordinate: { eastM: number; northM: number };
}

export interface ConsequenceZone {
  level: "ERPG-1" | "ERPG-2" | "ERPG-3";
  thresholdPpm: number;
  thresholdKgM3: number;
  color: string;
  coordinates: Array<{ eastM: number; northM: number }>;
  maxDownwindDistanceM: number;
  maxWidthM: number;
  areaM2: number;
  peakConcentrationKgM3: number;
  arrivalTimeS: number;
  durationS: number;
  harmDescription: string;
}

export interface SimulationFrame {
  timeS: number;
  zones: ConsequenceZone[];
}

export interface SimulationRun {
  id: string;
  createdAt: string;
  status: "completed" | "failed";
  engineVersion: string;
  chemical: Pick<ChemicalProfile, "id" | "name" | "cas">;
  modelRoute: {
    model: "gaussian" | "slab";
    criterion: string;
    gasDensityKgM3: number;
    airDensityKgM3: number;
    frictionVelocityMS: number;
    richardsonNumber: number;
    criticalRichardsonNumber: number;
    modelVersion: string;
  };
  sourceTerm: Record<string, string | number>;
  zones: ConsequenceZone[];
  frames: SimulationFrame[];
  summary: { model: string; releasedMassKg: number; effectiveDurationS: number };
}

export interface DonutItem {
  name: string;
  value: number;
  color: string;
}

export interface DrillMonthStat {
  month: string;
  plan: number;
  done: number;
}

export interface DrillDepartmentStat {
  department: string;
  plan: number;
  done: number;
}

export interface DrillRecord {
  id: string;
  department: string;
  unit: string;
  time: string;
  planName: string;
  status: "已完成" | "进行中" | "待复盘";
  detailUrl?: string;
}

export interface HazardDetail {
  id: string;
  level: string;
  name: string;
  area: string;
  owner: string;
  medium: string;
  status: string;
  detailUrl?: string;
}

export interface PlanRow {
  id: string;
  name: string;
  type: "comprehensive" | "special" | "on_site" | "综合预案" | "专项预案" | "综合应急预案" | "专项应急预案" | "现场处置方案";
  owner: string;
  version: string;
  status: "published" | "draft" | "已发布" | "草稿" | "修订中";
  applicableArea?: string;
  detailUrl?: string;
  applicablePointIds?: string[];
  attachments?: Array<{
    id: string;
    name: string;
    type: string;
    version: string;
    updatedAt: string;
    content?: string;
    url?: string;
  }>;
}

export interface MaterialRow {
  id: string;
  name: string;
  location: string;
  expireAt: string;
  owner: string;
  expiryStatus?: "expired" | "expiring" | "normal";
  detailUrl?: string;
}

export interface AlertRow {
  id: string;
  site: string;
  type: string;
  time: string;
  status: "处理中" | "已确认";
  level: Severity;
}

export interface DutyStaff {
  id: string;
  name: string;
  department: string;
  phone: string;
  status: "在岗" | "替班" | "离线";
  x?: number;
  y?: number;
}

export interface WeatherStatus {
  condition: string;
  temperature: string;
  wind: string;
  airQuality: number;
  date: string;
  weekday: string;
}

export interface DashboardSnapshot {
  hazards: {
    total: number;
    levels: DonutItem[];
    items?: HazardDetail[];
  };
  drillStats: DrillMonthStat[];
  drillDepartmentStats?: DrillDepartmentStat[];
  drillRecords?: DrillRecord[];
  materials: MaterialRow[];
  plans: {
    total: number;
    categories: DonutItem[];
    items?: PlanRow[];
  };
  alerts: AlertRow[];
  dutyStaff: DutyStaff[];
  weatherWarning: string[];
  weather: WeatherStatus;
  updatedAt: string;
  liveState: "live" | "stale" | "offline";
}

export interface CameraStream {
  id: string;
  url: string;
  protocol: "hls" | "flv" | "mp4" | "mock";
  poster?: string;
  capturedAt?: string;
}

export type IncidentStatus = "pending" | "non_emergency" | "responding" | "terminated";

export interface IncidentCreateInput {
  title: string;
  type: string;
  location: string;
  description: string;
  reporter: string;
  reporterPhone: string;
}

export interface EmergencyIncident {
  id: string;
  title: string;
  type: string;
  level: Severity;
  status: IncidentStatus;
  location: string;
  address: string;
  reporter: string;
  reporterPhone: string;
  reportedAt: string;
  judgedAt: string | null;
  respondedAt: string | null;
  terminatedAt: string | null;
  terminationReasons: string[];
  terminationNote: string;
  updatedAt: string;
  startedAt: string;
  substance: string;
  description: string;
  affectedArea: string;
}

export interface WeatherMetric {
  id: string;
  label: string;
  value: string;
}

export interface MsdsRecord {
  id: string;
  name: string;
  alias: string;
  hazardClass: string;
  danger: string;
  emergencyMeasure: string;
  detail: string;
  detailUrl?: string;
}

export interface EmergencyCase {
  id: string;
  title: string;
  accidentType: string;
  level: string;
  summary: string;
  occurredAt: string;
  detailUrl?: string;
}

export interface RelatedPlan {
  id: string;
  name: string;
  category: string;
  level: string;
  status: "未启动" | "已启动";
  owner: string;
  detailUrl?: string;
  attachments?: Array<{
    id: string;
    name: string;
    type: string;
    version: string;
    updatedAt: string;
  }>;
}

export interface IncidentAlarm {
  id: string;
  name: string;
  area: string;
  type: string;
  time: string;
  level: Severity;
  status: "待处置" | "处理中" | "已确认";
  description: string;
}

export interface VideoChannel {
  id: string;
  name: string;
  area: string;
  pointId: string;
  streamUrl: string;
  poster: string;
  protocol: CameraStream["protocol"];
  status: "在线" | "离线";
  capturedAt: string;
}

export interface EmergencyResponseSnapshot {
  incident: EmergencyIncident;
  weather: WeatherStatus;
  weatherWarning: string[];
  weatherMetrics: WeatherMetric[];
  msdsRecords: MsdsRecord[];
  cases: EmergencyCase[];
  relatedPlans: RelatedPlan[];
  alarms: IncidentAlarm[];
  videoChannels: VideoChannel[];
  mapPoints: MapPoint[];
  escapeRoutes: EscapeRoute[];
  defaultCameraId: string;
  updatedAt: string;
  liveState: DashboardSnapshot["liveState"];
}

export type DashboardApiSourceKey =
  | "materials"
  | "drills"
  | "hazards"
  | "dashboardPlans"
  | "chemicals"
  | "cases"
  | "responsePlans";

export interface DashboardApiSourceConfig {
  enabled: boolean;
  apiPath: string;
  pagePath: string;
  defaultParams: Record<string, string | number | boolean>;
  queryParams: {
    page: string;
    pageSize: string;
    keyword: string;
  };
  responsePaths: Record<"code" | "message" | "list" | "total" | "page" | "pageSize" | "pageUrl" | "timestamp", string>;
  itemPaths: Record<string, string>;
  successValue: string | number | boolean;
  detailIdParam: string;
  statusValues?: {
    expiring: string;
    expired: string;
  };
}

export interface DashboardApiConfig {
  baseUrl: string;
  sources: Record<DashboardApiSourceKey, DashboardApiSourceConfig>;
  updatedAt: string;
}

export interface ExternalSourceResult<T> {
  sourceKey: DashboardApiSourceKey;
  data: {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
  };
  sourceTimestamp?: string;
  fetchedAt: string;
  stale: boolean;
  errorMessage?: string;
}

export interface ApiConfigTestResult {
  ok: boolean;
  httpStatus: number;
  elapsedMs: number;
  requestUrl: string;
  warning: string;
  rawPreview: string;
  normalized: ExternalSourceResult<Record<string, unknown>>;
}
