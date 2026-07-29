import { Eye, Monitor, RefreshCw, Search, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { incidentStatusLabels, incidentTypeOptions } from "../data/incidents";
import { dashboardApi } from "../services/dashboardApi";
import type { EmergencyIncident, IncidentStatus } from "../types";

function displayTime(value: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function IncidentManagementPage() {
  const [draftKeyword, setDraftKeyword] = useState("");
  const [draftStatus, setDraftStatus] = useState<IncidentStatus | "">("");
  const [draftType, setDraftType] = useState("");
  const [filters, setFilters] = useState<{ keyword: string; status: IncidentStatus | ""; type: string }>({
    keyword: "",
    status: "",
    type: "",
  });
  const [incidents, setIncidents] = useState<EmergencyIncident[]>([]);
  const [selected, setSelected] = useState<EmergencyIncident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const records = await dashboardApi.listIncidents(filters);
      setIncidents(records);
      setError("");
      setSelected((current) => current ? records.find((item) => item.id === current.id) ?? current : null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "事件记录加载失败");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  const query = () => {
    setLoading(true);
    setFilters({ keyword: draftKeyword.trim(), status: draftStatus, type: draftType });
  };

  const reset = () => {
    setDraftKeyword("");
    setDraftStatus("");
    setDraftType("");
    setLoading(true);
    setFilters({ keyword: "", status: "", type: "" });
  };

  return (
    <main className="event-admin-page">
      <header className="event-admin-header">
        <div>
          <Monitor size={24} />
          <span>事件管理</span>
        </div>
        <nav>
          <a href="/"><Monitor size={16} />应急大屏</a>
          <a href="/report"><Smartphone size={16} />H5事件上报</a>
        </nav>
      </header>

      <section className="event-admin-content">
        <div className="event-admin-title">
          <div>
            <h1>上报事件记录</h1>
            <p>统一查询事件上报、研判、响应及终止状态</p>
          </div>
          <button type="button" onClick={load}><RefreshCw size={16} />刷新</button>
        </div>

        <div className="event-filters">
          <label>
            <span>关键词</span>
            <input
              value={draftKeyword}
              onChange={(event) => setDraftKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") query();
              }}
              placeholder="事件名称、地点、描述、上报人"
              data-testid="event-keyword"
            />
          </label>
          <label>
            <span>事件状态</span>
            <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value as IncidentStatus | "")}>
              <option value="">全部状态</option>
              {Object.entries(incidentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>事件类型</span>
            <select value={draftType} onChange={(event) => setDraftType(event.target.value)}>
              <option value="">全部类型</option>
              {incidentTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <div className="event-filter-actions">
            <button type="button" onClick={reset}>重置</button>
            <button className="is-primary" type="button" onClick={query} data-testid="event-query"><Search size={16} />查询</button>
          </div>
        </div>

        <section className="event-table-card">
          <div className="event-table-meta">共 <b>{incidents.length}</b> 条事件记录</div>
          {error ? <div className="event-admin-error" role="alert">{error}</div> : null}
          <div className="event-table-wrap">
            <table className="event-table">
              <thead>
                <tr>
                  <th>事件名称</th>
                  <th>类型</th>
                  <th>事件地点</th>
                  <th>上报人</th>
                  <th>上报时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td><b>{incident.title}</b><small>{incident.id}</small></td>
                    <td>{incident.type}</td>
                    <td>{incident.location}</td>
                    <td>{incident.reporter}<small>{incident.reporterPhone || "--"}</small></td>
                    <td>{displayTime(incident.reportedAt)}</td>
                    <td><span className={`event-status event-status--${incident.status}`}>{incidentStatusLabels[incident.status]}</span></td>
                    <td><button type="button" onClick={() => setSelected(incident)}><Eye size={15} />详情</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && incidents.length === 0 ? <div className="event-empty">暂无符合条件的事件记录</div> : null}
            {loading ? <div className="event-empty">正在加载事件记录…</div> : null}
          </div>
        </section>
      </section>

      {selected ? (
        <div className="event-detail-mask" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelected(null);
        }}>
          <section className="event-detail-dialog" role="dialog" aria-modal="true" aria-label="事件详情">
            <header>
              <div>
                <span className={`event-status event-status--${selected.status}`}>{incidentStatusLabels[selected.status]}</span>
                <h2>{selected.title}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} title="关闭"><X size={20} /></button>
            </header>
            <dl>
              <div><dt>事件编号</dt><dd>{selected.id}</dd></div>
              <div><dt>事件类型</dt><dd>{selected.type}</dd></div>
              <div><dt>事件地点</dt><dd>{selected.location}</dd></div>
              <div><dt>上报人</dt><dd>{selected.reporter}</dd></div>
              <div><dt>联系电话</dt><dd>{selected.reporterPhone || "--"}</dd></div>
              <div><dt>上报时间</dt><dd>{displayTime(selected.reportedAt)}</dd></div>
              <div className="is-wide"><dt>事件描述</dt><dd>{selected.description}</dd></div>
              <div><dt>研判时间</dt><dd>{displayTime(selected.judgedAt)}</dd></div>
              <div><dt>响应时间</dt><dd>{displayTime(selected.respondedAt)}</dd></div>
              <div><dt>终止时间</dt><dd>{displayTime(selected.terminatedAt)}</dd></div>
              <div className="is-wide">
                <dt>终止原因</dt>
                <dd>{selected.terminationReasons.length ? selected.terminationReasons.join("；") : "--"}</dd>
              </div>
              {selected.terminationNote ? <div className="is-wide"><dt>补充说明</dt><dd>{selected.terminationNote}</dd></div> : null}
            </dl>
          </section>
        </div>
      ) : null}
    </main>
  );
}
