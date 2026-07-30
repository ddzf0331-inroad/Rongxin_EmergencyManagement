import {
  AlertTriangle,
  BookOpen,
  Boxes,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudSun,
  Crosshair,
  Database,
  Droplets,
  Fan,
  FileText,
  FlaskConical,
  Gauge,
  Layers,
  MapPinned,
  MonitorDot,
  PackageCheck,
  PlayCircle,
  Plus,
  Power,
  RadioTower,
  Search,
  ShieldAlert,
  Siren,
  Thermometer,
  UsersRound,
  Wind,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ApiConfigPage } from "./components/ApiConfigPage";
import { ConfigPage } from "./components/ConfigPage";
import { CalibrationPage } from "./components/CalibrationPage";
import { EChart } from "./components/EChart";
import { IncidentManagementPage } from "./components/IncidentManagementPage";
import { IncidentReportPage } from "./components/IncidentReportPage";
import { MapStage } from "./components/MapStage";
import { Panel } from "./components/Panel";
import { SimulationMethodologyPage } from "./components/SimulationMethodologyPage";
import { SimulationPage } from "./components/SimulationPage";
import { barOption, donutOption } from "./components/charts";
import { incidentStatusLabels, terminationReasons } from "./data/incidents";
import { dashboardApi } from "./services/dashboardApi";
import type {
  CameraStream,
  DashboardSnapshot,
  DashboardApiSourceKey,
  DutyStaff,
  EmergencyIncident,
  EmergencyResponseSnapshot,
  IncidentAlarm,
  MsdsRecord,
  RelatedPlan,
  EscapeRoute,
  MapLayerKey,
  MapPoint,
  MaterialRow,
  ExternalSourceResult,
  PlanRow,
  VideoChannel,
  WeatherMetric,
  WeatherStatus,
} from "./types";
import "./styles.css";

const layerLabels: Record<MapLayerKey, string> = {
  camera: "摄像头",
  material: "应急物资",
  plan: "应急预案",
  personnel: "人员坐标",
  hazard: "重大危险源",
  drill: "应急演练",
  alarm: "报警信息",
  duty: "值班信息",
  escapeRoute: "逃生路线",
};

const initialLayers: Record<MapLayerKey, boolean> = {
  camera: true,
  material: true,
  plan: true,
  personnel: true,
  hazard: true,
  drill: false,
  alarm: false,
  duty: false,
  escapeRoute: true,
};

const layerOrder: MapLayerKey[] = ["plan", "material", "camera", "personnel", "hazard", "escapeRoute"];
const responseLayerOrder: MapLayerKey[] = layerOrder;

const responseInitialLayers: Record<MapLayerKey, boolean> = {
  camera: true,
  material: true,
  plan: true,
  personnel: true,
  hazard: true,
  drill: false,
  alarm: false,
  duty: false,
  escapeRoute: true,
};

type InfoTone = "danger" | "warning" | "ok";

interface InfoPopupData {
  title: string;
  status?: string;
  statusTone?: InfoTone;
  rows?: Array<{ label: string; value: string | number; tone?: InfoTone }>;
  table?: {
    columns: string[];
    rows: Array<{
      id: string;
      cells: Array<{ value: string | number; tone?: InfoTone }>;
    }>;
  };
}

interface ExternalPopupSpec {
  sourceKey: DashboardApiSourceKey;
  title: string;
  columns: Array<{ key: string; label: string }>;
}

interface ExternalPlanAttachment {
  id: string;
  name: string;
  type?: string;
  version?: string;
  updatedAt?: string;
  content?: string;
  url?: string;
}

interface HeaderData {
  weather: WeatherStatus;
  updatedAt: string;
  liveState: DashboardSnapshot["liveState"];
}

function useClock(seed?: string) {
  const [time, setTime] = useState(() => (seed ? new Date(seed) : new Date()));

  useEffect(() => {
    const base = seed ? new Date(seed).getTime() : Date.now();
    const started = Date.now();
    const timer = window.setInterval(() => {
      setTime(new Date(base + Date.now() - started));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [seed]);

  return time.toLocaleTimeString("zh-CN", { hour12: false });
}

function statusText(state?: HeaderData["liveState"]) {
  if (state === "offline") return "离线";
  if (state === "stale") return "延迟";
  return "数据中";
}

function openThirdPartyDetail(url?: string) {
  if (!url) return false;
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
  return true;
}

function textValue(value: unknown) {
  if (value == null || value === "") return "";
  return String(value);
}

function firstText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = textValue(row[key]);
    if (value) return value;
  }
  return "";
}

function planTypeText(type: unknown) {
  const labels: Record<string, string> = {
    comprehensive: "综合应急预案",
    special: "专项应急预案",
    on_site: "现场处置方案",
    综合预案: "综合应急预案",
    专项预案: "专项应急预案",
    综合应急预案: "综合应急预案",
    专项应急预案: "专项应急预案",
    现场处置方案: "现场处置方案",
  };
  const value = textValue(type);
  return labels[value] ?? value;
}

function planStatusText(status: unknown) {
  const labels: Record<string, string> = {
    published: "已发布",
    draft: "草稿",
    已发布: "已发布",
    草稿: "草稿",
  };
  const value = textValue(status);
  return labels[value] ?? value;
}

function shortPlanTypeText(type: unknown) {
  const labels: Record<string, string> = {
    comprehensive: "综合预案",
    special: "专项预案",
    on_site: "现场处置方案",
    综合预案: "综合预案",
    专项预案: "专项预案",
    综合应急预案: "综合预案",
    专项应急预案: "专项预案",
    现场处置方案: "现场处置方案",
  };
  const value = textValue(type);
  return labels[value] ?? value;
}

function isPublishedPlanStatus(status: unknown) {
  return ["published", "已发布"].includes(textValue(status));
}

function normalizeAttachment(value: unknown, index: number): ExternalPlanAttachment | null {
  if (typeof value === "string") {
    const name = value.trim();
    return name ? { id: `attachment-${index}`, name } : null;
  }
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const name = firstText(row, ["name", "fileName", "attachmentName", "title"]);
  return {
    id: firstText(row, ["id", "fileId", "attachmentId"]) || `attachment-${index}`,
    name: name || `附件${index + 1}`,
    type: firstText(row, ["type", "fileType", "mimeType"]),
    version: firstText(row, ["version"]),
    updatedAt: firstText(row, ["updatedAt", "updateTime", "modifiedAt"]),
    content: firstText(row, ["content", "summary", "description", "text"]),
    url: firstText(row, ["url", "fileUrl", "downloadUrl", "previewUrl"]),
  };
}

function normalizeAttachments(value: unknown): ExternalPlanAttachment[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(normalizeAttachment).filter((item): item is ExternalPlanAttachment => Boolean(item));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        return normalizeAttachments(JSON.parse(trimmed) as unknown);
      } catch {
        return [];
      }
    }
    return trimmed
      .split(/[，,；;]/)
      .map((name, index) => normalizeAttachment(name, index))
      .filter((item): item is ExternalPlanAttachment => Boolean(item));
  }
  const attachment = normalizeAttachment(value, 0);
  return attachment ? [attachment] : [];
}

function planAttachmentsFromRow(row: Record<string, unknown>) {
  return normalizeAttachments(row.attachments ?? row.attachmentList ?? row.files ?? row.fileList ?? row.attachment ?? row.file);
}

function useExternalSource<T>(sourceKey: DashboardApiSourceKey, pageSize = 20) {
  const [result, setResult] = useState<ExternalSourceResult<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    dashboardApi.getExternalSource<T>(sourceKey, { page: 1, pageSize })
      .then((next) => {
        if (mounted) setResult(next);
      })
      .catch((reason) => {
        if (!mounted) return;
        setResult(null);
        setError(reason instanceof Error ? reason.message : "第三方数据加载失败");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [sourceKey, pageSize]);

  return { result, loading, error };
}

const externalPopupSpecs: Record<"materials" | "drills" | "hazards" | "dashboardPlans", ExternalPopupSpec> = {
  materials: {
    sourceKey: "materials",
    title: "应急物资清单",
    columns: [
      { key: "name", label: "物资名称" },
      { key: "location", label: "存放位置" },
      { key: "expireAt", label: "有效期" },
      { key: "owner", label: "责任人" },
      { key: "expiryStatus", label: "状态" },
    ],
  },
  drills: {
    sourceKey: "drills",
    title: "应急演练记录",
    columns: [
      { key: "time", label: "演练时间" },
      { key: "department", label: "演练部门" },
      { key: "unit", label: "演练单位" },
      { key: "planName", label: "演练预案名称" },
      { key: "status", label: "状态" },
    ],
  },
  hazards: {
    sourceKey: "hazards",
    title: "重大危险源详情",
    columns: [
      { key: "level", label: "等级" },
      { key: "name", label: "名称" },
      { key: "area", label: "区域" },
      { key: "owner", label: "责任人" },
      { key: "medium", label: "危险介质" },
    ],
  },
  dashboardPlans: {
    sourceKey: "dashboardPlans",
    title: "预案详细清单",
    columns: [
      { key: "name", label: "预案名称" },
      { key: "type", label: "预案类型" },
      { key: "applicableArea", label: "适用区域" },
      { key: "status", label: "状态" },
      { key: "attachments", label: "附件" },
    ],
  },
};

export default function App() {
  if (window.location.pathname.startsWith("/apiconfig")) return <ApiConfigPage />;
  if (window.location.pathname.startsWith("/report")) return <IncidentReportPage />;
  if (window.location.pathname.startsWith("/events")) return <IncidentManagementPage />;
  if (window.location.pathname.startsWith("/simulation/methodology")) return <SimulationMethodologyPage />;
  if (window.location.pathname.startsWith("/simulation")) return <SimulationPage />;
  if (window.location.pathname.startsWith("/config/calibration")) return <CalibrationPage />;
  return window.location.pathname.startsWith("/config") ? <ConfigPage /> : <DashboardShell />;
}

function DashboardShell() {
  const [activeIncident, setActiveIncident] = useState<EmergencyIncident | null>(null);
  const [pendingIncidents, setPendingIncidents] = useState<EmergencyIncident[]>([]);
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);
  const [checkingIncident, setCheckingIncident] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");

  useEffect(() => {
    let mounted = true;
    dashboardApi.getActiveIncident()
      .then((incident) => {
        if (!mounted) return;
        setActiveIncident(incident);
      })
      .finally(() => {
        if (mounted) setCheckingIncident(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (checkingIncident || activeIncident) return;
    let mounted = true;
    const check = () => {
      dashboardApi.listIncidents({ status: "pending" })
        .then((incidents) => {
          if (mounted) setPendingIncidents(incidents);
        })
        .catch((error) => {
          console.warn("Pending incident polling failed", error);
        });
    };
    check();
    const timer = window.setInterval(check, 3000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [activeIncident, checkingIncident]);

  const startIncident = async (incidentId: string) => {
    setReviewing(true);
    setReviewError("");
    try {
      const incident = await dashboardApi.startIncident(incidentId);
      setPendingIncidents([]);
      setActiveIncident(incident);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "启动应急响应失败");
    } finally {
      setReviewing(false);
    }
  };

  const startAlertIncident = async (
    alert: DashboardSnapshot["alerts"][number],
    occurredAt: string,
  ) => {
    const created = await dashboardApi.createIncident({
      title: `${alert.site}${alert.type}`,
      type: "GDS报警",
      location: alert.site,
      description: `${alert.site}异常报警，报警值${alert.alarmValue}`,
      reporter: "GDS系统",
      reporterPhone: "",
      occurredAt,
    });
    const incident = await dashboardApi.startIncident(created.id);
    setPendingIncidents([]);
    setActiveIncident(incident);
  };

  const classifyNonEmergency = async (incidentId: string) => {
    setReviewing(true);
    setReviewError("");
    try {
      await dashboardApi.classifyNonEmergency(incidentId);
      setPendingIncidents((current) => current.filter((incident) => incident.id !== incidentId));
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "事件研判失败");
    } finally {
      setReviewing(false);
    }
  };

  const terminateIncident = async (incidentId: string, reasons: string[], note: string) => {
    await dashboardApi.terminateIncident(incidentId, reasons, note);
    setActiveIncident(null);
  };

  if (checkingIncident) {
    return (
      <main className="loading-screen">
        <Database size={28} />
        <span>正在检查应急事件状态</span>
      </main>
    );
  }

  const selectedPendingIncident =
    pendingIncidents.find((incident) => incident.id === selectedPendingId) ?? pendingIncidents[0] ?? null;

  return activeIncident ? (
    <EmergencyResponsePage incident={activeIncident} onTerminate={terminateIncident} />
  ) : (
    <DashboardPage
      pendingIncidents={pendingIncidents}
      selectedPendingIncident={selectedPendingIncident}
      reviewError={reviewError}
      reviewing={reviewing}
      onSelectPending={(id) => {
        setReviewError("");
        setSelectedPendingId(id);
      }}
      onNonEmergency={classifyNonEmergency}
      onRespond={startIncident}
      onAlertRespond={startAlertIncident}
    />
  );
}

function incidentTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function IncidentReviewPopup({
  incident,
  processing,
  error,
  currentIndex,
  total,
  onPrevious,
  onNext,
  onNonEmergency,
  onRespond,
}: {
  incident: EmergencyIncident;
  processing: boolean;
  error: string;
  currentIndex: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onNonEmergency: () => void;
  onRespond: () => void;
}) {
  return (
    <section className="incident-review-popup" role="dialog" aria-label="待研判事件">
      <header>
        <div>
          <Siren size={18} />
          <span>事件待研判</span>
        </div>
        <nav className="incident-review-nav" aria-label="待研判事件切换">
          <button type="button" disabled={total <= 1 || processing} onClick={onPrevious} title="上一条事件">
            <ChevronLeft size={17} />
          </button>
          <strong>{currentIndex + 1}/{total}</strong>
          <button type="button" disabled={total <= 1 || processing} onClick={onNext} title="下一条事件">
            <ChevronRight size={17} />
          </button>
        </nav>
      </header>
      <div className="incident-review-body">
        <div className="incident-review-title">
          <h2>{incident.title}</h2>
          <em>{incidentStatusLabels[incident.status]}</em>
        </div>
        <div className="incident-review-grid">
          <p><span>事件类型</span><b>{incident.type}</b></p>
          <p><span>上报时间</span><b>{incidentTime(incident.reportedAt)}</b></p>
          <p><span>事件地点</span><b>{incident.location}</b></p>
          <p><span>上报人</span><b>{incident.reporter}{incident.reporterPhone ? ` / ${incident.reporterPhone}` : ""}</b></p>
          <p className="is-wide"><span>事件描述</span><b>{incident.description}</b></p>
        </div>
        <div className="incident-review-hint">
          <AlertTriangle size={15} />
          确认为应急事件后将进入应急响应大屏
        </div>
        {error ? <div className="incident-review-error" role="alert">{error}</div> : null}
        <div className="incident-review-actions">
          <button type="button" disabled={processing} onClick={onNonEmergency} data-testid="classify-non-emergency">
            <CheckCircle2 size={15} />
            非应急事件
          </button>
          <button className="is-danger" type="button" disabled={processing} onClick={onRespond} data-testid="respond-incident">
            <Siren size={15} />
            {processing ? "正在处理" : "启动应急响应"}
          </button>
        </div>
      </div>
    </section>
  );
}

function DashboardPage({
  pendingIncidents,
  selectedPendingIncident,
  reviewing,
  reviewError,
  onSelectPending,
  onNonEmergency,
  onRespond,
  onAlertRespond,
}: {
  pendingIncidents: EmergencyIncident[];
  selectedPendingIncident: EmergencyIncident | null;
  reviewing: boolean;
  reviewError: string;
  onSelectPending: (id: string) => void;
  onNonEmergency: (id: string) => void;
  onRespond: (id: string) => void;
  onAlertRespond: (
    alert: DashboardSnapshot["alerts"][number],
    occurredAt: string,
  ) => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [routes, setRoutes] = useState<EscapeRoute[]>([]);
  const [activeLayers, setActiveLayers] = useState(initialLayers);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | undefined>();
  const [infoPopup, setInfoPopup] = useState<InfoPopupData | null>(null);
  const [externalPopup, setExternalPopup] = useState<ExternalPopupSpec | null>(null);
  const [cameraStream, setCameraStream] = useState<CameraStream | null>(null);
  const [dutyKeyword, setDutyKeyword] = useState("");
  const [dutyStaff, setDutyStaff] = useState<DutyStaff[]>([]);
  const [drillView, setDrillView] = useState<"month" | "department">("month");
  const [respondingAlertId, setRespondingAlertId] = useState("");
  const [alertResponseError, setAlertResponseError] = useState("");
  const [loading, setLoading] = useState(true);
  const materialSource = useExternalSource<MaterialRow>("materials", 20);

  useEffect(() => {
    let mounted = true;
    Promise.all([dashboardApi.getSnapshot(), dashboardApi.getMapConfig()]).then(([nextSnapshot, nextConfig]) => {
      if (!mounted) return;
      setSnapshot(nextSnapshot);
      setDutyStaff(nextSnapshot.dutyStaff);
      setPoints(nextConfig.mapPoints);
      setRoutes(nextConfig.escapeRoutes);
      setSelectedPoint(nextConfig.mapPoints.find((point) => point.id === "cam-14-4") ?? nextConfig.mapPoints[0]);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      dashboardApi.getDutyStaff(dutyKeyword).then(setDutyStaff);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [dutyKeyword]);

  useEffect(() => {
    if (selectedPoint?.layer !== "camera") {
      setCameraStream(null);
      return;
    }
    const streamUrl = typeof selectedPoint.payload.streamUrl === "string" ? selectedPoint.payload.streamUrl.trim() : "";
    if (streamUrl) {
      setCameraStream({
        id: selectedPoint.id,
        url: streamUrl,
        poster: streamUrl,
        protocol: streamUrl.endsWith(".mp4") ? "mp4" : "mock",
      });
      return;
    }
    dashboardApi.getCameraStream(selectedPoint.id).then(setCameraStream);
  }, [selectedPoint]);

  const currentTime = useClock(snapshot?.updatedAt);

  const pointCounts = useMemo(() => {
    const counts = points.reduce<Record<string, number>>((acc, point) => {
      acc[point.layer] = (acc[point.layer] ?? 0) + 1;
      return acc;
    }, {});
    counts.escapeRoute = routes.length;
    return counts;
  }, [points, routes]);

  if (!snapshot) {
    return (
      <main className="loading-screen">
        <Database size={28} />
        <span>{loading ? "应急综合展示数据加载中" : "正在启用本地预案数据"}</span>
      </main>
    );
  }

  const toggleLayer = (layer: MapLayerKey) => {
    setActiveLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const drillChartRows =
    drillView === "department" && snapshot.drillDepartmentStats?.length
      ? snapshot.drillDepartmentStats.map((row) => ({ month: row.department, plan: row.plan, done: row.done }))
      : snapshot.drillStats;
  const materialRows = materialSource.result?.data.list ?? [];

  const getApplicablePlans = (point: MapPoint) => {
    const planItems = snapshot.plans.items ?? [];
    const matchedPlans = planItems.filter((plan) => plan.applicablePointIds?.includes(point.id));
    if (matchedPlans.length > 0) return matchedPlans;
    if (point.name.includes("避难")) {
      return planItems.filter((plan) => plan.name.includes("疏散") || planTypeText(plan.type).includes("综合"));
    }
    return planItems;
  };

  const openPlanAttachmentPopup = (plan: PlanRow) => {
    const attachments = plan.attachments ?? [];

    setInfoPopup({
      title: `${plan.name}附件`,
      status: `${planTypeText(plan.type)} / ${plan.version} / ${plan.owner}`,
      statusTone: isPublishedPlanStatus(plan.status) ? "ok" : "warning",
      table: attachments.length
        ? {
            columns: ["附件名称", "类型", "版本", "更新时间"],
            rows: attachments.map((attachment) => ({
              id: attachment.id,
              cells: [
                { value: attachment.name },
                { value: attachment.type },
                { value: attachment.version },
                { value: attachment.updatedAt },
              ],
            })),
          }
        : undefined,
      rows: attachments.length ? [] : [{ label: "附件", value: "暂无附件" }],
    });
  };

  const openHazardPopup = () => {
    setInfoPopup(null);
    setExternalPopup(externalPopupSpecs.hazards);
  };

  const openDrillPopup = () => {
    setInfoPopup(null);
    setExternalPopup(externalPopupSpecs.drills);
  };

  const openMaterialPopup = () => {
    setInfoPopup(null);
    setExternalPopup(externalPopupSpecs.materials);
  };

  const openAlertPopup = (row: DashboardSnapshot["alerts"][number]) => {
    setInfoPopup({
      title: row.site,
      status: `报警值 ${row.alarmValue}`,
      statusTone: row.level === "critical" || row.level === "high" ? "danger" : "warning",
      rows: [
        { label: "报警类型", value: row.type, tone: row.level === "critical" || row.level === "high" ? "danger" : "warning" },
        { label: "报警时间", value: row.time },
        { label: "报警值", value: row.alarmValue, tone: "danger" },
      ],
    });
  };

  const respondToAlert = async (row: DashboardSnapshot["alerts"][number]) => {
    setRespondingAlertId(row.id);
    setAlertResponseError("");
    try {
      await onAlertRespond(row, `${snapshot.weather.date}T${row.time}+08:00`);
    } catch (error) {
      setAlertResponseError(error instanceof Error ? error.message : "启动应急响应失败");
      setRespondingAlertId("");
    }
  };

  const openPlanPopup = () => {
    setInfoPopup(null);
    setExternalPopup(externalPopupSpecs.dashboardPlans);
  };

  const openDutyPopup = (row: DutyStaff) => {
    setInfoPopup({
      title: row.name,
      status: row.status,
      rows: [
        { label: "部门", value: row.department },
        { label: "联系电话", value: row.phone },
        { label: "定位状态", value: row.x != null && row.y != null ? "已同步人员定位" : "未同步坐标" },
      ],
    });
  };

  const selectedPendingIndex = selectedPendingIncident
    ? pendingIncidents.findIndex((incident) => incident.id === selectedPendingIncident.id)
    : -1;
  const selectPendingOffset = (offset: number) => {
    if (selectedPendingIndex < 0 || pendingIncidents.length <= 1) return;
    const nextIndex = (selectedPendingIndex + offset + pendingIncidents.length) % pendingIncidents.length;
    onSelectPending(pendingIncidents[nextIndex].id);
  };

  return (
    <main className="dashboard">
      <div className="dashboard__glow dashboard__glow--top" />
      <Header snapshot={snapshot} currentTime={currentTime} />

      <section className="dashboard-grid">
        <aside className="side-rail side-rail--left">
          <Panel title="重大危险源" icon={<ShieldAlert size={20} />}>
            <div
              className="donut-card panel-click-area"
              role="button"
              tabIndex={0}
              onClick={openHazardPopup}
              onKeyDown={(event) => event.key === "Enter" && openHazardPopup()}
            >
              <EChart option={donutOption(snapshot.hazards.levels, snapshot.hazards.total, "处")} />
              <Legend items={snapshot.hazards.levels} total={snapshot.hazards.total} unit="处" />
            </div>
          </Panel>

          <Panel
            title="应急演练统计"
            icon={<UsersRound size={20} />}
            action={<span className="panel__unit">单位：次</span>}
          >
            <div className="drill-panel">
              <div className="segmented-tabs drill-tabs" role="tablist" aria-label="应急演练统计维度">
                <button
                  className={drillView === "month" ? "is-active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={drillView === "month"}
                  onClick={() => setDrillView("month")}
                >
                  月度统计
                </button>
                <button
                  className={drillView === "department" ? "is-active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={drillView === "department"}
                  onClick={() => setDrillView("department")}
                >
                  部门统计
                </button>
              </div>
              <div
                className="panel-click-area chart-click-area drill-chart-area"
                role="button"
                tabIndex={0}
                onClick={openDrillPopup}
                onKeyDown={(event) => event.key === "Enter" && openDrillPopup()}
              >
                <EChart className="bar-chart" option={barOption(drillChartRows)} />
              </div>
            </div>
          </Panel>

          <Panel title="应急物资信息" icon={<PackageCheck size={20} />} className="panel--large">
            {materialSource.result?.stale ? (
              <div className="external-source-note external-source-note--stale">第三方接口异常，正在展示最近成功数据</div>
            ) : null}
            <table className="data-table" onClick={() => openMaterialPopup()}>
              <thead>
                <tr>
                  <th>物资名称</th>
                  <th>位置</th>
                  <th>有效期</th>
                  <th>责任人</th>
                </tr>
              </thead>
              <tbody>
                {materialRows.map((row) => {
                  const expiryState = row.expiryStatus === "expired" ? "expired" : "warning";
                  const expiryText = row.expiryStatus === "expired" ? "已过期" : "即将到期";
                  return (
                  <tr
                    key={row.id}
                    className="data-row data-row--interactive"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!openThirdPartyDetail(row.detailUrl)) openMaterialPopup();
                    }}
                  >
                    <td>{row.name}</td>
                    <td>{row.location}</td>
                    <td>
                      <span className={`expiry expiry--${expiryState}`}>
                        {row.expireAt}
                        <em>{expiryText}</em>
                      </span>
                    </td>
                    <td>{row.owner}</td>
                  </tr>
                  );
                })}
                {materialSource.loading ? (
                  <tr><td className="external-source-empty" colSpan={4}>正在加载第三方物资数据</td></tr>
                ) : null}
                {!materialSource.loading && materialSource.error ? (
                  <tr><td className="external-source-empty is-error" colSpan={4}>{materialSource.error}</td></tr>
                ) : null}
                {!materialSource.loading && !materialSource.error && materialRows.length === 0 ? (
                  <tr><td className="external-source-empty" colSpan={4}>暂无临期或过期物资</td></tr>
                ) : null}
              </tbody>
            </table>
          </Panel>
        </aside>

        <section className="map-column">
          <WarningTicker warnings={snapshot.weatherWarning} />
          <div className="map-card">
            <MapStage
              activeLayers={activeLayers}
              points={points}
              routes={routes}
              selectedPointId={selectedPoint?.id}
              onSelectPoint={setSelectedPoint}
            />
            <LayerControl
              activeLayers={activeLayers}
              pointCounts={pointCounts}
              onToggle={toggleLayer}
            />
            {selectedPoint?.layer === "plan" ? (
              <PlanPointPopup
                point={selectedPoint}
                plans={getApplicablePlans(selectedPoint)}
                onViewAttachments={openPlanAttachmentPopup}
                onClose={() => setSelectedPoint(undefined)}
              />
            ) : null}
            {selectedPoint && selectedPoint.layer !== "camera" && selectedPoint.layer !== "plan" ? (
              <DetailPopup point={selectedPoint} onClose={() => setSelectedPoint(undefined)} />
            ) : null}
            {selectedPoint?.layer === "camera" && cameraStream ? (
              <VideoPopup
                point={selectedPoint}
                stream={cameraStream}
                onClose={() => setSelectedPoint(undefined)}
              />
            ) : null}
            {selectedPendingIncident ? (
              <IncidentReviewPopup
                incident={selectedPendingIncident}
                processing={reviewing}
                error={reviewError}
                currentIndex={Math.max(selectedPendingIndex, 0)}
                total={pendingIncidents.length}
                onPrevious={() => selectPendingOffset(-1)}
                onNext={() => selectPendingOffset(1)}
                onNonEmergency={() => onNonEmergency(selectedPendingIncident.id)}
                onRespond={() => onRespond(selectedPendingIncident.id)}
              />
            ) : null}
          </div>
        </section>

        <aside className="side-rail side-rail--right">
          <Panel title="有毒有害实时报警信息" icon={<MonitorDot size={20} />}>
            {alertResponseError ? <div className="alert-response-error" role="alert">{alertResponseError}</div> : null}
            <table className="data-table alert-table">
              <thead>
                <tr>
                  <th>点位名称</th>
                  <th>报警类型</th>
                  <th>时间</th>
                  <th>报警值</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.alerts.map((row) => (
                  <tr
                    key={row.id}
                    className="data-row data-row--interactive"
                    onClick={() => openAlertPopup(row)}
                  >
                    <td>
                      <span className={`alert-dot alert-dot--${row.level}`} />
                      {row.site}
                    </td>
                    <td>{row.type}</td>
                    <td>{row.time}</td>
                    <td className="alarm-value">{row.alarmValue}</td>
                    <td>
                      <button
                        className="alert-response-button"
                        type="button"
                        disabled={Boolean(respondingAlertId)}
                        onClick={(event) => {
                          event.stopPropagation();
                          void respondToAlert(row);
                        }}
                        title={`响应${row.site}报警`}
                      >
                        {respondingAlertId === row.id ? "启动中" : "响应"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="预案分类分布" icon={<RadioTower size={20} />}>
            <div
              className="donut-card donut-card--plan panel-click-area"
              role="button"
              tabIndex={0}
              onClick={openPlanPopup}
              onKeyDown={(event) => event.key === "Enter" && openPlanPopup()}
            >
              <EChart option={donutOption(snapshot.plans.categories, snapshot.plans.total, "份")} />
              <Legend items={snapshot.plans.categories} total={snapshot.plans.total} unit="份" />
            </div>
          </Panel>

          <Panel title="值班信息" icon={<UsersRound size={20} />} className="panel--duty">
            <label className="search-box">
              <input
                value={dutyKeyword}
                onChange={(event) => setDutyKeyword(event.target.value)}
                placeholder="搜索值班人员"
                data-testid="duty-search"
              />
              <Search size={18} />
            </label>
            <table className="data-table duty-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>部门</th>
                  <th>联系电话</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {dutyStaff.map((row) => (
                  <tr
                    key={row.id}
                    className="data-row data-row--interactive"
                    onClick={() => openDutyPopup(row)}
                  >
                    <td>{row.name}</td>
                    <td>{row.department}</td>
                    <td>{row.phone}</td>
                    <td className="state state--ok">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </aside>
      </section>

      <div className={`live-pill live-pill--${snapshot.liveState}`}>
        <Database size={14} />
        {statusText(snapshot.liveState)}
      </div>
      <a className="incident-switch incident-switch--start" href="/events">
        <ClipboardList size={16} />
        事件管理
      </a>
      {infoPopup ? <InfoPopup popup={infoPopup} onClose={() => setInfoPopup(null)} /> : null}
      {externalPopup ? <ExternalDataPopup spec={externalPopup} onClose={() => setExternalPopup(null)} /> : null}
    </main>
  );
}

function EmergencyResponsePage({
  incident,
  onTerminate,
}: {
  incident: EmergencyIncident;
  onTerminate: (incidentId: string, reasons: string[], note: string) => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<EmergencyResponseSnapshot | null>(null);
  const [activeLayers, setActiveLayers] = useState(responseInitialLayers);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | undefined>();
  const [selectedVideo, setSelectedVideo] = useState<VideoChannel | null>(null);
  const [infoPopup, setInfoPopup] = useState<InfoPopupData | null>(null);
  const [plans, setPlans] = useState<RelatedPlan[]>([]);
  const [displayedChemicalIds, setDisplayedChemicalIds] = useState<string[]>([]);
  const [activeChemicalIndex, setActiveChemicalIndex] = useState(0);
  const [displayedCaseIds, setDisplayedCaseIds] = useState<string[]>([]);
  const [activeCaseIndex, setActiveCaseIndex] = useState(0);
  const [displayedPlanIds, setDisplayedPlanIds] = useState<string[]>([]);
  const [displayedVideoIds, setDisplayedVideoIds] = useState<string[]>([]);
  const [selectionPopup, setSelectionPopup] = useState<"chemicals" | "cases" | "plans" | "videos" | null>(null);
  const [terminating, setTerminating] = useState(false);
  const [terminationOpen, setTerminationOpen] = useState(false);
  const [selectedTerminationReasons, setSelectedTerminationReasons] = useState<string[]>([]);
  const [terminationNote, setTerminationNote] = useState("");
  const [terminationError, setTerminationError] = useState("");
  const chemicalSource = useExternalSource<MsdsRecord>("chemicals", 100);
  const caseSource = useExternalSource<EmergencyResponseSnapshot["cases"][number]>("cases", 100);
  const responsePlanSource = useExternalSource<RelatedPlan>("responsePlans", 100);

  useEffect(() => {
    let mounted = true;
    Promise.all([dashboardApi.getEmergencyResponseSnapshot(incident.id), dashboardApi.getMapConfig()]).then(([nextSnapshot, mapConfig]) => {
      if (!mounted) return;
      const responseSnapshot: EmergencyResponseSnapshot = {
        ...nextSnapshot,
        incident,
        mapPoints: mapConfig.mapPoints,
        escapeRoutes: mapConfig.escapeRoutes,
      };
      const defaultVideo =
        nextSnapshot.videoChannels.find((channel) => channel.id === nextSnapshot.defaultCameraId) ??
        nextSnapshot.videoChannels[0] ??
        null;
      const defaultPoint =
        mapConfig.mapPoints.find((point) => point.id === "cam-14-4") ??
        mapConfig.mapPoints.find((point) => point.layer === "camera") ??
        mapConfig.mapPoints[0];

      setSnapshot(responseSnapshot);
      setDisplayedVideoIds(nextSnapshot.videoChannels.slice(0, 4).map((channel) => channel.id));
      setSelectedVideo(defaultVideo);
      setSelectedPoint(defaultPoint);
    });
    return () => {
      mounted = false;
    };
  }, [incident.id]);

  useEffect(() => {
    const nextPlans = responsePlanSource.result?.data.list;
    if (!nextPlans) return;
    setPlans(nextPlans);
    setDisplayedPlanIds(nextPlans.slice(0, 5).map((plan) => plan.id));
  }, [responsePlanSource.result]);

  useEffect(() => {
    const nextChemicals = chemicalSource.result?.data.list;
    if (!nextChemicals || displayedChemicalIds.length) return;
    setDisplayedChemicalIds(nextChemicals.slice(0, 1).map((record) => record.id));
  }, [chemicalSource.result, displayedChemicalIds.length]);

  useEffect(() => {
    const nextCases = caseSource.result?.data.list;
    if (!nextCases || displayedCaseIds.length) return;
    setDisplayedCaseIds(nextCases.slice(0, 1).map((record) => record.id));
  }, [caseSource.result, displayedCaseIds.length]);

  const currentTime = useClock(snapshot?.updatedAt);

  const pointCounts = useMemo(() => {
    if (!snapshot) return {};
    const counts = snapshot.mapPoints.reduce<Record<string, number>>((acc, point) => {
      acc[point.layer] = (acc[point.layer] ?? 0) + 1;
      return acc;
    }, {});
    counts.escapeRoute = snapshot.escapeRoutes.length;
    return counts;
  }, [snapshot]);

  if (!snapshot) {
    return (
      <main className="loading-screen">
        <Database size={28} />
        <span>应急响应数据加载中</span>
      </main>
    );
  }

  const toggleLayer = (layer: MapLayerKey) => {
    setActiveLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const selectMapPoint = (point: MapPoint) => {
    setSelectedPoint(point);
    if (point.layer !== "camera") return;
    const channel = snapshot.videoChannels.find((item) => item.pointId === point.id);
    if (channel) setSelectedVideo(channel);
  };

  const selectVideoChannel = (channel: VideoChannel) => {
    setSelectedVideo(channel);
    setSelectedPoint(snapshot.mapPoints.find((point) => point.id === channel.pointId));
  };

  const displayedPlans = plans.filter((plan) => displayedPlanIds.includes(plan.id));
  const displayedVideos = snapshot.videoChannels.filter((channel) => displayedVideoIds.includes(channel.id)).slice(0, 4);
  const msdsRecords = chemicalSource.result?.data.list ?? [];
  const caseRecords = caseSource.result?.data.list ?? [];
  const displayedChemicals = msdsRecords.filter((record) => displayedChemicalIds.includes(record.id));
  const displayedCases = caseRecords.filter((record) => displayedCaseIds.includes(record.id));
  const activeMsds = displayedChemicals[activeChemicalIndex] ?? displayedChemicals[0];
  const activeCase = displayedCases[activeCaseIndex] ?? displayedCases[0];
  const currentVideoPoint =
    selectedPoint?.layer === "camera"
      ? selectedPoint
      : snapshot.mapPoints.find((point) => point.id === selectedVideo?.pointId) ?? snapshot.mapPoints[0];
  const currentVideoStream = selectedVideo ? makeVideoStream(selectedVideo) : null;
  const simulationSourcePoint =
    snapshot.mapPoints.find((point) => point.layer === "hazard" && point.name.includes(snapshot.incident.location)) ??
    snapshot.mapPoints.find((point) => point.layer === "hazard");

  const switchChemical = (offset: number) => {
    if (displayedChemicals.length <= 1) return;
    setActiveChemicalIndex((current) => (current + offset + displayedChemicals.length) % displayedChemicals.length);
  };

  const switchCase = (offset: number) => {
    if (displayedCases.length <= 1) return;
    setActiveCaseIndex((current) => (current + offset + displayedCases.length) % displayedCases.length);
  };

  const openPlanPopup = (plan: RelatedPlan) => {
    if (openThirdPartyDetail(plan.detailUrl)) return;
    setInfoPopup({
      title: plan.name,
      status: `${plan.category} / ${plan.level} / ${plan.owner}`,
      statusTone: plan.status === "已启动" ? "ok" : "warning",
      rows: [
        { label: "责任部门", value: plan.owner },
        { label: "当前状态", value: plan.status },
      ],
    });
  };

  const startPlan = (plan: RelatedPlan) => {
    setPlans((prev) => prev.map((item) => (item.id === plan.id ? { ...item, status: "已启动" } : item)));
    setInfoPopup({
      title: plan.name,
      status: "已启动",
      statusTone: "ok",
      rows: [
        { label: "启动时间", value: currentTime },
        { label: "联动对象", value: "应急指挥中心 / 现场处置组" },
        { label: "处置目标", value: "封控泄漏源、人员疏散、浓度监测" },
      ],
    });
  };

  const openMsdsPopup = (record: MsdsRecord) => {
    setInfoPopup({
      title: `${record.name}（MSDS）`,
      status: record.hazardClass,
      statusTone: "danger",
      rows: [
        { label: "别名", value: record.alias },
        { label: "危险描述", value: record.danger, tone: "danger" },
        { label: "应急措施", value: record.emergencyMeasure },
        { label: "处置补充", value: record.detail },
      ],
    });
  };

  const openAlarmPopup = (alarm: IncidentAlarm) => {
    setInfoPopup({
      title: alarm.name,
      status: alarm.status,
      statusTone: alarm.level === "critical" ? "danger" : "warning",
      rows: [
        { label: "报警区域", value: alarm.area },
        { label: "报警类型", value: alarm.type },
        { label: "报警时间", value: alarm.time },
        { label: "报警描述", value: alarm.description },
      ],
    });
  };

  const terminate = async () => {
    setTerminating(true);
    setTerminationError("");
    try {
      await onTerminate(incident.id, selectedTerminationReasons, terminationNote);
    } catch (error) {
      setTerminationError(error instanceof Error ? error.message : "终止应急响应失败");
      setTerminating(false);
    }
  };

  return (
    <main className="dashboard dashboard--response">
      <div className="dashboard__glow dashboard__glow--top" />
      <Header snapshot={snapshot} currentTime={currentTime} />

      <section className="dashboard-grid response-grid">
        <aside className="side-rail side-rail--left response-rail response-rail--left">
          <Panel title="天气信息" icon={<CloudSun size={20} />}>
            <div className="weather-metric-grid">
              {snapshot.weatherMetrics.map((metric) => (
                <div className="weather-metric" key={metric.id}>
                  <span className="weather-metric__icon">{weatherMetricIcon(metric)}</span>
                  <span>{metric.label}</span>
                  <b>{metric.value}</b>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="事故信息描述" icon={<Crosshair size={20} />}>
            <div className="incident-summary">
              <p>
                <span>事故类型：</span>
                <b>{snapshot.incident.type}</b>
              </p>
              <p>
                <span>地址：</span>
                {snapshot.incident.address}
              </p>
              <p>
                <span>时间：</span>
                {incidentTime(snapshot.incident.type === "GDS报警" ? snapshot.incident.reportedAt : snapshot.incident.startedAt)}
              </p>
              <p className="incident-summary__copy">
                <span>事件描述：</span>
                {snapshot.incident.description}
              </p>
            </div>
          </Panel>

          <Panel
            title="化学特性（MSDS）"
            icon={<FlaskConical size={20} />}
            action={
              <PanelIconButton
                title="新增化学品"
                onClick={() => {
                  setInfoPopup(null);
                  setSelectionPopup("chemicals");
                }}
              />
            }
          >
            <div className="msds-panel">
              {chemicalSource.result?.stale ? (
                <div className="external-source-note external-source-note--stale">化学品数据为最近成功缓存</div>
              ) : null}
              {activeMsds ? (
                <div className="msds-card">
                  <div className="card-switcher">
                    <button type="button" onClick={() => switchChemical(-1)} disabled={displayedChemicals.length <= 1} title="上一种化学品">
                      <ChevronLeft size={18} />
                    </button>
                    <span>{activeChemicalIndex + 1}/{displayedChemicals.length}</span>
                    <button type="button" onClick={() => switchChemical(1)} disabled={displayedChemicals.length <= 1} title="下一种化学品">
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  <p>
                    <span>化学品名称：</span>
                    {activeMsds.name}
                  </p>
                  <p>
                    <span>别名：</span>
                    {activeMsds.alias}
                  </p>
                  <p>
                    <span>危险类别：</span>
                    <b>{activeMsds.hazardClass}</b>
                  </p>
                  <p>
                    <span>危险描述：</span>
                    {activeMsds.danger}
                  </p>
                  <p>
                    <span>应急处置：</span>
                    {activeMsds.emergencyMeasure}
                  </p>
                  <button type="button" onClick={() => {
                    if (!openThirdPartyDetail(activeMsds.detailUrl)) openMsdsPopup(activeMsds);
                  }}>
                    查看详情
                  </button>
                </div>
              ) : chemicalSource.loading ? (
                <div className="empty-hint">正在加载第三方化学品数据</div>
              ) : chemicalSource.error ? (
                <div className="empty-hint external-empty-error">{chemicalSource.error}</div>
              ) : (
                <div className="empty-hint">未选择化学品</div>
              )}
            </div>
          </Panel>

          <Panel
            title="典型案例"
            icon={<BookOpen size={20} />}
            action={
              <PanelIconButton
                title="新增案例"
                onClick={() => {
                  setInfoPopup(null);
                  setSelectionPopup("cases");
                }}
              />
            }
          >
            <div className="case-list">
              {caseSource.result?.stale ? (
                <div className="external-source-note external-source-note--stale">案例数据为最近成功缓存</div>
              ) : null}
              {activeCase ? (
                <article className="case-card" key={activeCase.id}>
                  <div className="card-switcher">
                    <button type="button" onClick={() => switchCase(-1)} disabled={displayedCases.length <= 1} title="上一个案例">
                      <ChevronLeft size={18} />
                    </button>
                    <span>{activeCaseIndex + 1}/{displayedCases.length}</span>
                    <button type="button" onClick={() => switchCase(1)} disabled={displayedCases.length <= 1} title="下一个案例">
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  <p>
                    <span>案例名称：</span>
                    {activeCase.title}
                  </p>
                  <p>
                    <span>事故类型：</span>
                    <b>{activeCase.accidentType}</b>
                  </p>
                  <p>
                    <span>事故级别：</span>
                    <strong>{activeCase.level}</strong>
                  </p>
                  <p>
                    <span>事故描述：</span>
                    {activeCase.occurredAt}，{activeCase.summary}
                  </p>
                  <button type="button" onClick={() => {
                    if (!openThirdPartyDetail(activeCase.detailUrl)) setInfoPopup(caseToPopup(activeCase));
                  }}>
                    查看详情
                  </button>
                </article>
              ) : null}
              {caseSource.loading ? <div className="empty-hint">正在加载第三方案例数据</div> : null}
              {!caseSource.loading && caseSource.error ? (
                <div className="empty-hint external-empty-error">{caseSource.error}</div>
              ) : null}
              {!caseSource.loading && !caseSource.error && !activeCase ? (
                <div className="empty-hint">未选择典型案例</div>
              ) : null}
            </div>
          </Panel>
        </aside>

        <section className="map-column response-map-column">
          <WarningTicker warnings={snapshot.weatherWarning} />
          <div className="map-card response-map-card">
            <MapStage
              activeLayers={activeLayers}
              points={snapshot.mapPoints}
              routes={snapshot.escapeRoutes}
              selectedPointId={selectedPoint?.id}
              onSelectPoint={selectMapPoint}
            />
            <LayerControl
              activeLayers={activeLayers}
              pointCounts={pointCounts}
              onToggle={toggleLayer}
              layers={responseLayerOrder}
            />
            {selectedPoint && selectedPoint.layer !== "camera" ? (
              <DetailPopup point={selectedPoint} onClose={() => setSelectedPoint(undefined)} />
            ) : null}
            {selectedPoint?.layer === "camera" && currentVideoStream && currentVideoPoint ? (
              <VideoPopup
                point={currentVideoPoint}
                stream={currentVideoStream}
                onClose={() => setSelectedPoint(undefined)}
              />
            ) : null}
          </div>
        </section>

        <aside className="side-rail side-rail--right response-rail response-rail--right">
          <Panel
            title="相关预案"
            icon={<FileText size={20} />}
            action={
              <PanelIconButton
                title="选择展示预案"
                onClick={() => {
                  setInfoPopup(null);
                  setSelectionPopup("plans");
                }}
              />
            }
          >
            <div className="plan-list">
              {responsePlanSource.result?.stale ? (
                <div className="external-source-note external-source-note--stale">预案数据为最近成功缓存</div>
              ) : null}
              {displayedPlans.map((plan) => (
                <div className="plan-row" key={plan.id}>
                  <span>{plan.name}</span>
                  <button type="button" onClick={() => openPlanPopup(plan)}>
                    查看
                  </button>
                  <i />
                  <button
                    className={plan.status === "已启动" ? "is-started" : ""}
                    type="button"
                    onClick={() => startPlan(plan)}
                  >
                    {plan.status === "已启动" ? "已启动" : "启动"}
                  </button>
                </div>
              ))}
              {responsePlanSource.loading ? <div className="empty-hint">正在加载第三方预案数据</div> : null}
              {!responsePlanSource.loading && responsePlanSource.error ? (
                <div className="empty-hint external-empty-error">{responsePlanSource.error}</div>
              ) : null}
              {!responsePlanSource.loading && !responsePlanSource.error && displayedPlans.length === 0 ? (
                <div className="empty-hint">暂无可展示预案</div>
              ) : null}
            </div>
          </Panel>

          <Panel title="报警信息" icon={<MonitorDot size={20} />} action={<PanelIconButton title="新增报警" />}>
            <table className="data-table response-alert-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>区域</th>
                  <th>类型</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.alarms.map((alarm) => (
                  <tr key={alarm.id} className="data-row data-row--interactive" onClick={() => openAlarmPopup(alarm)}>
                    <td>{alarm.name}</td>
                    <td>{alarm.area}</td>
                    <td>{alarm.type}</td>
                    <td>{alarm.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel
            title="视频监控"
            icon={<Camera size={20} />}
            action={
              <PanelIconButton
                title="选择固定摄像头"
                onClick={() => {
                  setInfoPopup(null);
                  setSelectionPopup("videos");
                }}
              />
            }
          >
            <div className="video-grid">
              {displayedVideos.map((channel) => (
                <button
                  className={`video-tile ${selectedVideo?.id === channel.id ? "is-active" : ""}`}
                  key={channel.id}
                  type="button"
                  onClick={() => selectVideoChannel(channel)}
                  data-testid={`video-${channel.id}`}
                >
                  <img src={channel.poster} alt={channel.name} />
                  <PlayCircle size={34} />
                  <span>{channel.name}</span>
                </button>
              ))}
              {displayedVideos.length === 0 ? <div className="empty-hint">未固定摄像头</div> : null}
            </div>
          </Panel>
        </aside>
      </section>

      <div className={`live-pill live-pill--${snapshot.liveState}`}>
        <Database size={14} />
        {statusText(snapshot.liveState)}
      </div>
      <button
        className="incident-switch incident-switch--terminate"
        type="button"
        onClick={() => setTerminationOpen(true)}
        disabled={terminating}
        data-testid="terminate-incident"
      >
        <Power size={16} />
        {terminating ? "终止中" : "终止应急"}
      </button>
      <a
        className="incident-switch incident-switch--simulation"
        href={`/simulation?incidentId=${encodeURIComponent(incident.id)}&substance=${encodeURIComponent(incident.substance)}${simulationSourcePoint ? `&mapX=${simulationSourcePoint.x}&mapY=${simulationSourcePoint.y}` : ""}`}
      >
        <FlaskConical size={16} />
        事故模拟
      </a>
      {infoPopup ? <InfoPopup popup={infoPopup} onClose={() => setInfoPopup(null)} /> : null}
      {selectionPopup === "chemicals" ? (
        <ChemicalSelectionPopup
          records={msdsRecords}
          selectedIds={displayedChemicalIds}
          onClose={() => setSelectionPopup(null)}
          onChange={(ids) => {
            setDisplayedChemicalIds(ids);
            setActiveChemicalIndex(0);
          }}
        />
      ) : null}
      {selectionPopup === "cases" ? (
        <CaseSelectionPopup
          records={caseRecords}
          selectedIds={displayedCaseIds}
          onClose={() => setSelectionPopup(null)}
          onChange={(ids) => {
            setDisplayedCaseIds(ids);
            setActiveCaseIndex(0);
          }}
        />
      ) : null}
      {selectionPopup === "plans" ? (
        <PlanSelectionPopup
          plans={plans}
          selectedIds={displayedPlanIds}
          onClose={() => setSelectionPopup(null)}
          onChange={setDisplayedPlanIds}
        />
      ) : null}
      {selectionPopup === "videos" ? (
        <VideoSelectionPopup
          channels={snapshot.videoChannels}
          selectedIds={displayedVideoIds}
          onClose={() => setSelectionPopup(null)}
          onConfirm={(ids) => {
            setDisplayedVideoIds(ids);
            if (selectedVideo && !ids.includes(selectedVideo.id)) {
              const nextVideo = snapshot.videoChannels.find((channel) => channel.id === ids[0]) ?? null;
              setSelectedVideo(nextVideo);
              setSelectedPoint(nextVideo ? snapshot.mapPoints.find((point) => point.id === nextVideo.pointId) : undefined);
            }
            setSelectionPopup(null);
          }}
        />
      ) : null}
      {terminationOpen ? (
        <TerminationDialog
          selectedReasons={selectedTerminationReasons}
          note={terminationNote}
          error={terminationError}
          submitting={terminating}
          onChangeReasons={setSelectedTerminationReasons}
          onChangeNote={setTerminationNote}
          onClose={() => {
            if (!terminating) setTerminationOpen(false);
          }}
          onConfirm={terminate}
        />
      ) : null}
    </main>
  );
}

function weatherMetricIcon(metric: WeatherMetric) {
  if (metric.id === "temp") return <Thermometer size={34} />;
  if (metric.id === "humidity") return <Droplets size={34} />;
  if (metric.id === "wind-speed") return <Wind size={34} />;
  if (metric.id === "wind-direction") return <Fan size={34} />;
  if (metric.id === "pressure") return <Gauge size={34} />;
  return <CloudSun size={34} />;
}

function makeVideoStream(channel: VideoChannel): CameraStream {
  return {
    id: channel.id,
    url: channel.streamUrl,
    poster: channel.streamUrl,
    protocol: channel.protocol,
    capturedAt: channel.capturedAt,
  };
}

function caseToPopup(item: EmergencyResponseSnapshot["cases"][number]): InfoPopupData {
  return {
    title: item.title,
    status: item.level,
    statusTone: "warning",
    rows: [
      { label: "事故类型", value: item.accidentType, tone: "danger" },
      { label: "发生时间", value: item.occurredAt },
      { label: "处置参考", value: item.summary },
    ],
  };
}

function PanelIconButton({ title, onClick }: { title: string; onClick?: () => void }) {
  return (
    <button className="panel-icon-button" type="button" title={title} aria-label={title} onClick={onClick}>
      <Plus size={20} />
    </button>
  );
}

function useDragOffset() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    style: { transform: `translate(${offset.x}px, ${offset.y}px)` },
    titleProps: {
      onPointerDown: startDrag,
      onPointerMove: moveDrag,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}

function Header({ snapshot, currentTime }: { snapshot: HeaderData; currentTime: string }) {
  return (
    <header className="topbar">
      <div className="topbar__weather">
        <CloudSun size={30} />
        <span>{snapshot.weather.condition}</span>
        <span className="divider" />
        <span>{snapshot.weather.temperature}</span>
        <span>{snapshot.weather.wind}</span>
        <span>
          空气优 <b>{snapshot.weather.airQuality}</b>
        </span>
      </div>

      <div className="topbar__title">
        <span>应急管理综合展示平台</span>
      </div>

      <div className="topbar__clock">
        <span>{snapshot.weather.date}</span>
        <span>{snapshot.weather.weekday}</span>
        <strong>{currentTime}</strong>
      </div>
    </header>
  );
}

function WarningTicker({ warnings }: { warnings: string[] }) {
  const warningText = `异常天气预警： ${warnings.join("  |  ")}`;
  return (
    <div className="warning-ticker">
      <AlertTriangle size={30} />
      <div className="warning-ticker__track">
        <div className="warning-ticker__marquee">
          <span>{warningText}</span>
          <span aria-hidden="true">{warningText}</span>
        </div>
      </div>
      <span className="warning-ticker__arrows">{">>>"}</span>
    </div>
  );
}

function Legend({ items, total, unit }: { items: { name: string; value: number; color: string }[]; total: number; unit: string }) {
  return (
    <div className="legend-list">
      {items.map((item) => {
        const percent = Math.round((item.value / total) * 100);
        return (
          <div className="legend-item" key={item.name}>
            <span className="legend-swatch" style={{ backgroundColor: item.color }} />
            <span>{item.name}</span>
            <b>{item.value}</b>
            <span>
              {unit}（{percent}%）
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LayerControl({
  activeLayers,
  pointCounts,
  onToggle,
  layers = layerOrder,
}: {
  activeLayers: Record<MapLayerKey, boolean>;
  pointCounts: Record<string, number>;
  onToggle: (layer: MapLayerKey) => void;
  layers?: MapLayerKey[];
}) {
  return (
    <div className="layer-box">
      <div className="layer-box__title">
        <Layers size={20} />
        图层
      </div>
      {layers.map((layer) => (
        <button
          className={`layer-row ${activeLayers[layer] ? "is-active" : ""}`}
          key={layer}
          type="button"
          data-testid={`layer-${layer}`}
          onClick={() => onToggle(layer)}
        >
          <span className="layer-check" />
          <span className="layer-label">{layerLabels[layer]}</span>
          <em>{pointCounts[layer] ?? 0}</em>
        </button>
      ))}
    </div>
  );
}

function DetailPopup({ point, onClose }: { point: MapPoint; onClose: () => void }) {
  const drag = useDragOffset();

  return (
    <div className="detail-popup" style={drag.style}>
      <div className="floating-title floating-title--draggable" {...drag.titleProps}>
        <MapPinned size={18} />
        {point.name}
        <button type="button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>
      <div className="detail-popup__body">
        <div className="detail-popup__status">{point.status ?? "状态正常"}</div>
        {Object.entries(point.payload).map(([key, value]) => (
          <div className="detail-row" key={key}>
            <span>{key}</span>
            <b>{String(value)}</b>
          </div>
        ))}
        {point.detailUrl ? <button className="detail-link" type="button">查看详情</button> : null}
      </div>
    </div>
  );
}

function PlanPointPopup({
  point,
  plans,
  onViewAttachments,
  onClose,
}: {
  point: MapPoint;
  plans: PlanRow[];
  onViewAttachments: (plan: PlanRow) => void;
  onClose: () => void;
}) {
  const drag = useDragOffset();

  return (
    <div className="detail-popup plan-point-popup" style={drag.style}>
      <div className="floating-title floating-title--draggable" {...drag.titleProps}>
        <MapPinned size={18} />
        {point.name}
        <button type="button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>
      <div className="plan-point-popup__body">
        <div className="detail-popup__status">适用预案 {plans.length} 份</div>
        <div className="plan-point-list">
          {plans.map((plan) => (
            <div className="plan-point-row" key={plan.id}>
              <span className="plan-point-row__main">
                <b>{plan.name}</b>
                <em>{planTypeText(plan.type)} / {plan.version} / {plan.owner}</em>
              </span>
              <strong className={isPublishedPlanStatus(plan.status) ? "is-ok" : "is-warning"}>{planStatusText(plan.status)}</strong>
              <button type="button" onClick={() => onViewAttachments(plan)}>
                查看
              </button>
            </div>
          ))}
          {plans.length === 0 ? <div className="empty-hint">暂无适用预案</div> : null}
        </div>
      </div>
    </div>
  );
}

function TerminationDialog({
  selectedReasons,
  note,
  error,
  submitting,
  onChangeReasons,
  onChangeNote,
  onClose,
  onConfirm,
}: {
  selectedReasons: string[];
  note: string;
  error: string;
  submitting: boolean;
  onChangeReasons: (reasons: string[]) => void;
  onChangeNote: (note: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const toggleReason = (reason: string) => {
    onChangeReasons(
      selectedReasons.includes(reason)
        ? selectedReasons.filter((item) => item !== reason)
        : [...selectedReasons, reason],
    );
  };

  return (
    <div className="termination-mask">
      <section className="termination-dialog" role="dialog" aria-modal="true" aria-label="事故终止">
        <header>
          <div><Power size={20} /><span>事故终止</span></div>
          <button type="button" onClick={onClose} disabled={submitting} title="关闭"><X size={20} /></button>
        </header>
        <div className="termination-body">
          <p><em>*</em> 终止条件 <span>（满足以下任一条件即可终止）</span></p>
          <div className="termination-reasons">
            {terminationReasons.map((reason) => {
              const checked = selectedReasons.includes(reason);
              return (
                <label className={checked ? "is-checked" : ""} key={reason}>
                  <input checked={checked} type="checkbox" onChange={() => toggleReason(reason)} />
                  <span>{checked ? <CheckCircle2 size={17} /> : null}</span>
                  <b>{reason}</b>
                </label>
              );
            })}
          </div>
          <label className="termination-note">
            <span>补充说明</span>
            <textarea
              maxLength={500}
              value={note}
              onChange={(event) => onChangeNote(event.target.value)}
              placeholder="请输入终止事件的补充说明（选填）"
              data-testid="termination-note"
            />
          </label>
          {error ? <div className="termination-error" role="alert">{error}</div> : null}
          <div className="termination-actions">
            <button type="button" onClick={onClose} disabled={submitting}>取消</button>
            <button
              className="is-danger"
              type="button"
              disabled={!selectedReasons.length || submitting}
              onClick={onConfirm}
              data-testid="confirm-termination"
            >
              {submitting ? "正在终止" : "确认终止"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PlanSelectionPopup({
  plans,
  selectedIds,
  onChange,
  onClose,
}: {
  plans: RelatedPlan[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [keyword, setKeyword] = useState("");

  const togglePlan = (id: string) => {
    const nextIds = new Set(selectedIds.length ? selectedIds : plans.slice(0, 1).map((plan) => plan.id));
    if (nextIds.has(id)) {
      if (nextIds.size <= 1) return;
      nextIds.delete(id);
    } else {
      nextIds.add(id);
    }
    onChange(plans.filter((plan) => nextIds.has(plan.id)).map((plan) => plan.id));
  };

  const keywordText = keyword.trim().toLocaleLowerCase();
  const visiblePlans = keywordText
    ? plans.filter((plan) => plan.name.toLocaleLowerCase().includes(keywordText))
    : plans;

  return (
    <div className="panel-popup panel-popup--table selection-popup">
      <div className="floating-title">
        <FileText size={18} />
        选择展示预案
        <button type="button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>
      <div className="selection-popup__body">
        <label className="search-box selection-search">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="请输入预案名称搜索"
            data-testid="plan-selector-search"
          />
          <Search size={17} />
        </label>
        <div className="selection-popup__status">已选择 {selectedIds.length} 份，点击即更新页面展示，至少保留 1 份</div>
        <div className="selection-list">
          {visiblePlans.map((plan) => {
            const checked = selectedIds.includes(plan.id);
            return (
              <label className={`selection-row ${checked ? "is-checked" : ""}`} key={plan.id}>
                <input
                  checked={checked}
                  disabled={checked && selectedIds.length === 1}
                  type="checkbox"
                  onChange={() => togglePlan(plan.id)}
                />
                <span className="selection-row__check">{checked ? <CheckCircle2 size={17} /> : null}</span>
                <span className="selection-row__main">
                  <b>{plan.name}</b>
                  <em>{shortPlanTypeText(plan.category)}</em>
                </span>
                <strong className={isPublishedPlanStatus(plan.status) || plan.status === "已启动" ? "is-ok" : ""}>
                  {planStatusText(plan.status)}
                </strong>
              </label>
            );
          })}
          {visiblePlans.length === 0 ? <div className="empty-hint">未找到匹配预案</div> : null}
        </div>
      </div>
    </div>
  );
}

function ChemicalSelectionPopup({
  records,
  selectedIds,
  onChange,
  onClose,
}: {
  records: MsdsRecord[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [keyword, setKeyword] = useState("");

  const toggleRecord = (id: string) => {
    const nextIds = new Set(selectedIds.length ? selectedIds : records.slice(0, 1).map((record) => record.id));
    if (nextIds.has(id)) {
      if (nextIds.size <= 1) return;
      nextIds.delete(id);
    } else {
      nextIds.add(id);
    }
    onChange(records.filter((record) => nextIds.has(record.id)).map((record) => record.id));
  };

  const keywordText = keyword.trim().toLocaleLowerCase();
  const visibleRecords = keywordText
    ? records.filter((record) => `${record.name}${record.alias}`.toLocaleLowerCase().includes(keywordText))
    : records;

  return (
    <div className="panel-popup panel-popup--table selection-popup">
      <div className="floating-title">
        <FlaskConical size={18} />
        选择展示化学品
        <button type="button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>
      <div className="selection-popup__body">
        <label className="search-box selection-search">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="请输入化学品名称或别名搜索"
            data-testid="chemical-selector-search"
          />
          <Search size={17} />
        </label>
        <div className="selection-popup__status">已选择 {selectedIds.length} 种，点击即更新页面展示，至少保留 1 种</div>
        <div className="selection-list">
          {visibleRecords.map((record) => {
            const checked = selectedIds.includes(record.id);
            return (
              <label className={`selection-row ${checked ? "is-checked" : ""}`} key={record.id}>
                <input
                  checked={checked}
                  disabled={checked && selectedIds.length === 1}
                  type="checkbox"
                  onChange={() => toggleRecord(record.id)}
                />
                <span className="selection-row__check">{checked ? <CheckCircle2 size={17} /> : null}</span>
                <span className="selection-row__main">
                  <b>{record.name}</b>
                  <em>{record.alias}</em>
                </span>
                <strong>{record.hazardClass}</strong>
              </label>
            );
          })}
          {visibleRecords.length === 0 ? <div className="empty-hint">未找到匹配化学品</div> : null}
        </div>
      </div>
    </div>
  );
}

function CaseSelectionPopup({
  records,
  selectedIds,
  onChange,
  onClose,
}: {
  records: EmergencyResponseSnapshot["cases"];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [keyword, setKeyword] = useState("");

  const toggleRecord = (id: string) => {
    const nextIds = new Set(selectedIds.length ? selectedIds : records.slice(0, 1).map((record) => record.id));
    if (nextIds.has(id)) {
      if (nextIds.size <= 1) return;
      nextIds.delete(id);
    } else {
      nextIds.add(id);
    }
    onChange(records.filter((record) => nextIds.has(record.id)).map((record) => record.id));
  };

  const keywordText = keyword.trim().toLocaleLowerCase();
  const visibleRecords = keywordText
    ? records.filter((record) => record.accidentType.toLocaleLowerCase().includes(keywordText))
    : records;

  return (
    <div className="panel-popup panel-popup--table selection-popup">
      <div className="floating-title">
        <BookOpen size={18} />
        选择展示案例
        <button type="button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>
      <div className="selection-popup__body">
        <label className="search-box selection-search">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="请输入事故类型搜索"
            data-testid="case-selector-search"
          />
          <Search size={17} />
        </label>
        <div className="selection-popup__status">已选择 {selectedIds.length} 个，点击即更新页面展示，至少保留 1 个</div>
        <div className="selection-list">
          {visibleRecords.map((record) => {
            const checked = selectedIds.includes(record.id);
            return (
              <label className={`selection-row ${checked ? "is-checked" : ""}`} key={record.id}>
                <input
                  checked={checked}
                  disabled={checked && selectedIds.length === 1}
                  type="checkbox"
                  onChange={() => toggleRecord(record.id)}
                />
                <span className="selection-row__check">{checked ? <CheckCircle2 size={17} /> : null}</span>
                <span className="selection-row__main">
                  <b>{record.title}</b>
                  <em>{record.accidentType}</em>
                </span>
                <strong>{record.level}</strong>
              </label>
            );
          })}
          {visibleRecords.length === 0 ? <div className="empty-hint">未找到匹配案例</div> : null}
        </div>
      </div>
    </div>
  );
}

function VideoSelectionPopup({
  channels,
  selectedIds,
  onConfirm,
  onClose,
}: {
  channels: VideoChannel[];
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const requiredCount = Math.min(4, channels.length);
  const [draftIds, setDraftIds] = useState(() =>
    selectedIds.length ? selectedIds.slice(0, requiredCount) : channels.slice(0, requiredCount).map((channel) => channel.id),
  );

  const toggleChannel = (id: string) => {
    setDraftIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= requiredCount) return prev;
      return [...prev, id];
    });
  };

  const orderedDraftIds = channels.filter((channel) => draftIds.includes(channel.id)).map((channel) => channel.id);
  const canConfirm = draftIds.length === requiredCount;

  return (
    <div className="panel-popup panel-popup--table selection-popup">
      <div className="floating-title">
        <Camera size={18} />
        固定视频监控
        <button type="button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>
      <div className="selection-popup__body">
        <div className={`selection-popup__status ${canConfirm ? "is-ok" : "is-warning"}`}>
          已选择 {draftIds.length}/{requiredCount} 路摄像头，页面固定显示 {requiredCount} 路
        </div>
        <div className="selection-list selection-list--video">
          {channels.map((channel) => {
            const checked = draftIds.includes(channel.id);
            const disabled = !checked && draftIds.length >= requiredCount;
            return (
              <label className={`selection-row selection-row--video ${checked ? "is-checked" : ""} ${disabled ? "is-disabled" : ""}`} key={channel.id}>
                <input
                  checked={checked}
                  disabled={disabled}
                  type="checkbox"
                  onChange={() => toggleChannel(channel.id)}
                />
                <span className="selection-row__check">{checked ? <CheckCircle2 size={17} /> : null}</span>
                <span className="selection-row__main">
                  <b>{channel.name}</b>
                  <em>{channel.area} / {channel.status}</em>
                </span>
                <img src={channel.poster} alt={channel.name} />
              </label>
            );
          })}
        </div>
        <div className="selection-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="is-primary" disabled={!canConfirm} type="button" onClick={() => onConfirm(orderedDraftIds)}>
            固定显示
          </button>
        </div>
      </div>
    </div>
  );
}

function ExternalAttachmentCell({
  attachments,
  onView,
}: {
  attachments: ExternalPlanAttachment[];
  onView: (attachment: ExternalPlanAttachment) => void;
}) {
  if (attachments.length === 0) return <span className="attachment-empty">暂无</span>;

  return (
    <span className="attachment-cell" onClick={(event) => event.stopPropagation()}>
      <button className="attachment-trigger" type="button" onClick={() => onView(attachments[0])}>
        {attachments.length} 个附件
      </button>
      <span className="attachment-menu">
        {attachments.map((attachment) => (
          <button key={attachment.id} type="button" onClick={() => onView(attachment)}>
            {attachment.name}
          </button>
        ))}
      </span>
    </span>
  );
}

function externalCellValue(
  sourceKey: DashboardApiSourceKey,
  key: string,
  row: Record<string, unknown>,
  onAttachmentOpen: (planName: string, attachment: ExternalPlanAttachment) => void,
) {
  if (sourceKey === "dashboardPlans") {
    if (key === "type") return planTypeText(row.type) || "-";
    if (key === "status") return planStatusText(row.status) || "-";
    if (key === "applicableArea") {
      return firstText(row, ["applicableArea", "area", "region", "scope", "version"]) || "-";
    }
    if (key === "attachments") {
      return (
        <ExternalAttachmentCell
          attachments={planAttachmentsFromRow(row)}
          onView={(attachment) => onAttachmentOpen(firstText(row, ["name"]) || "预案附件", attachment)}
        />
      );
    }
  }

  const value = row[key];
  if (key === "expiryStatus") {
    return value === "expired" ? "已过期" : value === "expiring" ? "即将到期" : String(value ?? "-");
  }
  return String(value ?? "-");
}

function ExternalDataPopup({ spec, onClose }: { spec: ExternalPopupSpec; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ExternalSourceResult<Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attachmentPreview, setAttachmentPreview] = useState<{
    planName: string;
    attachment: ExternalPlanAttachment;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    dashboardApi.getExternalSource<Record<string, unknown>>(spec.sourceKey, { page, pageSize: 20 })
      .then((next) => {
        if (mounted) setResult(next);
      })
      .catch((reason) => {
        if (!mounted) return;
        setResult(null);
        setError(reason instanceof Error ? reason.message : "第三方明细加载失败");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [page, spec.sourceKey]);

  const rows = result?.data.list ?? [];
  const totalPages = Math.max(1, Math.ceil((result?.data.total ?? 0) / (result?.data.pageSize || 20)));
  const openRow = (row: Record<string, unknown>) => {
    openThirdPartyDetail(typeof row.detailUrl === "string" ? row.detailUrl : undefined);
  };

  return (
    <>
    <div className="panel-popup panel-popup--table external-data-popup">
      <div className="floating-title">
        <MapPinned size={18} />
        {spec.title}
        <button type="button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>
      <div className="panel-popup__body">
        {result?.stale ? (
          <div className="external-source-note external-source-note--stale">
            第三方接口异常，当前为 {result.fetchedAt || "最近一次"} 成功数据
          </div>
        ) : null}
        {loading ? <div className="external-popup-state">正在加载第三方明细</div> : null}
        {!loading && error ? <div className="external-popup-state is-error">{error}</div> : null}
        {!loading && !error && rows.length === 0 ? <div className="external-popup-state">暂无数据</div> : null}
        {!loading && rows.length > 0 ? (
          <table className="popup-table popup-table--interactive">
            <thead>
              <tr>
                {spec.columns.map((column) => <th key={column.key}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const hasDetail = typeof row.detailUrl === "string" && row.detailUrl.length > 0;
                return (
                  <tr
                    className={hasDetail ? "is-clickable" : ""}
                    key={String(row.id ?? index)}
                    role={hasDetail ? "link" : undefined}
                    tabIndex={hasDetail ? 0 : undefined}
                    onClick={() => openRow(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") openRow(row);
                    }}
                  >
                    {spec.columns.map((column) => {
                      const displayValue = externalCellValue(
                        spec.sourceKey,
                        column.key,
                        row,
                        (planName, attachment) => setAttachmentPreview({ planName, attachment }),
                      );
                      return <td key={`${String(row.id ?? index)}-${column.key}`}>{displayValue}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        {!loading && !error && totalPages > 1 ? (
          <div className="external-popup-pagination">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
              上一页
            </button>
            <span>第 {page} / {totalPages} 页 · 共 {result?.data.total ?? 0} 条</span>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
              下一页
            </button>
          </div>
        ) : null}
      </div>
    </div>
    {attachmentPreview ? (
      <AttachmentPreviewPopup
        attachment={attachmentPreview.attachment}
        planName={attachmentPreview.planName}
        onClose={() => setAttachmentPreview(null)}
      />
    ) : null}
    </>
  );
}

function AttachmentPreviewPopup({
  planName,
  attachment,
  onClose,
}: {
  planName: string;
  attachment: ExternalPlanAttachment;
  onClose: () => void;
}) {
  return (
    <div className="panel-popup attachment-preview-popup">
      <div className="floating-title">
        <FileText size={18} />
        附件内容
        <button type="button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>
      <div className="panel-popup__body">
        <div className="panel-popup__status">{planName}</div>
        <div className="detail-row">
          <span>附件名称</span>
          <b>{attachment.name}</b>
        </div>
        <div className="detail-row">
          <span>附件类型</span>
          <b>{attachment.type || "-"}</b>
        </div>
        <div className="detail-row">
          <span>版本</span>
          <b>{attachment.version || "-"}</b>
        </div>
        <div className="detail-row">
          <span>更新时间</span>
          <b>{attachment.updatedAt || "-"}</b>
        </div>
        <div className="attachment-preview-content">
          {attachment.content || "附件内容预览待第三方接口返回正文内容。"}
        </div>
        {attachment.url ? (
          <button className="detail-link" type="button" onClick={() => openThirdPartyDetail(attachment.url)}>
            打开附件地址
          </button>
        ) : null}
      </div>
    </div>
  );
}

function InfoPopup({ popup, onClose }: { popup: InfoPopupData; onClose: () => void }) {
  return (
    <div className={`panel-popup ${popup.table ? "panel-popup--table" : ""}`}>
      <div className="floating-title">
        <MapPinned size={18} />
        {popup.title}
        <button type="button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>
      <div className="panel-popup__body">
        {popup.status ? (
          <div className={`panel-popup__status ${popup.statusTone ? `panel-popup__status--${popup.statusTone}` : ""}`}>
            {popup.status}
          </div>
        ) : null}
        {popup.table ? (
          <table className="popup-table">
            <thead>
              <tr>
                {popup.table.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {popup.table.rows.map((row) => (
                <tr key={row.id}>
                  {row.cells.map((cell, index) => (
                    <td className={cell.tone ? `popup-table__cell--${cell.tone}` : ""} key={`${row.id}-${index}`}>
                      {cell.value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {(popup.rows ?? []).map((row) => (
          <div className={`detail-row ${row.tone ? `detail-row--${row.tone}` : ""}`} key={`${row.label}-${row.value}`}>
            <span>{row.label}</span>
            <b>{row.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function VideoPopup({
  point,
  stream,
  onClose,
}: {
  point: MapPoint;
  stream: CameraStream;
  onClose: () => void;
}) {
  const drag = useDragOffset();

  return (
    <div className="video-popup" style={drag.style}>
      <div className="floating-title floating-title--draggable" {...drag.titleProps}>
        <Camera size={18} />
        实时视频
        <button type="button" onClick={onClose} title="关闭">
          <X size={20} />
        </button>
      </div>
      <div className="video-frame">
        <img src={stream.poster ?? stream.url} alt={`${point.name}实时视频`} />
        <span className="video-time">{stream.capturedAt ?? "2025-10-20 14:08:18"}</span>
        <span className="video-label">{point.name}</span>
      </div>
    </div>
  );
}
