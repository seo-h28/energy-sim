// 누적 현금흐름 그래프(Chart.js, vendor/chart.umd.js가 전역 Chart를 만든다). Dark Slate 테마.
// t=0의 −순 투자비에서 시작해 0선을 넘는 지점(원금 회수 시점, Break-Even)을 표시한다.
// 회수 시점 표시는 플러그인(chartjs-plugin-annotation) 없이 점 하나 + 글자 한 줄로 그린다(의존성을 늘리지 않으려는 선택).
// 그래프는 한 번 만들고 입력이 바뀌면 데이터만 바꿔 update()한다.
import { cumulativeFlows } from "../core/finance.js";
import { el, fmt } from "./dom.js";

const COLORS = {
  line: "#38BDF8", // Cyan
  fillTop: "rgba(56, 189, 248, 0.45)",
  fillBottom: "rgba(56, 189, 248, 0.03)",
  grid: "#334155",
  zero: "#E2E8F0",
  text: "#CBD5E1",
  breakEven: "#FBBF24", // Amber: 청록 선과 구분되는 강조색(모양도 마름모로 달리함)
  panel: "#0F172A",
};

/**
 * @param {HTMLElement} container
 * @returns {{ update(flows: number[], paybackYears: number | null, band?: { lowFlows: number[], highFlows: number[], lowLabel: string, highLabel: string }): void, hide(): void }}
 */
export function createCashflowChart(container) {
  const Chart = /** @type {any} */ (window).Chart;
  if (!Chart) throw new Error("Chart.js를 불러오지 못했습니다(vendor/chart.umd.js 확인)");

  const canvas = el("canvas", { role: "img", "aria-label": "누적 현금흐름 그래프" });
  const summary = el("p", { class: "card-note" });
  const box = el("div", { class: "chart-box" });
  box.append(canvas);
  container.replaceChildren(el("h2", {}, "누적 현금흐름"), box, summary);

  let breakEvenLabel = "";

  /** Break-Even 점 옆에 글자를 그린다 */
  const breakEvenLabelPlugin = {
    id: "breakEvenLabel",
    afterDatasetsDraw(/** @type {any} */ chart) {
      const point = chart.getDatasetMeta(1).data[0];
      if (!point || !breakEvenLabel) return;
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.font = "600 15px system-ui, 'Malgun Gothic', sans-serif";
      ctx.fillStyle = COLORS.breakEven;
      ctx.textBaseline = "bottom";
      // 오른쪽 끝에 붙은 점이면 글자가 잘리지 않게 왼쪽으로 정렬한다
      const width = ctx.measureText(breakEvenLabel).width;
      const alignRight = point.x + 14 + width > chartArea.right;
      ctx.textAlign = alignRight ? "right" : "left";
      ctx.fillText(breakEvenLabel, point.x + (alignRight ? -14 : 14), point.y - 12);
      ctx.restore();
    },
  };

  Chart.defaults.color = COLORS.text;
  const chart = new Chart(canvas, {
    type: "line",
    plugins: [breakEvenLabelPlugin],
    data: {
      datasets: [
        {
          label: "누적 현금흐름",
          data: [],
          borderColor: COLORS.line,
          borderWidth: 3,
          pointRadius: 2,
          pointBackgroundColor: COLORS.line,
          tension: 0,
          fill: "origin",
          // 영역 채우기: 위쪽은 진하고 아래쪽은 투명한 그라데이션(차트 크기가 정해진 뒤에 만들어야 한다)
          backgroundColor: (/** @type {any} */ c) => {
            const { chart: ch } = c;
            const area = ch.chartArea;
            if (!area) return COLORS.fillBottom;
            const g = ch.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            g.addColorStop(0, COLORS.fillTop);
            g.addColorStop(1, COLORS.fillBottom);
            return g;
          },
        },
        {
          label: "원금 회수 시점 (Break-Even)",
          data: [],
          type: "scatter",
          pointStyle: "rectRot",
          pointRadius: 9,
          pointHoverRadius: 11,
          backgroundColor: COLORS.breakEven,
          borderColor: COLORS.panel,
          borderWidth: 2,
        },
        // 낮시간 사용 비중 하한·상한의 누적 현금흐름(점선): 기준 선은 두 선 사이의 한 점
        { label: "낮 비중 하한", data: [], borderColor: "#94A3B8", borderDash: [8, 6], borderWidth: 2, pointRadius: 0, fill: false, tension: 0 },
        { label: "낮 비중 상한", data: [], borderColor: "#A78BFA", borderDash: [3, 5], borderWidth: 2, pointRadius: 0, fill: false, tension: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false, // 입력을 바꿀 때마다 즉시 반영(시연 중 끌림 방지)
      parsing: false,
      scales: {
        x: { type: "linear", min: 0, title: { display: true, text: "경과 연수 (년)", color: COLORS.text }, grid: { color: COLORS.grid }, ticks: { color: COLORS.text } },
        y: {
          title: { display: true, text: "누적 현금흐름 (원)", color: COLORS.text },
          ticks: { color: COLORS.text, callback: (/** @type {any} */ v) => fmt(Number(v)) },
          grid: {
            color: (/** @type {any} */ c) => (c.tick.value === 0 ? COLORS.zero : COLORS.grid),
            lineWidth: (/** @type {any} */ c) => (c.tick.value === 0 ? 2 : 1),
          },
        },
      },
      plugins: {
        legend: { labels: { color: COLORS.text, usePointStyle: true } },
        tooltip: {
          backgroundColor: "#1E293B",
          borderColor: COLORS.grid,
          borderWidth: 1,
          titleColor: COLORS.text,
          bodyColor: COLORS.text,
          callbacks: { label: (/** @type {any} */ c) => `${c.dataset.label}: ${fmt(c.parsed.y)}원 (${fmt(c.parsed.x, 2)}년)` },
        },
      },
    },
  });

  return {
    update(flows, paybackYears, band) {
      const cum = cumulativeFlows(flows);
      chart.data.datasets[0].data = cum.map((y, x) => ({ x, y }));
      chart.data.datasets[1].data = paybackYears === null ? [] : [{ x: paybackYears, y: 0 }];
      for (const [idx, f, label] of /** @type {[number, number[] | undefined, string | undefined][]} */ ([
        [2, band?.lowFlows, band?.lowLabel],
        [3, band?.highFlows, band?.highLabel],
      ])) {
        chart.data.datasets[idx].data = f ? cumulativeFlows(f).map((y, x) => ({ x, y })) : [];
        if (label) chart.data.datasets[idx].label = label;
      }
      breakEvenLabel = paybackYears === null ? "" : `원금 회수 ${fmt(paybackYears, 1)}년`;
      chart.options.scales.x.max = flows.length - 1;
      chart.update();
      container.hidden = false;
      const last = cum[cum.length - 1];
      const text =
        paybackYears === null
          ? `${flows.length - 1}년 안에 누적 현금흐름이 0에 이르지 못합니다(${flows.length - 1}년 말 ${fmt(last)}원).`
          : `누적 현금흐름이 ${fmt(paybackYears, 1)}년에 0선을 넘고, ${flows.length - 1}년 말 ${fmt(last)}원이 됩니다.`;
      summary.textContent = text;
      canvas.setAttribute("aria-label", `누적 현금흐름 그래프. ${text}`);
    },
    hide() {
      container.hidden = true;
    },
  };
}
