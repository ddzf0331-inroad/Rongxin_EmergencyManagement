import { CheckCircle2, ChevronLeft, Clock3, MapPin, Send, ShieldAlert, UserRound } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { incidentTypeOptions } from "../data/incidents";
import { dashboardApi } from "../services/dashboardApi";
import type { EmergencyIncident, IncidentCreateInput } from "../types";

const emptyForm: IncidentCreateInput = {
  title: "",
  type: incidentTypeOptions[0],
  location: "",
  description: "",
  reporter: "张三",
  reporterPhone: "",
};

function displayTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function IncidentReportPage() {
  const [form, setForm] = useState<IncidentCreateInput>(emptyForm);
  const [submitted, setSubmitted] = useState<EmergencyIncident | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const update = (field: keyof IncidentCreateInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      setSubmitted(await dashboardApi.createIncident(form));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="report-page">
        <section className="report-success" data-testid="report-success">
          <span className="report-success__icon"><CheckCircle2 size={44} /></span>
          <h1>事件上报成功</h1>
          <p>指挥中心已收到事件信息，当前状态为“待研判”。</p>
          <dl>
            <div><dt>事件编号</dt><dd>{submitted.incidentNo}</dd></div>
            <div><dt>事件名称</dt><dd>{submitted.title}</dd></div>
            <div><dt>上报时间</dt><dd>{displayTime(submitted.reportedAt)}</dd></div>
          </dl>
          <button type="button" onClick={() => {
            setForm(emptyForm);
            setSubmitted(null);
          }}>
            继续上报
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="report-page">
      <header className="report-header">
        <a href="/" aria-label="返回应急平台"><ChevronLeft size={22} /></a>
        <div>
          <ShieldAlert size={26} />
          <span>突发事件上报</span>
        </div>
        <i />
      </header>

      <form className="report-form" onSubmit={submit}>
        <section className="report-intro">
          <strong>现场事件快速上报</strong>
          <span>请如实填写现场信息，提交后将同步至应急指挥中心。</span>
        </section>

        <label className="report-field">
          <span><ShieldAlert size={17} />事件名称<em>*</em></span>
          <input
            required
            maxLength={100}
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="请输入事件名称"
            data-testid="report-title"
          />
        </label>

        <label className="report-field">
          <span>事件类型<em>*</em></span>
          <select
            required
            value={form.type}
            onChange={(event) => update("type", event.target.value)}
            data-testid="report-type"
          >
            {incidentTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>

        <label className="report-field">
          <span><MapPin size={17} />事件地点<em>*</em></span>
          <input
            required
            maxLength={200}
            value={form.location}
            onChange={(event) => update("location", event.target.value)}
            placeholder="请输入厂区、装置及具体点位"
            data-testid="report-location"
          />
        </label>

        <label className="report-field">
          <span>事件描述<em>*</em></span>
          <textarea
            required
            maxLength={1000}
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
            placeholder="请描述现场情况、影响范围及已采取措施"
            data-testid="report-description"
          />
          <small>{form.description.length}/1000</small>
        </label>

        <div className="report-grid">
          <label className="report-field">
            <span><UserRound size={17} />上报人<em>*</em></span>
            <input
              required
              maxLength={60}
              value={form.reporter}
              onChange={(event) => update("reporter", event.target.value)}
              placeholder="请输入姓名"
              data-testid="report-reporter"
            />
          </label>
          <label className="report-field">
            <span>联系电话</span>
            <input
              maxLength={30}
              inputMode="tel"
              value={form.reporterPhone}
              onChange={(event) => update("reporterPhone", event.target.value)}
              placeholder="选填"
              data-testid="report-phone"
            />
          </label>
        </div>

        <div className="report-time-note">
          <Clock3 size={17} />
          上报时间将在提交成功后由系统自动记录
        </div>
        {error ? <div className="report-error" role="alert">{error}</div> : null}
        <button className="report-submit" disabled={submitting} type="submit" data-testid="report-submit">
          <Send size={19} />
          {submitting ? "正在提交" : "提交事件"}
        </button>
      </form>
    </main>
  );
}
