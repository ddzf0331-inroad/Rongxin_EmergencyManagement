import type { IncidentStatus } from "../types";

export const incidentTypeOptions = ["泄漏", "火灾", "爆炸", "中毒窒息", "设备故障", "自然灾害", "其他"];

export const incidentStatusLabels: Record<IncidentStatus, string> = {
  pending: "待研判",
  non_emergency: "非应急事件",
  responding: "响应中",
  terminated: "已终止",
};

export const terminationReasons = [
  "引发事故的危险源已得到有效控制、消除",
  "所有现场人员均得到妥善安置",
  "导致次生、衍生事故的危险因素得到消除",
  "应急总指挥确认为无需采取应急措施或必须终止的",
];
