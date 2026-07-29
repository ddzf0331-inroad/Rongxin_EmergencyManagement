import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  CircleDot,
  Crosshair,
  Layers,
  MapPinPlus,
  MapPinned,
  MousePointer2,
  PackageCheck,
  RadioTower,
  Route,
  Save,
  ShieldAlert,
  Siren,
  Trash2,
  Undo2,
  UsersRound,
  X,
} from "lucide-react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clientPointToMapPoint,
  mapPointToPercent,
  roundMapCoordinate,
  type MapCoordinate,
} from "../mapGeometry";
import { dashboardApi } from "../services/dashboardApi";
import type { DashboardMapConfig, EscapeRoute, MapCalibration, MapLayerKey, MapPoint, Severity } from "../types";

type ConfigPointLayer = Exclude<MapLayerKey, "escapeRoute">;
type EditorTool = "select" | "addPoint" | "drawRoute";
type Selection = { type: "point"; id: string } | { type: "route"; id: string } | null;

interface LayerMeta {
  label: string;
  short: string;
  color: string;
  defaultStatus: string;
  defaultPayload: Record<string, string | number | boolean | null | undefined>;
}

const pointLayers: ConfigPointLayer[] = ["camera", "material", "plan", "personnel", "hazard", "alarm", "duty", "drill"];

const layerMeta: Record<ConfigPointLayer, LayerMeta> = {
  camera: {
    label: "摄像头",
    short: "视频",
    color: "#0e7cff",
    defaultStatus: "在线",
    defaultPayload: { deviceNo: "CAM-NEW", area: "待配置区域", streamUrl: "/assets/plant-map.png" },
  },
  material: {
    label: "应急物资",
    short: "物资",
    color: "#ff9d18",
    defaultStatus: "库存正常",
    defaultPayload: { 类别: "应急物资", 数量: 1, 责任人: "待配置" },
  },
  plan: {
    label: "应急预案",
    short: "预案",
    color: "#24a8ff",
    defaultStatus: "预案可用",
    defaultPayload: { 预案类型: "现场处置方案", 版本: "V1.0" },
  },
  personnel: {
    label: "人员坐标",
    short: "人员",
    color: "#3ed56d",
    defaultStatus: "在岗",
    defaultPayload: { 部门: "待配置", 电话: "待配置", 定位: "已同步" },
  },
  hazard: {
    label: "重大危险源",
    short: "危险",
    color: "#ff5638",
    defaultStatus: "重点监控",
    defaultPayload: { 等级: "二级", 危险介质: "待配置", 责任人: "待配置" },
  },
  alarm: {
    label: "报警信息",
    short: "报警",
    color: "#ff3333",
    defaultStatus: "处理中",
    defaultPayload: { 报警类型: "气体浓度超限", 处置流程: "待接警研判" },
  },
  duty: {
    label: "值班信息",
    short: "值班",
    color: "#21d6d2",
    defaultStatus: "在岗",
    defaultPayload: { 部门: "待配置", 联系电话: "待配置" },
  },
  drill: {
    label: "应急演练",
    short: "演练",
    color: "#9b7cff",
    defaultStatus: "计划中",
    defaultPayload: { 演练类型: "综合演练", 负责人: "待配置" },
  },
};

const severityOptions: Array<{ label: string; value: Severity | "" }> = [
  { label: "默认", value: "" },
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
  { label: "严重", value: "critical" },
];

function clonePoints(points: MapPoint[]) {
  return points.map((point) => ({ ...point, payload: { ...point.payload } }));
}

function cloneRoutes(routes: EscapeRoute[]) {
  return routes.map((route) => ({
    ...route,
    points: route.points.map((point) => ({ ...point })),
    payload: { ...route.payload },
  }));
}

function payloadToText(payload: MapPoint["payload"]) {
  return Object.entries(payload)
    .map(([key, value]) => `${key}=${value ?? ""}`)
    .join("\n");
}

function textToPayload(text: string): MapPoint["payload"] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<MapPoint["payload"]>((acc, line) => {
      const separator = line.includes("=") ? "=" : line.includes("：") ? "：" : ":";
      const [key, ...rest] = line.split(separator);
      if (key?.trim()) acc[key.trim()] = rest.join(separator).trim();
      return acc;
    }, {});
}

function getPointStyle(point: MapPoint): CSSProperties {
  const layer = getPointLayer(point);
  return { "--marker-color": layerMeta[layer].color } as CSSProperties;
}

function getPointLayer(point: MapPoint): ConfigPointLayer {
  return point.layer === "escapeRoute" ? "plan" : point.layer;
}

function LayerMarkerIcon({ layer, size = 18 }: { layer: ConfigPointLayer; size?: number }) {
  if (layer === "camera") return <Camera size={size} strokeWidth={2.6} />;
  if (layer === "material") return <PackageCheck size={size} strokeWidth={2.6} />;
  if (layer === "plan") return <MapPinned size={size} strokeWidth={2.6} />;
  if (layer === "personnel") return <UsersRound size={size} strokeWidth={2.6} />;
  if (layer === "hazard") return <ShieldAlert size={size} strokeWidth={2.6} />;
  if (layer === "alarm") return <Siren size={size} strokeWidth={2.6} />;
  if (layer === "duty") return <RadioTower size={size} strokeWidth={2.6} />;
  return <CalendarDays size={size} strokeWidth={2.6} />;
}

function createPoint(layer: ConfigPointLayer, coordinate: MapCoordinate, existingCount: number): MapPoint {
  const meta = layerMeta[layer];
  const index = existingCount + 1;
  return {
    id: `${layer}-${Date.now()}`,
    layer,
    name: `${meta.label}${index}`,
    status: meta.defaultStatus,
    severity: layer === "hazard" || layer === "alarm" ? "high" : undefined,
    x: coordinate.x,
    y: coordinate.y,
    payload: { ...meta.defaultPayload },
  };
}

function makeDraftRoute(routeName: string, color: string, firstPoint: MapCoordinate): EscapeRoute {
  return {
    id: `escape-route-${Date.now()}`,
    name: routeName || "新建逃生路线",
    exitName: routeName || "出口",
    status: "畅通",
    color,
    points: [firstPoint],
    payload: { 通行状态: "畅通", 来源: "配置页手动绘制" },
  };
}

export function ConfigPage() {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ type: "point"; id: string } | { type: "routeNode"; id: string; index: number } | null>(null);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [routes, setRoutes] = useState<EscapeRoute[]>([]);
  const [calibration, setCalibration] = useState<MapCalibration>();
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<EditorTool>("select");
  const [targetLayer, setTargetLayer] = useState<ConfigPointLayer>("camera");
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedRouteNodeIndex, setSelectedRouteNodeIndex] = useState<number | null>(null);
  const [routeDraft, setRouteDraft] = useState<EscapeRoute | null>(null);
  const [routeColor, setRouteColor] = useState("#30d9ff");
  const [routeName, setRouteName] = useState("东门疏散路线");
  const [payloadText, setPayloadText] = useState("");
  const [history, setHistory] = useState<Array<{ points: MapPoint[]; routes: EscapeRoute[] }>>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let mounted = true;
    dashboardApi.getMapConfig().then((config) => {
      if (!mounted) return;
      setPoints(config.mapPoints);
      setRoutes(config.escapeRoutes);
      setCalibration(config.calibration);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const selectedPoint = useMemo(
    () => (selection?.type === "point" ? points.find((point) => point.id === selection.id) : undefined),
    [points, selection],
  );
  const selectedRoute = useMemo(
    () => (selection?.type === "route" ? routes.find((route) => route.id === selection.id) : undefined),
    [routes, selection],
  );
  const inspectedRoute = routeDraft ?? selectedRoute;

  useEffect(() => {
    if (selectedPoint) {
      setPayloadText(payloadToText(selectedPoint.payload));
    } else {
      setPayloadText("");
    }
  }, [selectedPoint?.id]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      const surface = surfaceRef.current;
      if (!drag || !surface) return;
      const nextPoint = roundMapCoordinate(clientPointToMapPoint(event.clientX, event.clientY, surface.getBoundingClientRect()));
      if (drag.type === "point") {
        setPoints((prev) =>
          prev.map((point) => (point.id === drag.id ? { ...point, x: nextPoint.x, y: nextPoint.y } : point)),
        );
      } else {
        setRoutes((prev) =>
          prev.map((route) =>
            route.id === drag.id
              ? {
                  ...route,
                  points: route.points.map((point, index) => (index === drag.index ? nextPoint : point)),
                }
              : route,
          ),
        );
        setRouteDraft((prev) =>
          prev && prev.id === drag.id
            ? { ...prev, points: prev.points.map((point, index) => (index === drag.index ? nextPoint : point)) }
            : prev,
        );
      }
    }

    function handlePointerUp() {
      dragRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const storeHistory = () => {
    setHistory((prev) => [...prev.slice(-24), { points: clonePoints(points), routes: cloneRoutes(routes) }]);
  };

  const undo = () => {
    setHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last) {
        setPoints(clonePoints(last.points));
        setRoutes(cloneRoutes(last.routes));
        setRouteDraft(null);
        setSelection(null);
        setSelectedRouteNodeIndex(null);
      }
      return prev.slice(0, -1);
    });
  };

  const getSurfacePoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current;
    if (!surface) return null;
    return roundMapCoordinate(clientPointToMapPoint(event.clientX, event.clientY, surface.getBoundingClientRect()));
  };

  const handleMapClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.detail > 1) return;
    const coordinate = getSurfacePoint(event);
    if (!coordinate) return;

    if (tool === "addPoint") {
      storeHistory();
      const point = createPoint(targetLayer, coordinate, points.filter((item) => item.layer === targetLayer).length);
      setPoints((prev) => [...prev, point]);
      setSelection({ type: "point", id: point.id });
      setSelectedRouteNodeIndex(null);
      return;
    }

    if (tool === "drawRoute") {
      if (!routeDraft) {
        setRouteDraft(makeDraftRoute(routeName, routeColor, coordinate));
      } else {
        setRouteDraft((prev) => (prev ? { ...prev, points: [...prev.points, coordinate] } : prev));
      }
      setSelection(null);
      return;
    }

    setSelection(null);
    setSelectedRouteNodeIndex(null);
  };

  const finishDraftRoute = () => {
    if (!routeDraft || routeDraft.points.length < 2) return;
    storeHistory();
    const completedRoute = {
      ...routeDraft,
      name: routeDraft.name || routeName || "逃生路线",
      exitName: routeDraft.exitName || routeName || "出口",
      color: routeDraft.color || routeColor,
      payload: { ...routeDraft.payload, 通行状态: routeDraft.status },
    };
    setRoutes((prev) => [...prev, completedRoute]);
    setSelection({ type: "route", id: completedRoute.id });
    setSelectedRouteNodeIndex(null);
    setRouteDraft(null);
    setTool("select");
  };

  const handleMapDoubleClick = () => {
    if (tool === "drawRoute") finishDraftRoute();
  };

  const updatePoint = (id: string, patch: Partial<MapPoint>) => {
    setPoints((prev) => prev.map((point) => (point.id === id ? { ...point, ...patch } : point)));
  };

  const updatePointPayload = (id: string, key: string, value: string) => {
    setPoints((prev) =>
      prev.map((point) =>
        point.id === id ? { ...point, payload: { ...point.payload, [key]: value } } : point,
      ),
    );
  };

  const updateInspectedRoute = (patch: Partial<EscapeRoute>) => {
    if (routeDraft) {
      setRouteDraft((prev) => (prev ? { ...prev, ...patch } : prev));
      return;
    }
    if (!selectedRoute) return;
    setRoutes((prev) => prev.map((route) => (route.id === selectedRoute.id ? { ...route, ...patch } : route)));
  };

  const selectRoute = (id: string) => {
    setSelection({ type: "route", id });
    setSelectedRouteNodeIndex(null);
    setTool("select");
  };

  const deleteRoute = (id: string) => {
    storeHistory();
    setRoutes((prev) => prev.filter((route) => route.id !== id));
    setSelection((prev) => (prev?.type === "route" && prev.id === id ? null : prev));
    setSelectedRouteNodeIndex(null);
  };

  const cancelDraftRoute = () => {
    setRouteDraft(null);
    setSelectedRouteNodeIndex(null);
    setSelection(null);
  };

  const deleteSelected = () => {
    if (!selection) return;
    storeHistory();
    if (selection.type === "point") {
      setPoints((prev) => prev.filter((point) => point.id !== selection.id));
    } else {
      setRoutes((prev) => prev.filter((route) => route.id !== selection.id));
    }
    setSelection(null);
    setSelectedRouteNodeIndex(null);
  };

  const deleteSelectedNode = () => {
    const route = routeDraft ?? selectedRoute;
    if (!route || selectedRouteNodeIndex == null || route.points.length <= 2) return;
    storeHistory();
    const nextPoints = route.points.filter((_, index) => index !== selectedRouteNodeIndex);
    if (routeDraft) {
      setRouteDraft({ ...routeDraft, points: nextPoints });
    } else {
      setRoutes((prev) => prev.map((item) => (item.id === route.id ? { ...item, points: nextPoints } : item)));
    }
    setSelectedRouteNodeIndex(null);
  };

  const startDragPoint = (event: ReactPointerEvent<HTMLButtonElement>, point: MapPoint) => {
    if (tool !== "select") return;
    event.stopPropagation();
    storeHistory();
    dragRef.current = { type: "point", id: point.id };
    setSelection({ type: "point", id: point.id });
    setSelectedRouteNodeIndex(null);
  };

  const startDragRouteNode = (event: ReactPointerEvent<HTMLButtonElement>, routeId: string, index: number) => {
    if (tool !== "select") return;
    event.stopPropagation();
    storeHistory();
    dragRef.current = { type: "routeNode", id: routeId, index };
    setSelection({ type: "route", id: routeId });
    setSelectedRouteNodeIndex(index);
  };

  const saveConfig = async () => {
    setSaveState("saving");
    const config: DashboardMapConfig = {
      version: 2,
      mapPoints: points,
      escapeRoutes: routes,
      calibration,
      updatedAt: new Date().toISOString(),
    };

    try {
      const saved = await dashboardApi.saveMapConfig(config);
      setPoints(saved.mapPoints);
      setRoutes(saved.escapeRoutes);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1600);
    } catch {
      setSaveState("error");
    }
  };

  const applyPayloadText = () => {
    if (!selectedPoint) return;
    updatePoint(selectedPoint.id, { payload: textToPayload(payloadText) });
  };

  const layerCounts = pointLayers.map((layer) => ({
    layer,
    count: points.filter((point) => point.layer === layer).length,
  }));

  return (
    <main className="config-page">
      <header className="config-header">
        <a className="config-back" href="/">
          <ArrowLeft size={18} />
          返回展示平台
        </a>
        <div className="config-title">
          <span>应急图层配置中心</span>
          <b>{loading ? "加载中" : saveState === "saved" ? "已保存" : "本地配置"}</b>
        </div>
        <a className="config-save" href="/config/calibration">事故模拟标定</a>
        <button className="config-save" type="button" onClick={saveConfig} disabled={loading || saveState === "saving"}>
          <Save size={18} />
          {saveState === "saving" ? "保存中" : "保存配置"}
        </button>
      </header>

      <section className="config-layout">
        <aside className="config-sidebar">
          <PanelBlock title="工具">
            <button className={`config-tool ${tool === "select" ? "is-active" : ""}`} type="button" onClick={() => setTool("select")}>
              <MousePointer2 size={18} />
              <span>选择</span>
            </button>
            <button className={`config-tool ${tool === "addPoint" ? "is-active" : ""}`} type="button" onClick={() => setTool("addPoint")}>
              <MapPinPlus size={18} />
              <span>标点</span>
            </button>
            <button className={`config-tool ${tool === "drawRoute" ? "is-active" : ""}`} type="button" onClick={() => setTool("drawRoute")}>
              <Route size={18} />
              <span>路线</span>
            </button>
            <button className="config-tool" type="button" onClick={undo} disabled={!history.length}>
              <Undo2 size={18} />
              <span>撤销</span>
            </button>
            <button className="config-tool config-tool--danger" type="button" onClick={deleteSelected} disabled={!selection}>
              <Trash2 size={18} />
              <span>删除</span>
            </button>
          </PanelBlock>

          <PanelBlock title="标点图层">
            <div className="config-layer-list">
              {pointLayers.map((layer) => (
                <button
                  className={`config-layer-item ${targetLayer === layer ? "is-active" : ""}`}
                  key={layer}
                  type="button"
                  onClick={() => {
                    setTargetLayer(layer);
                    setTool("addPoint");
                  }}
                >
                  <span style={{ backgroundColor: layerMeta[layer].color }} />
                  <b>{layerMeta[layer].label}</b>
                  <em>{points.filter((point) => point.layer === layer).length}</em>
                </button>
              ))}
            </div>
          </PanelBlock>

          <PanelBlock title="路线颜色">
            <div className="route-color-row">
              <input value={routeColor} type="color" onChange={(event) => setRouteColor(event.target.value)} />
              {["#2ff06f", "#30d9ff", "#ffbd25", "#ff5638"].map((color) => (
                <button
                  aria-label={color}
                  className={routeColor === color ? "is-active" : ""}
                  key={color}
                  style={{ backgroundColor: color }}
                  type="button"
                  onClick={() => setRouteColor(color)}
                />
              ))}
            </div>
            <input
              className="config-input"
              value={routeName}
              onChange={(event) => setRouteName(event.target.value)}
              placeholder="路线名称"
            />
          </PanelBlock>
        </aside>

        <section className="config-map-panel">
          <div
            className={`config-map-surface config-map-surface--${tool}`}
            ref={surfaceRef}
            onClick={handleMapClick}
            onDoubleClick={handleMapDoubleClick}
          >
            <img src="/assets/plant-map.png" alt="厂区地图" draggable={false} />
            <svg className="config-route-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
              {routes.map((route) => (
                <RoutePolyline
                  key={route.id}
                  route={route}
                  selected={selection?.type === "route" && selection.id === route.id}
                  onSelect={() => {
                    setSelection({ type: "route", id: route.id });
                    setSelectedRouteNodeIndex(null);
                    setTool("select");
                  }}
                />
              ))}
              {routeDraft ? <RoutePolyline route={routeDraft} selected draft onSelect={() => null} /> : null}
            </svg>

            {routes.map((route) =>
              selection?.type === "route" && selection.id === route.id
                ? route.points.map((point, index) => (
                    <RouteNode
                      key={`${route.id}-${index}`}
                      point={point}
                      selected={selectedRouteNodeIndex === index}
                      onPointerDown={(event) => startDragRouteNode(event, route.id, index)}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedRouteNodeIndex(index);
                      }}
                    />
                  ))
                : null,
            )}
            {routeDraft
              ? routeDraft.points.map((point, index) => (
                  <RouteNode
                    key={`${routeDraft.id}-${index}`}
                    point={point}
                    selected={selectedRouteNodeIndex === index}
                    onPointerDown={(event) => startDragRouteNode(event, routeDraft.id, index)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedRouteNodeIndex(index);
                    }}
                  />
                ))
              : null}

            {points.map((point) => (
              <EditorMarker
                key={point.id}
                point={point}
                selected={selection?.type === "point" && selection.id === point.id}
                onPointerDown={(event) => startDragPoint(event, point)}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelection({ type: "point", id: point.id });
                  setSelectedRouteNodeIndex(null);
                  setTool("select");
                }}
              />
            ))}
          </div>
        </section>

        <aside className="config-inspector">
          <PanelBlock title="属性">
            {selectedPoint ? (
              <div className="config-form">
                <label>
                  <span>图层</span>
                  <select
                    value={selectedPoint.layer}
                    onChange={(event) => {
                      const nextLayer = event.target.value as ConfigPointLayer;
                      updatePoint(selectedPoint.id, {
                        layer: nextLayer,
                        status: selectedPoint.status || layerMeta[nextLayer].defaultStatus,
                        payload: { ...layerMeta[nextLayer].defaultPayload, ...selectedPoint.payload },
                      });
                    }}
                  >
                    {pointLayers.map((layer) => (
                      <option key={layer} value={layer}>
                        {layerMeta[layer].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>名称</span>
                  <input value={selectedPoint.name} onChange={(event) => updatePoint(selectedPoint.id, { name: event.target.value })} />
                </label>
                <label>
                  <span>状态</span>
                  <input value={selectedPoint.status ?? ""} onChange={(event) => updatePoint(selectedPoint.id, { status: event.target.value })} />
                </label>
                <label>
                  <span>告警级别</span>
                  <select
                    value={selectedPoint.severity ?? ""}
                    onChange={(event) =>
                      updatePoint(selectedPoint.id, {
                        severity: event.target.value ? (event.target.value as Severity) : undefined,
                      })
                    }
                  >
                    {severityOptions.map((option) => (
                      <option key={option.value || "default"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>详情地址</span>
                  <input
                    value={selectedPoint.detailUrl ?? ""}
                    onChange={(event) => updatePoint(selectedPoint.id, { detailUrl: event.target.value || undefined })}
                  />
                </label>
                <div className="coordinate-row">
                  <label>
                    <span>X</span>
                    <input value={selectedPoint.x} readOnly />
                  </label>
                  <label>
                    <span>Y</span>
                    <input value={selectedPoint.y} readOnly />
                  </label>
                </div>
                {selectedPoint.layer === "camera" ? (
                  <>
                    <label>
                      <span>设备编号</span>
                      <input
                        value={String(selectedPoint.payload.deviceNo ?? "")}
                        onChange={(event) => updatePointPayload(selectedPoint.id, "deviceNo", event.target.value)}
                      />
                    </label>
                    <label>
                      <span>区域</span>
                      <input
                        value={String(selectedPoint.payload.area ?? "")}
                        onChange={(event) => updatePointPayload(selectedPoint.id, "area", event.target.value)}
                      />
                    </label>
                    <label>
                      <span>视频地址</span>
                      <input
                        value={String(selectedPoint.payload.streamUrl ?? "")}
                        onChange={(event) => updatePointPayload(selectedPoint.id, "streamUrl", event.target.value)}
                      />
                    </label>
                  </>
                ) : (
                  <label>
                    <span>业务属性</span>
                    <textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} onBlur={applyPayloadText} />
                  </label>
                )}
              </div>
            ) : inspectedRoute ? (
              <div className="config-form">
                <label>
                  <span>路线名称</span>
                  <input value={inspectedRoute.name} onChange={(event) => updateInspectedRoute({ name: event.target.value })} />
                </label>
                <label>
                  <span>出口名称</span>
                  <input value={inspectedRoute.exitName} onChange={(event) => updateInspectedRoute({ exitName: event.target.value })} />
                </label>
                <label>
                  <span>状态</span>
                  <select
                    value={inspectedRoute.status}
                    onChange={(event) => updateInspectedRoute({ status: event.target.value as EscapeRoute["status"] })}
                  >
                    <option value="畅通">畅通</option>
                    <option value="拥堵">拥堵</option>
                    <option value="封闭">封闭</option>
                  </select>
                </label>
                <label>
                  <span>颜色</span>
                  <input value={inspectedRoute.color} type="color" onChange={(event) => updateInspectedRoute({ color: event.target.value })} />
                </label>
                <div className="route-actions">
                  <button type="button" onClick={finishDraftRoute} disabled={!routeDraft || routeDraft.points.length < 2}>
                    <Check size={16} />
                    完成路线
                  </button>
                  {routeDraft ? (
                    <button type="button" onClick={cancelDraftRoute}>
                      <X size={16} />
                      取消绘制
                    </button>
                  ) : (
                    <button type="button" onClick={() => selectedRoute && deleteRoute(selectedRoute.id)} disabled={!selectedRoute}>
                      <Trash2 size={16} />
                      删除路线
                    </button>
                  )}
                  <button type="button" onClick={deleteSelectedNode} disabled={selectedRouteNodeIndex == null || inspectedRoute.points.length <= 2}>
                    <X size={16} />
                    删除节点
                  </button>
                </div>
              </div>
            ) : (
              <div className="config-empty">
                <Crosshair size={28} />
                <span>未选择对象</span>
              </div>
            )}
          </PanelBlock>

          <PanelBlock title="配置清单">
            <div className="config-summary">
              {layerCounts.map((item) => (
                <button
                  key={item.layer}
                  type="button"
                  onClick={() => {
                    setTargetLayer(item.layer);
                    setTool("addPoint");
                  }}
                >
                  <span style={{ backgroundColor: layerMeta[item.layer].color }} />
                  <b>{layerMeta[item.layer].label}</b>
                  <em>{item.count}</em>
                </button>
              ))}
              <button type="button" onClick={() => setTool("drawRoute")}>
                <span style={{ backgroundColor: "#30d9ff" }} />
                <b>逃生路线</b>
                <em>{routes.length}</em>
              </button>
            </div>
          </PanelBlock>

          <PanelBlock title="逃生路线">
            <div className="route-list">
              {routes.length ? (
                routes.map((route) => (
                  <div
                    className={`route-list-item ${selection?.type === "route" && selection.id === route.id ? "is-active" : ""}`}
                    key={route.id}
                  >
                    <button className="route-list-main" type="button" onClick={() => selectRoute(route.id)}>
                      <span style={{ backgroundColor: route.color }} />
                      <b>{route.name}</b>
                      <em>{route.points.length}点</em>
                    </button>
                    <button
                      aria-label={`删除${route.name}`}
                      className="route-list-delete"
                      type="button"
                      onClick={() => deleteRoute(route.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="route-list-empty">暂无路线</div>
              )}
            </div>
          </PanelBlock>
        </aside>
      </section>
    </main>
  );
}

function PanelBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="config-panel-block">
      <div className="config-panel-title">
        <Layers size={17} />
        {title}
      </div>
      <div className="config-panel-body">{children}</div>
    </section>
  );
}

function EditorMarker({
  point,
  selected,
  onPointerDown,
  onClick,
}: {
  point: MapPoint;
  selected: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const position = mapPointToPercent(point);
  return (
    <button
      className={`config-marker ${selected ? "is-selected" : ""}`}
      style={{ left: `${position.left}%`, top: `${position.top}%`, ...getPointStyle(point) }}
      type="button"
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <span className="config-marker-icon">
        <LayerMarkerIcon layer={getPointLayer(point)} />
      </span>
      <b>{point.name}</b>
    </button>
  );
}

function RoutePolyline({
  route,
  selected,
  draft,
  onSelect,
}: {
  route: EscapeRoute;
  selected: boolean;
  draft?: boolean;
  onSelect: () => void;
}) {
  const points = route.points
    .map((point) => {
      const position = mapPointToPercent(point);
      return `${position.left},${position.top}`;
    })
    .join(" ");

  return (
    <g className={selected ? "is-selected" : ""} onClick={(event) => {
      event.stopPropagation();
      onSelect();
    }}>
      <polyline className="config-route-glow" points={points} stroke={route.color} strokeDasharray={draft ? "2 1.5" : undefined} />
      <polyline className="config-route-core" points={points} stroke={route.color} strokeDasharray={draft ? "2 1.5" : undefined} />
    </g>
  );
}

function RouteNode({
  point,
  selected,
  onPointerDown,
  onClick,
}: {
  point: MapCoordinate;
  selected: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const position = mapPointToPercent(point);
  return (
    <button
      className={`route-node ${selected ? "is-selected" : ""}`}
      style={{ left: `${position.left}%`, top: `${position.top}%` }}
      type="button"
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <CircleDot size={12} />
    </button>
  );
}
