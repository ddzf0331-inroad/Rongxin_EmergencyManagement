import { ArrowLeft, CircleHelp, Clock3, FlaskConical, Layers, Pencil, Play, Plus, Save, Trash2, Wind, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { mapToPhysical } from "../mapGeometry";
import { dashboardApi } from "../services/dashboardApi";
import { simulationApi } from "../services/simulationApi";
import type { ChemicalProfile, ConsequenceZone, DashboardMapConfig, MapLayerKey, ReleaseScenario, SimulationRun, WeatherInput } from "../types";
import { MapStage } from "./MapStage";

const simulationInitialLayers: Record<MapLayerKey, boolean> = {
  camera: true, material: true, plan: true, personnel: true, hazard: true,
  drill: false, alarm: false, duty: false, escapeRoute: true,
};

const simulationLayerOrder: MapLayerKey[] = ["plan", "material", "camera", "personnel", "hazard", "escapeRoute"];

const simulationLayerLabels: Record<MapLayerKey, string> = {
  camera: "摄像头", material: "应急物资", plan: "应急预案", personnel: "人员坐标",
  hazard: "重大危险源", drill: "应急演练", alarm: "报警信息", duty: "值班信息", escapeRoute: "逃生路线",
};

const initialScenario: ReleaseScenario = {
  releaseType: "pressurizedGas", inventoryKg: 100, isolationTimeS: 600,
  releaseTemperatureK: 298.15, releaseHeightM: 1, holeDiameterM: 0.01,
  vesselPressurePa: 800000, dischargeCoefficient: 0.62,
  poolAreaM2: 20, poolHeatFluxWM2: 500, massTransferCoefficientMS: 0.002,
  vaporPressurePa: 700000, sourceCoordinate: { eastM: 0, northM: 0 },
};

function number(value: string) { return Number(value); }

function pointInPolygon(point: { eastM: number; northM: number }, polygon: ConsequenceZone["coordinates"]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    const intersects = (a.northM > point.northM) !== (b.northM > point.northM)
      && point.eastM < (b.eastM - a.eastM) * (point.northM - a.northM) / (b.northM - a.northM) + a.eastM;
    if (intersects) inside = !inside;
  }
  return inside;
}

function Input({ label, value, unit, onChange }: { label: string; value: number; unit: string; onChange: (value: number) => void }) {
  return <label className="simulation-field"><span>{label}</span><div><input type="number" step="any" value={value} onChange={(event) => onChange(number(event.target.value))} /><em>{unit}</em></div></label>;
}

function ChemicalEditor({ chemical, onClose, onSaved }: { chemical?: ChemicalProfile; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Partial<ChemicalProfile>>(() => chemical ?? {
    name: "", cas: "", phase: "gas", erpgUnit: "ppm", propertyVersion: "1.0", erpgVersion: "1.0",
  });
  const [error, setError] = useState("");
  const numeric: Array<[keyof ChemicalProfile, string, string]> = [
    ["molarMassKgMol", "分子量", "kg/mol"], ["gasDensityKgM3", "气体密度", "kg/m³"], ["liquidDensityKgM3", "液体密度", "kg/m³"],
    ["boilingPointK", "沸点", "K"], ["vaporPressurePa", "蒸气压", "Pa"], ["vaporHeatCapacityJkgK", "气相热容", "J/(kg·K)"],
    ["liquidHeatCapacityJkgK", "液相热容", "J/(kg·K)"], ["latentHeatJkg", "汽化热", "J/kg"], ["gamma", "绝热指数", "-"],
    ["erpg1Ppm", "ERPG-1", "ppm"], ["erpg2Ppm", "ERPG-2", "ppm"], ["erpg3Ppm", "ERPG-3", "ppm"],
  ];
  const save = async () => {
    try {
      if (chemical) await simulationApi.updateChemical(draft as ChemicalProfile);
      else await simulationApi.createChemical(draft as Omit<ChemicalProfile, "id">);
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "保存失败"); }
  };
  return <div className="chemical-dialog"><div className="chemical-card">
    <h2>{chemical ? "编辑化学品" : "新增化学品"}</h2>
    <div className="chemical-grid">
      <label>名称<input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>CAS<input value={draft.cas ?? ""} onChange={(e) => setDraft({ ...draft, cas: e.target.value })} /></label>
      <label>相态<select value={draft.phase} onChange={(e) => setDraft({ ...draft, phase: e.target.value as ChemicalProfile["phase"] })}><option value="gas">气体</option><option value="liquefiedGas">液化气</option></select></label>
      {numeric.map(([field, label, unit]) => <label key={field}>{label}<span><input type="number" step="any" value={(draft[field] as number | undefined) ?? ""} onChange={(e) => setDraft({ ...draft, [field]: number(e.target.value) })} /><em>{unit}</em></span></label>)}
      <label>物性来源<input value={draft.propertySource ?? ""} onChange={(e) => setDraft({ ...draft, propertySource: e.target.value })} /></label>
      <label>物性版本<input value={draft.propertyVersion ?? ""} onChange={(e) => setDraft({ ...draft, propertyVersion: e.target.value })} /></label>
      <label>ERPG 来源<input value={draft.erpgSource ?? ""} onChange={(e) => setDraft({ ...draft, erpgSource: e.target.value })} /></label>
      <label>ERPG 版本<input value={draft.erpgVersion ?? ""} onChange={(e) => setDraft({ ...draft, erpgVersion: e.target.value })} /></label>
    </div>
    {error && <p className="simulation-error">{error}</p>}
    <footer><button onClick={onClose}>取消</button><button className="is-primary" onClick={save}><Save size={16} />保存</button></footer>
  </div></div>;
}

export function SimulationPage() {
  const [config, setConfig] = useState<DashboardMapConfig>();
  const [chemicals, setChemicals] = useState<ChemicalProfile[]>([]);
  const [chemicalId, setChemicalId] = useState("");
  const [weather, setWeather] = useState<WeatherInput>();
  const [scenario, setScenario] = useState<ReleaseScenario>(initialScenario);
  const [run, setRun] = useState<SimulationRun>();
  const [frameIndex, setFrameIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<ChemicalProfile | "new">();
  const [selectedZone, setSelectedZone] = useState<ConsequenceZone>();
  const [service, setService] = useState<{ slabAvailable: boolean; engineVersion: string }>();
  const [showStabilityGuide, setShowStabilityGuide] = useState(false);
  const [activeLayers, setActiveLayers] = useState(simulationInitialLayers);

  const loadChemicals = async () => {
    const values = await simulationApi.getChemicals();
    setChemicals(values);
    const requested = new URLSearchParams(location.search).get("substance");
    setChemicalId((current) => current || values.find((item) => item.name === requested)?.id || values[0]?.id || "");
  };

  useEffect(() => {
    Promise.all([dashboardApi.getMapConfig(), simulationApi.getWeather(), simulationApi.health(), loadChemicals()])
      .then(([mapConfig, currentWeather, health]) => {
        setConfig(mapConfig); setWeather(currentWeather); setService(health);
        const params = new URLSearchParams(location.search);
        const mapX = Number(params.get("mapX"));
        const mapY = Number(params.get("mapY"));
        if (mapConfig.calibration && Number.isFinite(mapX) && Number.isFinite(mapY) && params.has("mapX") && params.has("mapY")) {
          setScenario((current) => ({ ...current, sourceCoordinate: mapToPhysical(mapConfig.calibration!.mapToPhysicalMatrix, { x: mapX, y: mapY }) }));
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "本地计算服务不可用"));
  }, []);

  const calibration = config?.calibration;
  const missing = useMemo(() => {
    const fields: string[] = [];
    if (!chemicalId) fields.push("化学品");
    if (!weather) fields.push("气象数据");
    if (weather && !weather.stabilityClass) fields.push("Pasquill 稳定度");
    if (weather && weather.windSpeedMS < 0.5) fields.push("风速需人工修正至 ≥0.5 m/s");
    if (!calibration) fields.push("地图标定");
    else if (!calibration.validForSimulation) fields.push("地图标定误差需 ≤5 m");
    return fields;
  }, [calibration, chemicalId, weather]);

  const displayedZones = frameIndex < 0 ? run?.zones ?? [] : run?.frames[frameIndex]?.zones ?? [];
  const pointCounts = useMemo(() => {
    const counts = (config?.mapPoints ?? []).reduce<Record<string, number>>((values, point) => {
      values[point.layer] = (values[point.layer] ?? 0) + 1;
      return values;
    }, {});
    counts.escapeRoute = config?.escapeRoutes.length ?? 0;
    return counts;
  }, [config]);
  const risks = useMemo(() => {
    if (!config || !calibration || !run) return [];
    const priority = run.zones;
    return config.mapPoints.flatMap((point) => {
      const physical = mapToPhysical(calibration.mapToPhysicalMatrix, { x: point.x, y: point.y });
      const zone = priority.find((item) => pointInPolygon(physical, item.coordinates));
      return zone ? [{ point, zone }] : [];
    });
  }, [calibration, config, run]);

  const selectMap = (point: { x: number; y: number }) => {
    if (!calibration) return;
    setScenario((current) => ({ ...current, sourceCoordinate: mapToPhysical(calibration.mapToPhysicalMatrix, point) }));
  };

  const execute = async () => {
    if (!weather || missing.length) return;
    setRunning(true); setError(""); setRun(undefined); setFrameIndex(-1);
    try { setRun(await simulationApi.run(chemicalId, scenario, weather)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "计算失败"); }
    finally { setRunning(false); }
  };

  const setScenarioNumber = (field: keyof ReleaseScenario, value: number) => setScenario((current) => ({ ...current, [field]: value }));
  const correctWeather = (field: keyof WeatherInput, value: number | string) => setWeather((current) => current ? { ...current, [field]: value, corrected: true, source: `${current.source}+manual-correction` } : current);
  const selectedChemical = chemicals.find((item) => item.id === chemicalId);

  return <main className="simulation-page">
    <header className="simulation-header">
      <a href="/"><ArrowLeft size={18} />返回应急平台</a>
      <div><FlaskConical size={22} /><span>有毒有害物质泄漏事故后果模拟</span><a className="simulation-engine-link" href="/simulation/methodology" target="_blank" rel="noreferrer" aria-label="查看计算方法、参考依据与适用限制" title="查看计算方法、参考依据与适用限制"><b>模拟引擎 {service?.engineVersion ?? "--"}</b><CircleHelp size={15} /></a></div>
      <a href="/config/calibration">地图标定</a>
    </header>
    <section className="simulation-workspace">
      <aside className="simulation-left">
        <h2>场景参数</h2>
        <label className="simulation-select"><span>事故物质</span><select value={chemicalId} onChange={(e) => setChemicalId(e.target.value)}>{chemicals.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.cas}</option>)}</select></label>
        <div className="chemical-actions"><button onClick={() => setEditor("new")}><Plus size={14} />新增</button><button disabled={!selectedChemical} onClick={() => selectedChemical && setEditor(selectedChemical)}><Pencil size={14} />编辑</button><button disabled={!selectedChemical} onClick={async () => { if (selectedChemical && confirm(`确认删除 ${selectedChemical.name}？`)) { await simulationApi.deleteChemical(selectedChemical.id); setChemicalId(""); await loadChemicals(); } }}><Trash2 size={14} />删除</button></div>
        <label className="simulation-select"><span>泄漏类型</span><select value={scenario.releaseType} onChange={(e) => setScenario({ ...scenario, releaseType: e.target.value as ReleaseScenario["releaseType"] })}><option value="pressurizedGas">加压气体孔泄漏</option><option value="liquefiedGas">液化气闪蒸/液池</option><option value="instantaneous">瞬时完全释放</option></select></label>
        <Input label="库存量" value={scenario.inventoryKg} unit="kg" onChange={(v) => setScenarioNumber("inventoryKg", v)} />
        {scenario.releaseType !== "instantaneous" && <><Input label="隔离时间" value={scenario.isolationTimeS} unit="s" onChange={(v) => setScenarioNumber("isolationTimeS", v)} /><Input label="孔径" value={scenario.holeDiameterM ?? 0} unit="m" onChange={(v) => setScenarioNumber("holeDiameterM", v)} /><Input label="设备绝压" value={scenario.vesselPressurePa ?? 0} unit="Pa" onChange={(v) => setScenarioNumber("vesselPressurePa", v)} /></>}
        <Input label="物料温度" value={scenario.releaseTemperatureK} unit="K" onChange={(v) => setScenarioNumber("releaseTemperatureK", v)} />
        <Input label="释放高度" value={scenario.releaseHeightM} unit="m" onChange={(v) => setScenarioNumber("releaseHeightM", v)} />
        {scenario.releaseType === "liquefiedGas" && <><Input label="液池面积" value={scenario.poolAreaM2 ?? 0} unit="m²" onChange={(v) => setScenarioNumber("poolAreaM2", v)} /><Input label="地面热通量" value={scenario.poolHeatFluxWM2 ?? 0} unit="W/m²" onChange={(v) => setScenarioNumber("poolHeatFluxWM2", v)} /><Input label="质量传递系数" value={scenario.massTransferCoefficientMS ?? 0} unit="m/s" onChange={(v) => setScenarioNumber("massTransferCoefficientMS", v)} /><Input label="蒸气压" value={scenario.vaporPressurePa ?? 0} unit="Pa" onChange={(v) => setScenarioNumber("vaporPressurePa", v)} /></>}
        <h2><Wind size={17} />气象输入 {weather?.corrected && <em>已人工修正</em>}</h2>
        {weather && <><Input label="风速" value={weather.windSpeedMS} unit="m/s" onChange={(v) => correctWeather("windSpeedMS", v)} /><Input label="风向（来向）" value={weather.windDirectionDeg} unit="°" onChange={(v) => correctWeather("windDirectionDeg", v)} /><Input label="环境温度" value={weather.temperatureK} unit="K" onChange={(v) => correctWeather("temperatureK", v)} /><Input label="环境压力" value={weather.pressurePa} unit="Pa" onChange={(v) => correctWeather("pressurePa", v)} /><Input label="相对湿度" value={weather.relativeHumidityPct} unit="%" onChange={(v) => correctWeather("relativeHumidityPct", v)} /><Input label="地表粗糙度" value={weather.surfaceRoughnessM} unit="m" onChange={(v) => correctWeather("surfaceRoughnessM", v)} /><div className="simulation-select"><span className="simulation-label-with-help">Pasquill 稳定度<button type="button" className="stability-guide-button" aria-label="查看 Pasquill 大气稳定度选值备注" title="查看选值备注" onClick={() => setShowStabilityGuide(true)}><CircleHelp size={16} /></button></span><select aria-label="Pasquill 稳定度" value={weather.stabilityClass} onChange={(e) => correctWeather("stabilityClass", e.target.value)}><option value="">请人工确认</option>{["A", "B", "C", "D", "E", "F"].map((v) => <option key={v}>{v}</option>)}</select></div></>}
        <p className="source-coordinate">泄漏点：X东 {scenario.sourceCoordinate.eastM.toFixed(1)} m / Y北 {scenario.sourceCoordinate.northM.toFixed(1)} m<br /><small>点击中部地图可修改</small></p>
        {missing.length > 0 && <div className="simulation-blocker">禁止运行：{missing.join("、")}</div>}
        {run?.modelRoute.model === "slab" && !service?.slabAvailable && <div className="simulation-blocker">SLAB 平台可执行文件未安装</div>}
        {error && <div className="simulation-error">{error}</div>}
        <button className="simulation-run" disabled={running || missing.length > 0} onClick={execute}><Play size={18} />{running ? "计算中…" : "运行后果计算"}</button>
      </aside>
      <section className="simulation-map-panel">
        {config && <MapStage points={config.mapPoints} routes={config.escapeRoutes} activeLayers={activeLayers} onSelectPoint={(point) => selectMap(point)} onSelectMapCoordinate={selectMap} simulationZones={displayedZones} simulationSource={scenario.sourceCoordinate} calibration={calibration} onSelectZone={setSelectedZone} />}
        <div className="layer-box">
          <div className="layer-box__title"><Layers size={20} />图层</div>
          {simulationLayerOrder.map((layer) => <button className={`layer-row ${activeLayers[layer] ? "is-active" : ""}`} key={layer} type="button" data-testid={`simulation-layer-${layer}`} onClick={() => setActiveLayers((current) => ({ ...current, [layer]: !current[layer] }))}><span className="layer-check" /><span className="layer-label">{simulationLayerLabels[layer]}</span><em>{pointCounts[layer] ?? 0}</em></button>)}
        </div>
        <div className="simulation-legend"><span><i style={{ background: "#ff3b30" }} />ERPG-3</span><span><i style={{ background: "#ffc400" }} />ERPG-2</span><span><i style={{ background: "#168cff" }} />ERPG-1</span></div>
        {!calibration?.validForSimulation && <div className="map-calibration-warning">需先完成误差 ≤5 m 的地图标定</div>}
      </section>
      <aside className="simulation-right">
        <h2>结果摘要</h2>
        {!run ? <div className="simulation-empty">完成参数与标定检查后运行模拟</div> : <>
          <div className="route-card"><b>{run.modelRoute.model === "slab" ? "EPA SLAB 重气" : "Pasquill-Gifford 高斯"}</b><span>Ri = {run.modelRoute.richardsonNumber.toFixed(3)} / 临界 1.0</span><small>{run.modelRoute.modelVersion}</small></div>
          <div className="result-metrics"><span><b>{run.summary.releasedMassKg.toFixed(2)}</b> kg<br />有效释放</span><span><b>{run.summary.effectiveDurationS.toFixed(0)}</b> s<br />泄漏时长</span></div>
          {run.zones.map((zone) => <button className="zone-result" style={{ borderColor: zone.color }} key={zone.level} onClick={() => setSelectedZone(zone)}><b style={{ color: zone.color }}>{zone.level} · {zone.thresholdPpm} ppm</b><span>最远 {zone.maxDownwindDistanceM.toFixed(0)} m</span><span>最宽 {zone.maxWidthM.toFixed(0)} m</span><span>面积 {(zone.areaM2 / 10000).toFixed(2)} ha</span></button>)}
          <h2>确定性风险提醒</h2>
          <p className="evacuation-tip">优先向上风向 {weather?.windDirectionDeg.toFixed(0)}° 并侧上风方向撤离，避免穿越羽流。</p>
          <div className="risk-list">{risks.length ? risks.map(({ point, zone }) => <span key={point.id}><b>{zone.level}</b>{point.name} · {point.layer}</span>) : <span>已标定要素未与影响区相交</span>}</div>
        </>}
        {selectedZone && <div className="zone-detail"><b>{selectedZone.level} · {selectedZone.thresholdPpm} ppm</b><p>{selectedZone.harmDescription}</p><span>到达时间 {selectedZone.arrivalTimeS.toFixed(0)} s · 持续 {selectedZone.durationS.toFixed(0)} s</span></div>}
      </aside>
      <footer className="simulation-timeline"><Clock3 size={17} /><button className={frameIndex < 0 ? "is-active" : ""} onClick={() => setFrameIndex(-1)}>最大包络</button><input type="range" min="0" max={Math.max((run?.frames.length ?? 1) - 1, 0)} value={Math.max(frameIndex, 0)} disabled={!run || frameIndex < 0} onChange={(e) => setFrameIndex(Number(e.target.value))} /><span>{frameIndex < 0 ? "全时段" : `${run?.frames[frameIndex]?.timeS.toFixed(0) ?? 0} s`}</span><button disabled={!run} onClick={() => setFrameIndex(frameIndex < 0 ? 0 : -1)}>{frameIndex < 0 ? "进入逐时" : "返回包络"}</button></footer>
    </section>
    {editor && <ChemicalEditor chemical={editor === "new" ? undefined : editor} onClose={() => setEditor(undefined)} onSaved={async () => { setEditor(undefined); await loadChemicals(); }} />}
    {showStabilityGuide && <div className="stability-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="stability-guide-title" onClick={() => setShowStabilityGuide(false)}><div className="stability-guide-card" onClick={(event) => event.stopPropagation()}><header><h2 id="stability-guide-title">Pasquill 大气稳定度选值备注</h2><button type="button" aria-label="关闭选值备注" onClick={() => setShowStabilityGuide(false)}><X size={20} /></button></header><img src="/assets/pasquill-stability-guide.png" alt="表 E.5 Pasquill 大气稳定度确定：根据地面风速、白天日照和夜间云量选择稳定度等级" /></div></div>}
  </main>;
}
