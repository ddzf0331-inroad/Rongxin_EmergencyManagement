import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  FlaskConical,
  Save,
  Server,
} from "lucide-react";
import { useEffect, useState } from "react";
import { dashboardApi } from "../services/dashboardApi";
import type {
  ApiConfigTestResult,
  DashboardApiConfig,
  DashboardApiSourceConfig,
  DashboardApiSourceKey,
} from "../types";

const sourceKeys: DashboardApiSourceKey[] = [
  "materials",
  "drills",
  "hazards",
  "dashboardPlans",
  "chemicals",
  "cases",
  "responsePlans",
];

const sourceMeta: Record<
  DashboardApiSourceKey,
  { label: string; description: string; itemFields: Record<string, string> }
> = {
  materials: {
    label: "应急物资",
    description: "综合看板物资表格，仅展示临期与过期记录",
    itemFields: {
      id: "记录 ID", name: "物资名称", location: "存放位置", expireAt: "到期日",
      owner: "责任人", expiryStatus: "有效期状态",
    },
  },
  drills: {
    label: "应急演练",
    description: "应急演练统计卡片的明细弹窗",
    itemFields: {
      id: "记录 ID", time: "演练时间", department: "演练部门", unit: "演练单位",
      planName: "演练预案名称", status: "状态",
    },
  },
  hazards: {
    label: "重大危险源",
    description: "重大危险源分级卡片的明细弹窗",
    itemFields: {
      id: "记录 ID", level: "等级", name: "名称", area: "区域",
      owner: "责任人", medium: "危险介质", status: "状态",
    },
  },
  dashboardPlans: {
    label: "应急预案清单",
    description: "预案分类分布卡片的详细清单",
    itemFields: {
      id: "记录 ID", name: "预案名称", type: "预案类型", applicableArea: "适用区域",
      status: "状态", attachments: "附件列表",
    },
  },
  chemicals: {
    label: "化学品特性",
    description: "应急响应页面的化学特性与处置卡片",
    itemFields: {
      id: "记录 ID", name: "名称", alias: "别名", hazardClass: "危险类别",
      danger: "危险描述", emergencyMeasure: "应急措施", detail: "处置补充",
    },
  },
  cases: {
    label: "典型案例",
    description: "应急响应页面的典型事故案例",
    itemFields: {
      id: "记录 ID", title: "案例标题", accidentType: "事故类型",
      level: "事故级别", occurredAt: "发生时间", summary: "案例摘要",
    },
  },
  responsePlans: {
    label: "应急响应预案",
    description: "应急响应页面的相关预案列表",
    itemFields: {
      id: "记录 ID", name: "预案名称", category: "分类",
      level: "级别", owner: "责任部门", status: "状态",
    },
  },
};

const responseFields: Record<keyof DashboardApiSourceConfig["responsePaths"], string> = {
  code: "业务状态码",
  message: "响应消息",
  list: "列表",
  total: "总条数",
  page: "当前页",
  pageSize: "每页条数",
  pageUrl: "页面跳转地址",
  timestamp: "数据时间",
};

type TestState =
  | { state: "testing" }
  | { state: "success"; result: ApiConfigTestResult }
  | { state: "error"; message: string };

function cloneConfig(config: DashboardApiConfig): DashboardApiConfig {
  return JSON.parse(JSON.stringify(config)) as DashboardApiConfig;
}

function normalizeConfigForUi(config: DashboardApiConfig): DashboardApiConfig {
  const next = cloneConfig(config);
  const planPaths = next.sources.dashboardPlans.itemPaths;
  if (!planPaths.applicableArea && planPaths.version) {
    planPaths.applicableArea = planPaths.version;
  }
  return next;
}

function paramsToText(params: DashboardApiSourceConfig["defaultParams"]) {
  return Object.entries(params).map(([key, value]) => `${key}=${value}`).join("\n");
}

function textToParams(text: string) {
  return text.split("\n").reduce<Record<string, string>>((result, line) => {
    const [key, ...parts] = line.split("=");
    if (key.trim()) result[key.trim()] = parts.join("=").trim();
    return result;
  }, {});
}

export function ApiConfigPage() {
  const [config, setConfig] = useState<DashboardApiConfig | null>(null);
  const [expanded, setExpanded] = useState<DashboardApiSourceKey | null>("materials");
  const [tests, setTests] = useState<Partial<Record<DashboardApiSourceKey, TestState>>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    dashboardApi.getApiConfig()
      .then((next) => setConfig(normalizeConfigForUi(next)))
      .catch((error) => setMessage(error instanceof Error ? error.message : "API 配置加载失败"));
  }, []);

  const updateSource = (
    key: DashboardApiSourceKey,
    updater: (source: DashboardApiSourceConfig) => void,
  ) => {
    setConfig((current) => {
      if (!current) return current;
      const next = cloneConfig(current);
      updater(next.sources[key]);
      return next;
    });
    setSaveState("idle");
  };

  const testSource = async (key: DashboardApiSourceKey) => {
    if (!config) return;
    setTests((current) => ({ ...current, [key]: { state: "testing" } }));
    try {
      const result = await dashboardApi.testApiConfig(key, config);
      setTests((current) => ({ ...current, [key]: { state: "success", result } }));
    } catch (error) {
      setTests((current) => ({
        ...current,
        [key]: { state: "error", message: error instanceof Error ? error.message : "连接测试失败" },
      }));
    }
  };

  const save = async () => {
    if (!config) return;
    setSaveState("saving");
    setMessage("");
    try {
      const saved = await dashboardApi.saveApiConfig(config);
      setConfig(normalizeConfigForUi(saved));
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "API 配置保存失败");
    }
  };

  if (!config) {
    return (
      <main className="loading-screen">
        <Database size={28} />
        <span>{message || "正在加载 API 调用配置"}</span>
      </main>
    );
  }

  return (
    <main className="api-config-page">
      <header className="config-header api-config-header">
        <a className="config-back" href="/">
          <ArrowLeft size={18} />
          返回展示平台
        </a>
        <div className="config-title">
          <span>第三方 API 配置中心</span>
          <b>{saveState === "saved" ? "已共享保存" : "服务端配置"}</b>
        </div>
        <a className="config-save" href="/config">图层配置</a>
        <button className="config-save" type="button" onClick={save} disabled={saveState === "saving"}>
          <Save size={18} />
          {saveState === "saving" ? "保存中" : "保存配置"}
        </button>
      </header>

      <div className="api-config-scroll">
        <section className="api-config-shell">
          <div className="api-config-intro">
            <div>
              <Server size={25} />
              <span>
                <b>统一第三方环境地址</b>
                <em>7 类数据源共用此地址；浏览器通过本项目服务代理访问。</em>
              </span>
            </div>
            <label>
              <span>Base URL</span>
              <input
                value={config.baseUrl}
                onChange={(event) => {
                  setConfig({ ...config, baseUrl: event.target.value });
                  setSaveState("idle");
                }}
                placeholder="https://your-domain.com"
                spellCheck={false}
              />
            </label>
            <small>仅支持 http/https；各数据源路径必须以 / 开头。</small>
          </div>

          {message ? (
            <div className={`api-config-message api-config-message--${saveState === "error" ? "error" : "info"}`}>
              <AlertTriangle size={17} />
              {message}
            </div>
          ) : null}

          <section className="api-source-list">
            {sourceKeys.map((key) => {
              const source = config.sources[key];
              const meta = sourceMeta[key];
              const test = tests[key];
              const isExpanded = expanded === key;
              return (
                <article className={`api-source-card ${source.enabled ? "is-enabled" : ""}`} key={key}>
                  <div className="api-source-card__header">
                    <label className="api-source-switch">
                      <input
                        checked={source.enabled}
                        type="checkbox"
                        onChange={(event) => updateSource(key, (item) => { item.enabled = event.target.checked; })}
                      />
                      <span />
                    </label>
                    <button
                      className="api-source-card__toggle"
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : key)}
                    >
                      <b>{meta.label}</b>
                      <em>{meta.description}</em>
                      <code>{key}</code>
                      {isExpanded ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="api-source-card__body">
                      <div className="api-form-grid api-form-grid--main">
                        <label>
                          <span>GET API 路径</span>
                          <input
                            value={source.apiPath}
                            onChange={(event) => updateSource(key, (item) => { item.apiPath = event.target.value; })}
                            placeholder="/api/open/resources"
                          />
                        </label>
                        <label>
                          <span>页面跳转路径（兜底）</span>
                          <input
                            value={source.pagePath}
                            onChange={(event) => updateSource(key, (item) => { item.pagePath = event.target.value; })}
                            placeholder="/resources"
                          />
                        </label>
                        <label>
                          <span>成功码</span>
                          <input
                            value={String(source.successValue)}
                            onChange={(event) => updateSource(key, (item) => { item.successValue = event.target.value; })}
                          />
                        </label>
                        <label>
                          <span>详情 ID 参数名</span>
                          <input
                            value={source.detailIdParam}
                            onChange={(event) => updateSource(key, (item) => { item.detailIdParam = event.target.value; })}
                          />
                        </label>
                      </div>

                      <div className="api-form-section">
                        <h3>查询参数</h3>
                        <div className="api-form-grid">
                          <label className="api-form-span-2">
                            <span>默认参数（每行 key=value）</span>
                            <textarea
                              value={paramsToText(source.defaultParams)}
                              onChange={(event) => updateSource(key, (item) => {
                                item.defaultParams = textToParams(event.target.value);
                              })}
                              placeholder={"type=material\nstatus=warning"}
                            />
                          </label>
                          {(["page", "pageSize", "keyword"] as const).map((name) => (
                            <label key={name}>
                              <span>{name} 参数名{name === "keyword" ? "（可选）" : ""}</span>
                              <input
                                value={source.queryParams[name]}
                                onChange={(event) => updateSource(key, (item) => {
                                  item.queryParams[name] = event.target.value;
                                })}
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="api-form-section">
                        <h3>响应字段点路径</h3>
                        <div className="api-form-grid api-form-grid--mapping">
                          {(Object.keys(responseFields) as Array<keyof typeof responseFields>).map((name) => (
                            <label key={name}>
                              <span>{responseFields[name]}</span>
                              <input
                                value={source.responsePaths[name]}
                                onChange={(event) => updateSource(key, (item) => {
                                  item.responsePaths[name] = event.target.value;
                                })}
                                placeholder={name === "list" ? "data.list" : name}
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="api-form-section">
                        <h3>单条明细字段点路径</h3>
                        <div className="api-form-grid api-form-grid--mapping">
                          {Object.entries(meta.itemFields).map(([name, label]) => (
                            <label key={name}>
                              <span>{label}</span>
                              <input
                                value={source.itemPaths[name] ?? ""}
                                onChange={(event) => updateSource(key, (item) => {
                                  item.itemPaths[name] = event.target.value;
                                })}
                                placeholder={name}
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      {key === "materials" && source.statusValues ? (
                        <div className="api-form-section">
                          <h3>物资有效期状态值</h3>
                          <div className="api-form-grid">
                            <label>
                              <span>第三方“临期”值</span>
                              <input
                                value={source.statusValues.expiring}
                                onChange={(event) => updateSource(key, (item) => {
                                  if (item.statusValues) item.statusValues.expiring = event.target.value;
                                })}
                              />
                            </label>
                            <label>
                              <span>第三方“过期”值</span>
                              <input
                                value={source.statusValues.expired}
                                onChange={(event) => updateSource(key, (item) => {
                                  if (item.statusValues) item.statusValues.expired = event.target.value;
                                })}
                              />
                            </label>
                          </div>
                        </div>
                      ) : null}

                      <div className="api-test-row">
                        <button type="button" onClick={() => testSource(key)} disabled={test?.state === "testing"}>
                          <FlaskConical size={17} />
                          {test?.state === "testing" ? "正在测试" : "测试连接"}
                        </button>
                        {test?.state === "success" ? (
                          <span className="api-test-status is-success">
                            <CheckCircle2 size={17} />
                            HTTP {test.result.httpStatus} · {test.result.elapsedMs}ms ·
                            {test.result.normalized.data.list.length} 条预览
                          </span>
                        ) : null}
                        {test?.state === "error" ? (
                          <span className="api-test-status is-error">
                            <AlertTriangle size={17} />
                            {test.message}
                          </span>
                        ) : null}
                      </div>

                      {test?.state === "success" ? (
                        <div className="api-test-result">
                          <p>{test.result.requestUrl}</p>
                          {test.result.warning ? <strong>{test.result.warning}</strong> : null}
                          <pre>{JSON.stringify(test.result.normalized.data, null, 2)}</pre>
                          <details>
                            <summary>查看原始响应摘要</summary>
                            <pre>{test.result.rawPreview}</pre>
                          </details>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        </section>
      </div>
    </main>
  );
}
