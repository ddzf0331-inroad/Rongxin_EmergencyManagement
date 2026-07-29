import type { EChartsOption } from "echarts";
import type { DonutItem, DrillMonthStat } from "../types";

export function donutOption(items: DonutItem[], total: number, unit: string): EChartsOption {
  return {
    animationDuration: 900,
    color: items.map((item) => item.color),
    tooltip: { show: false },
    legend: { show: false },
    series: [
      {
        type: "pie",
        radius: ["48%", "76%"],
        center: ["42%", "50%"],
        avoidLabelOverlap: true,
        label: {
          color: "#e7f7ff",
          fontSize: 14,
          formatter: "{c}",
        },
        labelLine: {
          length: 8,
          length2: 2,
          lineStyle: { color: "rgba(130, 224, 255, 0.55)" },
        },
        itemStyle: {
          borderWidth: 0,
          shadowColor: "rgba(0, 167, 255, 0.25)",
          shadowBlur: 12,
        },
        data: items.map((item) => ({ value: item.value, name: item.name })),
      },
      {
        type: "pie",
        radius: ["0%", "43%"],
        center: ["42%", "50%"],
        silent: true,
        label: {
          position: "center",
          formatter: [`{label|合计}`, `{value|${total}}`, `{unit|${unit}}`].join("\n"),
          rich: {
            label: { color: "#b8d7e7", fontSize: 17, lineHeight: 24 },
            value: { color: "#1e7dff", fontSize: 30, fontWeight: 700, lineHeight: 36 },
            unit: { color: "#c9d5e2", fontSize: 17, lineHeight: 20 },
          },
        },
        itemStyle: { color: "rgba(3, 23, 45, 0.88)" },
        data: [{ value: 1 }],
      },
    ],
  };
}

export function barOption(rows: DrillMonthStat[]): EChartsOption {
  const toWholeCount = (value: number) => Math.round(value);
  const maxCount = Math.max(10, ...rows.flatMap((row) => [toWholeCount(row.plan), toWholeCount(row.done)]));

  return {
    animationDuration: 800,
    grid: { left: 38, right: 18, top: 34, bottom: 30 },
    tooltip: { show: false },
    legend: {
      top: 2,
      left: 56,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: "#a9c7df", fontSize: 13 },
      data: ["计划次数", "完成次数"],
    },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.month),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "rgba(114, 197, 255, 0.28)" } },
      axisLabel: {
        color: "#b9cad8",
        fontSize: rows.length > 6 ? 12 : 15,
        interval: 0,
        formatter: (value: string) => (value.length > 4 ? `${value.slice(0, 4)}…` : value),
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: Math.ceil(maxCount / 2) * 2,
      splitNumber: 5,
      axisLabel: { color: "#99b7cc", fontSize: 12 },
      splitLine: { lineStyle: { color: "rgba(50, 142, 205, 0.22)" } },
    },
    series: [
      {
        name: "计划次数",
        type: "bar",
        barWidth: 13,
        data: rows.map((row) => toWholeCount(row.plan)),
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#2e8dff" },
              { offset: 1, color: "#0d49c9" },
            ],
          },
        },
      },
      {
        name: "完成次数",
        type: "bar",
        barWidth: 13,
        data: rows.map((row) => toWholeCount(row.done)),
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#69d65d" },
              { offset: 1, color: "#327d36" },
            ],
          },
        },
      },
    ],
  };
}
