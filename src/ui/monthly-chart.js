// 월별 그래프(Chart.js): 월별 사용량·발전량·자가소비 막대 + 월별 절감액 선, 그리고 계절 요약 표.
// 그래프는 한 번 만들고 입력이 바뀌면 데이터만 바꿔 update()한다.
import { el, fmt } from "./dom.js";

const COLORS = {
  usage: "#94A3B8", // 사용량: 회색 계열
  gen: "#38BDF8", // 발전량: Cyan
  self: "#34D399", // 자가소비: 초록
  saving: "#FBBF24", // 절감액 선: 호박색
  grid: "#334155",
  text: "#CBD5E1",
};

/**
 * @param {HTMLElement} container
 * @returns {{ update(data: { year1: { gen: number[], self: number[], export: number[], saving: number[] }, usage: number[], seasons: any[], dayShare: number }): void, hide(): void }}
 */
export function createMonthlyChart(container) {
  const Chart = /** @type {any} */ (window).Chart;
  if (!Chart) throw new Error("Chart.js를 불러오지 못했습니다(vendor/chart.umd.js 확인)");

  const canvas = el("canvas", { role: "img", "aria-label": "월별 발전량과 사용량 그래프" });
  const box = el("div", { class: "chart-box" });
  box.append(canvas);
  const summary = el("p", { class: "card-note" });
  const seasonBox = el("div", { class: "table-wrap" });
  container.replaceChildren(el("h2", {}, "월별 발전량과 사용량"), box, summary, el("h3", { class: "sub-heading" }, "계절 요약 (기준 낮시간 비중)"), seasonBox);

  const labels = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
  const bar = (/** @type {string} */ label, /** @type {string} */ color) => ({ type: "bar", label, data: [], backgroundColor: color, borderColor: color, borderWidth: 1 });
  const chart = new Chart(canvas, {
    data: {
      labels,
      datasets: [
        bar("월 사용량 (kWh)", COLORS.usage),
        bar("월 발전량 (kWh)", COLORS.gen),
        bar("월 자가소비 (kWh)", COLORS.self),
        { type: "line", label: "월 절감액 (원, 오른쪽 축)", data: [], yAxisID: "y2", borderColor: COLORS.saving, backgroundColor: COLORS.saving, borderWidth: 3, pointRadius: 4, pointStyle: "rectRot", tension: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { grid: { color: COLORS.grid }, ticks: { color: COLORS.text } },
        y: { beginAtZero: true, title: { display: true, text: "kWh", color: COLORS.text }, grid: { color: COLORS.grid }, ticks: { color: COLORS.text, callback: (/** @type {any} */ v) => fmt(Number(v)) } },
        y2: { position: "right", beginAtZero: true, title: { display: true, text: "원", color: COLORS.text }, grid: { drawOnChartArea: false }, ticks: { color: COLORS.text, callback: (/** @type {any} */ v) => fmt(Number(v)) } },
      },
      plugins: {
        legend: { labels: { color: COLORS.text, usePointStyle: true } },
        tooltip: {
          backgroundColor: "#1E293B",
          borderColor: COLORS.grid,
          borderWidth: 1,
          titleColor: COLORS.text,
          bodyColor: COLORS.text,
          callbacks: { label: (/** @type {any} */ c) => `${c.dataset.label}: ${fmt(c.parsed.y, 1)}` },
        },
      },
    },
  });

  function seasonTable(/** @type {any[]} */ seasons) {
    const table = el("table", { class: "season-table" });
    const head = el("tr");
    for (const h of ["계절", "사용량(kWh)", "발전량(kWh)", "자가소비(kWh)", "잉여(kWh)", "절감액(원)", "자급률"]) head.append(el("th", {}, h));
    table.append(head);
    for (const s of seasons) {
      const row = el("tr");
      row.append(
        el("th", { scope: "row" }, s.label),
        el("td", {}, fmt(s.usageKwh)),
        el("td", {}, fmt(s.genKwh)),
        el("td", {}, fmt(s.selfKwh)),
        el("td", {}, fmt(s.exportKwh)),
        el("td", {}, fmt(s.savingKrw)),
        el("td", {}, `${fmt(s.selfSufficiency * 100, 1)}%`),
      );
      table.append(row);
    }
    return table;
  }

  return {
    update({ year1, usage, seasons, dayShare }) {
      chart.data.datasets[0].data = usage;
      chart.data.datasets[1].data = year1.gen;
      chart.data.datasets[2].data = year1.self;
      chart.data.datasets[3].data = year1.saving;
      chart.update();
      const maxGen = year1.gen.indexOf(Math.max(...year1.gen)) + 1;
      const maxSaving = year1.saving.indexOf(Math.max(...year1.saving)) + 1;
      const text = `1년차 기준입니다. 발전량이 가장 많은 달은 ${maxGen}월, 절감액이 가장 큰 달은 ${maxSaving}월입니다. 자가소비는 월 발전량과 (월 사용량 × 낮시간 사용 비중 ${fmt(dayShare * 100)}%) 중 작은 값입니다.`;
      summary.textContent = text;
      canvas.setAttribute("aria-label", `월별 발전량과 사용량 그래프. ${text}`);
      seasonBox.replaceChildren(seasonTable(seasons));
      container.hidden = false;
    },
    hide() {
      container.hidden = true;
    },
  };
}
