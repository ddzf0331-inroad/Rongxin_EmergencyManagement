import { CalendarDays, Edit3, Eye, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
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
  const [draftStartTime, setDraftStartTime] = useState("");
  const [draftEndTime, setDraftEndTime] = useState("");
  const [filters, setFilters] = useState<{ keyword: string; status: IncidentStatus | ""; type: string; startTime: string; endTime: string }>({
    keyword: "",
    status: "",
    type: "",
    startTime: "",
    endTime: "",
  });
  const [incidents, setIncidents] = useState<EmergencyIncident[]>([]);
  const [selected, setSelected] = useState<EmergencyIncident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const records = await dashboardApi.listIncidents(filters);
      const start = filters.startTime ? new Date(`${filters.startTime}T00:00:00`).getTime() : null;
      const end = filters.endTime ? new Date(`${filters.endTime}T23:59:59`).getTime() : null;
      setIncidents(records.filter((item) => {
        const reportedAt = new Date(item.reportedAt).getTime();
        if (start !== null && reportedAt < start) return false;
        if (end !== null && reportedAt > end) return false;
        return true;
      }));
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
    setFilters({ keyword: draftKeyword.trim(), status: draftStatus, type: draftType, startTime: draftStartTime, endTime: draftEndTime });
  };

  const reset = () => {
    setDraftKeyword("");
    setDraftStatus("");
    setDraftType("");
    setDraftStartTime("");
    setDraftEndTime("");
    setLoading(true);
    setFilters({ keyword: "", status: "", type: "", startTime: "", endTime: "" });
  };

  return (
    <main className="event-admin-page">
      <section className="event-admin-content">
        <div className="event-filters">
          <label className="event-search-field">
            <Search size={15} />
            <input
              value={draftKeyword}
              onChange={(event) => setDraftKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") query();
              }}
              placeholder="搜索事件名称/编号"
              data-testid="event-keyword"
            />
          </label>
          <label>
            <select value={draftType} onChange={(event) => setDraftType(event.target.value)}>
              <option value="">事件类型</option>
              {incidentTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>
            <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value as IncidentStatus | "")}>
              <option value="">状态</option>
              {Object.entries(incidentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="event-date-range">
            <input type="date" value={draftStartTime} onChange={(event) => setDraftStartTime(event.target.value)} aria-label="开始上报时间" />
            <span>→</span>
            <input type="date" value={draftEndTime} onChange={(event) => setDraftEndTime(event.target.value)} aria-label="结束上报时间" />
            <CalendarDays size={15} />
          </label>
          <label>
            <select aria-label="事件范围" defaultValue="all">
              <option value="all">全部</option>
            </select>
          </label>
          <div className="event-filter-actions">
            <button className="is-primary" type="button" onClick={query} data-testid="event-query"><Search size={15} />搜索</button>
            <button type="button" onClick={reset}><RefreshCw size={15} />重置</button>
          </div>
          <a className="event-add-button" href="/report"><Plus size={17} />新增上报</a>
        </div>

        <section className="event-table-card">
          {error ? <div className="event-admin-error" role="alert">{error}</div> : null}
          <div className="event-table-wrap">
            <table className="event-table">
              <thead>
                <tr>
                  <th>事件编号</th>
                  <th>状态</th>
                  <th>事件名称</th>
                  <th>事件类型</th>
                  <th>上报人</th>
                  <th>发生地点</th>
                  <th>上报时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td>{incident.incidentNo}</td>
                    <td><span className={`event-status event-status--${incident.status}`}>{incidentStatusLabels[incident.status]}</span></td>
                    <td><button className="event-title-button" type="button" onClick={() => setSelected(incident)}>{incident.title}</button></td>
                    <td>{incident.type}</td>
                    <td>{incident.reporter}</td>
                    <td>{incident.location}</td>
                    <td>{displayTime(incident.reportedAt)}</td>
                    <td className="event-actions">
                      <button type="button" onClick={() => setSelected(incident)}><Eye size={15} />查看</button>
                      <button type="button"><Edit3 size={15} />编辑</button>
                      <button className="is-danger" type="button"><Trash2 size={15} />删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && incidents.length === 0 ? <div className="event-empty">暂无符合条件的事件记录</div> : null}
            {loading ? <div className="event-empty">正在加载事件记录…</div> : null}
          </div>
          <footer className="event-table-footer">
            <span>共 {incidents.length} 条</span>
            <button type="button" disabled>‹</button>
            <b>1</b>
            <button type="button" disabled>›</button>
          </footer>
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
              <div><dt>事件编号</dt><dd>{selected.incidentNo}</dd></div>
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
