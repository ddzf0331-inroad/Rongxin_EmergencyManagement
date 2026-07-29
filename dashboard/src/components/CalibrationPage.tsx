import { ArrowLeft, Crosshair, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { computeHomography, invertHomography, mapPointToPercent, mapToPhysical, percentToMapPoint } from "../mapGeometry";
import { dashboardApi } from "../services/dashboardApi";
import type { CalibrationPoint, DashboardMapConfig, MapCalibration } from "../types";

type PointKind = "control" | "validation";
type EditableCalibrationPoint = Omit<CalibrationPoint, "eastM" | "northM"> & {
  eastM: number | "";
  northM: number | "";
};

function makePoint(kind: PointKind, mapX: number, mapY: number): EditableCalibrationPoint {
  return { id: `${kind}-${crypto.randomUUID()}`, mapX, mapY, eastM: "", northM: "" };
}

function hasCoordinates(point: EditableCalibrationPoint) {
  return point.eastM !== "" && point.northM !== "";
}

function toCalibrationPoint(point: EditableCalibrationPoint): CalibrationPoint {
  return { ...point, eastM: Number(point.eastM), northM: Number(point.northM) };
}

export function CalibrationPage() {
  const [config, setConfig] = useState<DashboardMapConfig>();
  const [controls, setControls] = useState<EditableCalibrationPoint[]>([]);
  const [validations, setValidations] = useState<EditableCalibrationPoint[]>([]);
  const [kind, setKind] = useState<PointKind>("control");
  const [message, setMessage] = useState("正在加载地图配置…");
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dashboardApi.getMapConfig().then((value) => {
      setConfig(value);
      setControls(value.calibration?.controlPoints ?? []);
      setValidations(value.calibration?.validationPoints ?? []);
      setMessage("点击底图添加控制点");
    });
  }, []);

  const transform = useMemo(() => {
    if (controls.length < 4) return { error: "至少需要 4 个控制点" } as const;
    if (!controls.every(hasCoordinates)) return { error: "请填写完整的控制点坐标" } as const;
    try {
      const physicalToMapMatrix = computeHomography(controls.map((point) => ({ x: point.mapX, y: point.mapY, eastM: Number(point.eastM), northM: Number(point.northM) })));
      const mapToPhysicalMatrix = invertHomography(physicalToMapMatrix);
      return { physicalToMapMatrix, mapToPhysicalMatrix };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "标定计算失败" } as const;
    }
  }, [controls]);

  const calculation = useMemo(() => {
    if ("error" in transform) return transform;
    if (validations.length < 1) return { error: "至少需要 1 个独立校验点" } as const;
    if (!validations.every(hasCoordinates)) return { error: "请填写完整的校验点坐标" } as const;
    try {
      const errors = validations.map((point) => {
        const predicted = mapToPhysical(transform.mapToPhysicalMatrix, { x: point.mapX, y: point.mapY });
        return Math.hypot(predicted.eastM - Number(point.eastM), predicted.northM - Number(point.northM));
      });
      const rmsErrorM = Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length);
      const maxErrorM = Math.max(...errors);
      return { ...transform, rmsErrorM, maxErrorM, validForSimulation: maxErrorM <= 5 };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "标定计算失败" } as const;
    }
  }, [transform, validations]);

  const addPoint = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!surfaceRef.current) return;
    const rect = surfaceRef.current.getBoundingClientRect();
    const point = percentToMapPoint(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
    const item = makePoint(kind, point.x, point.y);
    if (kind === "control") setControls((current) => [...current, item]);
    else setValidations((current) => [...current, item]);
  };

  const update = (kindValue: PointKind, id: string, field: "eastM" | "northM", value: string) => {
    const setter = kindValue === "control" ? setControls : setValidations;
    const coordinate = value === "" ? "" : Number(value);
    setter((current) => current.map((point) => point.id === id ? { ...point, [field]: coordinate } : point));
  };

  const remove = (kindValue: PointKind, id: string) => {
    const setter = kindValue === "control" ? setControls : setValidations;
    setter((current) => current.filter((point) => point.id !== id));
  };

  const save = async () => {
    if (!config || "error" in calculation) return;
    const controlPoints = controls.map(toCalibrationPoint);
    const validationPoints = validations.map(toCalibrationPoint);
    const calibration: MapCalibration = {
      controlPoints, validationPoints,
      physicalToMapMatrix: calculation.physicalToMapMatrix,
      mapToPhysicalMatrix: calculation.mapToPhysicalMatrix,
      rmsErrorM: calculation.rmsErrorM, maxErrorM: calculation.maxErrorM,
      validForSimulation: calculation.validForSimulation, updatedAt: new Date().toISOString(),
    };
    const saved = await dashboardApi.saveMapConfig({ ...config, version: 2, calibration, updatedAt: new Date().toISOString() });
    setConfig(saved);
    setMessage(calibration.validForSimulation ? "标定已保存，可用于正式模拟" : "标定已保存，但误差超过 5 米，不可用于正式模拟");
  };

  const renderRows = (items: EditableCalibrationPoint[], kindValue: PointKind) => items.map((point, index) => {
    const recommendation = kindValue === "validation" && !("error" in transform)
      ? mapToPhysical(transform.mapToPhysicalMatrix, { x: point.mapX, y: point.mapY })
      : null;
    return (
      <div className="calibration-row" key={point.id}>
        <b>{kindValue === "control" ? "C" : "V"}{index + 1}</b>
        <span>图 {point.mapX.toFixed(3)}, {point.mapY.toFixed(3)}</span>
        <label>X 东 <span className="calibration-coordinate-input"><input type="number" value={point.eastM} onChange={(event) => update(kindValue, point.id, "eastM", event.target.value)} /><em>m</em></span></label>
        <label>Y 北 <span className="calibration-coordinate-input"><input type="number" value={point.northM} onChange={(event) => update(kindValue, point.id, "northM", event.target.value)} /><em>m</em></span></label>
        <button type="button" onClick={() => remove(kindValue, point.id)}><Trash2 size={15} /></button>
        {recommendation ? <small className="calibration-recommendation">系统推荐：X 东 {recommendation.eastM.toFixed(2)} m，Y 北 {recommendation.northM.toFixed(2)} m（根据控制点推算，仅供对比）</small> : null}
      </div>
    );
  });

  return (
    <main className="calibration-page">
      <header className="config-header">
        <a className="config-back" href="/config"><ArrowLeft size={18} />返回图层配置</a>
        <div className="config-title"><span>事故模拟地图标定</span><b>{message}</b></div>
        <button className="config-save" type="button" disabled={!config || "error" in calculation} onClick={save}><Save size={18} />保存标定</button>
      </header>
      <section className="calibration-layout">
        <div className="calibration-map" ref={surfaceRef} onClick={addPoint}>
          <img src="/assets/plant-map.png" alt="厂区 2.5D 底图" draggable={false} />
          {[...controls.map((point) => ({ ...point, kind: "C" })), ...validations.map((point) => ({ ...point, kind: "V" }))].map((point) => {
            const position = mapPointToPercent({ x: point.mapX, y: point.mapY });
            return <span className={`calibration-marker calibration-marker--${point.kind}`} style={{ left: `${position.left}%`, top: `${position.top}%` }} key={point.id}>{point.kind}</span>;
          })}
        </div>
        <aside className="calibration-panel">
          <div className="calibration-kind">
            <button className={kind === "control" ? "is-active" : ""} onClick={() => setKind("control")}><Crosshair size={16} />添加控制点</button>
            <button className={kind === "validation" ? "is-active" : ""} onClick={() => setKind("validation")}><Crosshair size={16} />添加校验点</button>
          </div>
          <p>X 向东、Y 向北，单位米。校验点不参与矩阵求解。</p>
          <h3>控制点（{controls.length}/4+）</h3>
          {renderRows(controls, "control")}
          <h3>独立校验点（{validations.length}/1+）</h3>
          {renderRows(validations, "validation")}
          <div className={`calibration-result ${"error" in calculation || !calculation.validForSimulation ? "is-invalid" : "is-valid"}`}>
            {"error" in calculation ? calculation.error : <><span>RMS {calculation.rmsErrorM.toFixed(2)} m</span><span>最大误差 {calculation.maxErrorM.toFixed(2)} m</span><b>{calculation.validForSimulation ? "可用于正式模拟" : "超过 5 m，禁止正式模拟"}</b></>}
          </div>
        </aside>
      </section>
    </main>
  );
}
