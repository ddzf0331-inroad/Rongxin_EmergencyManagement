import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { incidentStatusLabels, incidentTypeOptions } from "../data/incidents";
import { dashboardApi } from "../services/dashboardApi";
import type { EmergencyIncident, IncidentStatus } from "../types";

const calendarWeekdays = ["一", "二", "三", "四", "五", "六", "日"];

function displayTime(value: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function monthCells(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(month.getFullYear(), month.getMonth(), index - mondayOffset + 1);
    return { date, currentMonth: date.getMonth() === month.getMonth() };
  });
}

function IncidentCalendarMonth({
  month,
  start,
  end,
  onSelect,
}: {
  month: Date;
  start: string;
  end: string;
  onSelect: (value: string) => void;
}) {
  const today = dateKey(new Date());
  return (
    <section className="event-calendar-month">
      <div className="event-calendar-weekdays">
        {calendarWeekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>
      <div className="event-calendar-days">
        {monthCells(month).map(({ date, currentMonth }) => {
          const value = dateKey(date);
          const inRange = Boolean(start && end && value > start && value < end);
          const classNames = [
            "event-calendar-day",
            currentMonth ? "" : "is-outside",
            value === today ? "is-today" : "",
            value === start ? "is-start" : "",
            value === end ? "is-end" : "",
            inRange ? "is-in-range" : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              className={classNames}
              disabled={!currentMonth}
              key={value}
              onClick={() => onSelect(value)}
              type="button"
              aria-label={`选择${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function IncidentDateRangePicker({
  start,
  end,
  onStartChange,
  onEndChange,
}: {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const nextMonth = addMonths(visibleMonth, 1);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const selectDate = (value: string) => {
    if (!start || end) {
      onStartChange(value);
      onEndChange("");
      return;
    }
    if (value < start) {
      onStartChange(value);
      return;
    }
    onEndChange(value);
    setOpen(false);
  };

  return (
    <div className="event-date-picker" ref={rootRef}>
      <button
        className={`event-date-picker__trigger${open ? " is-open" : ""}`}
        type="button"
        aria-expanded={open}
        aria-label="上报时间范围"
        onClick={() => {
          if (!open) {
            const base = start ? parseDate(start) : new Date();
            setVisibleMonth(new Date(base.getFullYear(), base.getMonth(), 1));
          }
          setOpen((current) => !current);
        }}
      >
        <span className={start ? "has-value" : ""}>{start ? start.replaceAll("-", "/") : "开始日期"}</span>
        <i>→</i>
        <span className={end ? "has-value" : ""}>{end ? end.replaceAll("-", "/") : "结束日期"}</span>
        <CalendarDays size={15} />
      </button>
      {open ? (
        <div className="event-date-picker__popover" role="dialog" aria-label="选择上报时间范围">
          <header className="event-calendar-header">
            <nav aria-label="向前切换月份">
              <button type="button" title="上一年" onClick={() => setVisibleMonth((current) => addMonths(current, -12))}><ChevronsLeft size={16} /></button>
              <button type="button" title="上个月" onClick={() => setVisibleMonth((current) => addMonths(current, -1))}><ChevronLeft size={16} /></button>
            </nav>
            <strong>{visibleMonth.getFullYear()}年 {visibleMonth.getMonth() + 1}月</strong>
            <strong>{nextMonth.getFullYear()}年 {nextMonth.getMonth() + 1}月</strong>
            <nav aria-label="向后切换月份">
              <button type="button" title="下个月" onClick={() => setVisibleMonth((current) => addMonths(current, 1))}><ChevronRight size={16} /></button>
              <button type="button" title="下一年" onClick={() => setVisibleMonth((current) => addMonths(current, 12))}><ChevronsRight size={16} /></button>
            </nav>
          </header>
          <div className="event-calendar-panels">
            <IncidentCalendarMonth month={visibleMonth} start={start} end={end} onSelect={selectDate} />
            <IncidentCalendarMonth month={nextMonth} start={start} end={end} onSelect={selectDate} />
          </div>
        </div>
      ) : null}
    </div>
  );
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
  const [processingId, setProcessingId] = useState("");

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

  const remove = async (incident: EmergencyIncident) => {
    if (!window.confirm(`确认删除事件“${incident.incidentNo}”？`)) return;
    setProcessingId(incident.id);
    try {
      await dashboardApi.deleteIncident(incident.id);
      setSelected((current) => current?.id === incident.id ? null : current);
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "事件删除失败");
    } finally {
      setProcessingId("");
    }
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
          <IncidentDateRangePicker
            start={draftStartTime}
            end={draftEndTime}
            onStartChange={setDraftStartTime}
            onEndChange={setDraftEndTime}
          />
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
                      <button className="is-danger" type="button" disabled={processingId === incident.id} onClick={() => remove(incident)}>
                        <Trash2 size={15} />{processingId === incident.id ? "删除中" : "删除"}
                      </button>
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
