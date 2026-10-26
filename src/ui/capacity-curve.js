// 용량 곡선(Chart.js): 설치 용량을 바꿔 가며 NPV(하한·기준·상한), 자급률, 자가소비율을 한 그림에 보여 주고,
// NPV 최대 용량과 포화 용량을 표시한다. 그래프는 한 번 만들고 입력이 바뀌면 데이터만 바꿔 update()한다.
// 격자는 수십~백 개 점이라 즉시 계산된다(걸린 시간을 화면에 적는다).
import { readTheme } from "./theme.js";
import { autoMaxCapacity, bestByNpv, capacityCurve, capacityGrid, evaluateCapacity, niceStep, saturationCapacity } from "../core/optimize.js";
import { el, fmt } from "./dom.js";

const T = readTheme();
const COLORS = {
  npv: T.primary, // 기준 NPV: 번트 오렌지(돈)
  low: T.neutral, // 하한: 회색 점선
  high: T.brown, // 상한: 황갈색 점선
  suff: T.teal, // 자급률: 청록(오른쪽 축)
  selfRate: T.secondary, // 자가소비율: 골드(오른쪽 축)
  grid: T.grid,
  text: T.text,
  current: T.dark,
  saturation: T.brown,
  best: T.dark,
  panel: T.panel,
};
const MAX_USER_KWP = 200;

const won = (/** @type {number} */ n) => `${fmt(n)}원`;
const kwp = (/** @type {number} */ n) => `${fmt(n, 2)} kWp`;
const years = (/** @type {number | null} */ v) => (v === null ? "회수 불가" : `${fmt(v, 1)}년`);

/**
 * @param {HTMLElement} container
 * @returns {{ update(args: { input: Omit<import("../core/seasonal.js").MonthlyInput, "dayShare">, dayShareLow: number, dayShareHigh: number, currentCapacity: number }): void, hide(): void, getMax(): number | null, setMax(v: number | null): void }}
 */
export function createCapacityCurve(container) {
  const Chart = /** @type {any} */ (window).Chart;
  if (!Chart) throw new Error("Chart.js를 불러오지 못했습니다(vendor/chart.umd.js 확인)");

  /** @type {Parameters<ReturnType<typeof createCapacityCurve>["update"]>[0] | null} */
  let last = null;
  /** 그래프 위에 세로선으로 그릴 표시: { x, label, color, row } */
  /** @type {{ x: number, label: string, color: string, row: number }[]} */
  let markers = [];

  const maxInput = /** @type {HTMLInputElement} */ (el("input", { id: "curve-max", type: "number", min: "0.1", max: String(MAX_USER_KWP), step: "any", placeholder: "자동" }));
  const controls = el("div", { class: "field curve-controls" });
  controls.append(el("label", { for: "curve-max" }, "탐색 최대 용량 (kWp, 비우면 자동)"), maxInput);

  const canvas = el("canvas", { role: "img", "aria-label": "설치 용량별 NPV 곡선" });
  const box = el("div", { class: "chart-box" });
  box.append(canvas);
  const bullets = el("ul", { class: "curve-bullets" });
  const tableWrap = el("div", { class: "table-wrap" });
  container.replaceChildren(
    el("h2", {}, "용량 곡선: 얼마나 크게 설치할까"),
    el("p", { class: "card-note" }, "용량을 바꿔 가며 계산한 결과입니다. 옥상 면적 제한은 반영하지 않았습니다(옥상 면적 정보가 없음)."),
    controls,
    box,
    bullets,
    tableWrap,
  );

  const markerPlugin = {
    id: "curveMarkers",
    afterDatasetsDraw(/** @type {any} */ chart) {
      const { ctx, chartArea, scales } = chart;
      ctx.save();
      ctx.font = "600 14px system-ui, 'Malgun Gothic', sans-serif";
      for (const m of markers) {
        if (!Number.isFinite(m.x)) continue;
        const px = scales.x.getPixelForValue(m.x);
        if (px < chartArea.left || px > chartArea.right) continue;
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(px, chartArea.top);
        ctx.lineTo(px, chartArea.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = m.color;
        const w = ctx.measureText(m.label).width;
        const alignRight = px + 8 + w > chartArea.right;
        ctx.textAlign = alignRight ? "right" : "left";
        ctx.textBaseline = "top";
        ctx.fillText(m.label, px + (alignRight ? -8 : 8), chartArea.top + 4 + m.row * 20);
      }
      ctx.restore();
    },
  };

  const line = (/** @type {string} */ label, /** @type {string} */ color, /** @type {any} */ extra = {}) => ({
    type: "line", label, data: [], borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, tension: 0, ...extra,
  });
  Chart.defaults.color = COLORS.text;
  const chart = new Chart(canvas, {
    plugins: [markerPlugin],
    data: {
      datasets: [
        line("NPV 기준 (원)", COLORS.npv, { borderWidth: 3 }),
        line("NPV 낮시간 비중 하한", COLORS.low, { borderDash: [8, 6] }),
        line("NPV 낮시간 비중 상한", COLORS.high, { borderDash: [3, 5] }),
        line("자급률 (%, 오른쪽 축)", COLORS.suff, { yAxisID: "y2" }),
        line("자가소비율 (%, 오른쪽 축)", COLORS.selfRate, { yAxisID: "y2" }),
        { type: "scatter", label: "NPV 최대 (기준)", data: [], pointStyle: "rectRot", pointRadius: 9, backgroundColor: COLORS.best, borderColor: COLORS.panel, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      scales: {
        x: { type: "linear", min: 0, title: { display: true, text: "설치 용량 (kWp)", color: COLORS.text }, grid: { color: COLORS.grid }, ticks: { color: COLORS.text } },
        y: {
          title: { display: true, text: "NPV (원)", color: COLORS.text },
          ticks: { color: COLORS.text, callback: (/** @type {any} */ v) => fmt(Number(v)) },
          grid: { color: (/** @type {any} */ c) => (c.tick.value === 0 ? COLORS.current : COLORS.grid), lineWidth: (/** @type {any} */ c) => (c.tick.value === 0 ? 2 : 1) },
        },
        y2: { position: "right", min: 0, max: 100, title: { display: true, text: "%", color: COLORS.text }, grid: { drawOnChartArea: false }, ticks: { color: COLORS.text } },
      },
      plugins: {
        legend: { labels: { color: COLORS.text, usePointStyle: true } },
        tooltip: {
          backgroundColor: COLORS.panel,
          borderColor: COLORS.grid,
          borderWidth: 1,
          titleColor: COLORS.text,
          bodyColor: COLORS.text,
          callbacks: {
            title: (/** @type {any[]} */ items) => `설치 용량 ${fmt(items[0].parsed.x, 2)} kWp`,
            label: (/** @type {any} */ c) => `${c.dataset.label}: ${fmt(c.parsed.y, 1)}`,
          },
        },
      },
    },
  });

  function render() {
    if (!last) return;
    const { input, dayShareLow, dayShareHigh, currentCapacity } = last;
    const mid = (dayShareLow + dayShareHigh) / 2;
    const satBase = saturationCapacity({ ...input, dayShare: mid });
    const satLow = saturationCapacity({ ...input, dayShare: dayShareLow });
    const satHigh = saturationCapacity({ ...input, dayShare: dayShareHigh });

    const userMax = maxInput.valueAsNumber;
    const manual = Number.isFinite(userMax) && userMax > 0;
    const maxKwp = manual ? Math.min(MAX_USER_KWP, userMax) : autoMaxCapacity(satBase, currentCapacity);
    const caps = capacityGrid(maxKwp);

    const t0 = performance.now();
    const points = capacityCurve(input, dayShareLow, dayShareHigh, caps);
    const ms = performance.now() - t0;
    const best = bestByNpv(points, "base");
    const bestLow = bestByNpv(points, "low");
    const bestHigh = bestByNpv(points, "high");

    const xy = (/** @type {(p: any) => number} */ f) => points.map((p) => ({ x: p.capacityKwp, y: f(p) }));
    chart.data.datasets[0].data = xy((p) => p.npv.base);
    chart.data.datasets[1].data = xy((p) => p.npv.low);
    chart.data.datasets[2].data = xy((p) => p.npv.high);
    chart.data.datasets[3].data = xy((p) => p.selfSufficiencyRate * 100);
    chart.data.datasets[4].data = xy((p) => p.selfConsumptionRate * 100);
    chart.data.datasets[5].data = best ? [{ x: best.capacityKwp, y: best.npv.base }] : [];
    chart.options.scales.x.max = maxKwp;
    markers = [
      { x: currentCapacity, label: `현재 입력 ${fmt(currentCapacity, 2)} kWp`, color: COLORS.current, row: 0 },
      { x: satBase, label: `포화 용량 ${fmt(satBase, 2)} kWp`, color: COLORS.saturation, row: 1 },
    ];
    chart.update();

    // 요약 문장
    const step = niceStep(maxKwp);
    const lines = [];
    lines.push(`탐색: 용량 ${caps.length}개(간격 ${fmt(step, 2)} kWp, ${fmt(maxKwp, 1)} kWp까지${manual ? ", 직접 지정" : ", 자동"}) × 낮시간 비중 3가지를 ${fmt(ms, 1)} ms에 계산했습니다.`);
    if (best) {
      const range = bestLow && bestHigh ? ` 낮시간 비중 하한~상한에서는 ${fmt(Math.min(bestLow.capacityKwp, bestHigh.capacityKwp), 2)} ~ ${fmt(Math.max(bestLow.capacityKwp, bestHigh.capacityKwp), 2)} kWp입니다.` : "";
      lines.push(`NPV가 가장 큰 용량(기준): ${kwp(best.capacityKwp)}, NPV ${won(best.npv.base)}.${range}`);
      if (best.capacityKwp >= maxKwp - 1e-9) lines.push("최적 용량이 탐색 범위의 끝입니다. 최대 용량을 늘려서 다시 확인해 보세요.");
    } else {
      lines.push("탐색 범위 안에서는 NPV가 모두 0 이하입니다. 이 가정에서는 설치하지 않는 편이 낫다는 계산입니다(설치비·요금 가정 확인 필요).");
    }
    if (Number.isFinite(satBase)) {
      lines.push(`포화 용량(기준 낮시간 비중 ${fmt(mid * 100)}%): 약 ${kwp(satBase)} (하한~상한 ${fmt(satLow, 2)} ~ ${fmt(satHigh, 2)} kWp). 이보다 크게 설치하면 모든 달의 발전량이 낮에 쓰는 전기를 넘어서, 자가소비는 더 늘지 않고 잉여만 늘어납니다(1년차 기준).`);
    } else {
      lines.push("포화 용량: 발전이 없는 달에도 낮 사용이 있어 모든 달을 채우는 용량은 없습니다.");
    }
    lines.push("이 추천은 입력한 가정(설치비, 요금, 월별 사용량, 낮시간 비중) 아래의 계산입니다. 가정이 바뀌면 최적 용량도 이동합니다.");
    bullets.replaceChildren(...lines.map((t) => el("li", {}, t)));

    // 비교 표: 현재 입력 / NPV 최대 / 포화 용량
    const rowsData = [["현재 입력", currentCapacity]];
    if (best) rowsData.push(["NPV 최대 (기준)", best.capacityKwp]);
    if (Number.isFinite(satBase) && satBase > 0) rowsData.push(["포화 용량 (기준)", satBase]);
    const table = el("table", { class: "range-table" });
    const head = el("tr");
    for (const h of ["설계", "용량", "순 투자비", "NPV (하한 ~ 상한)", "회수기간 (기준)", "자가소비율", "자급률"]) head.append(el("th", {}, h));
    table.append(head);
    for (const [name, cap] of /** @type {[string, number][]} */ (rowsData)) {
      const p = evaluateCapacity(input, cap, dayShareLow, dayShareHigh);
      const row = el("tr");
      row.append(
        el("th", { scope: "row" }, name),
        el("td", {}, kwp(p.capacityKwp)),
        el("td", {}, won(p.netInvestmentKrw)),
        el("td", {}, `${won(p.npv.low)} ~ ${won(p.npv.high)}`),
        el("td", {}, years(p.payback.base)),
        el("td", {}, `${fmt(p.selfConsumptionRate * 100, 1)}%`),
        el("td", {}, `${fmt(p.selfSufficiencyRate * 100, 1)}%`),
      );
      table.append(row);
    }
    tableWrap.replaceChildren(table);
    canvas.setAttribute("aria-label", `설치 용량별 NPV 곡선. ${lines.slice(1, 3).join(" ")}`);
    container.hidden = false;
  }

  maxInput.addEventListener("input", render);

  return {
    update(args) {
      last = args;
      render();
    },
    hide() {
      container.hidden = true;
    },
    /** 직접 지정한 탐색 최대 용량(없으면 null) */
    getMax() {
      const v = maxInput.valueAsNumber;
      return Number.isFinite(v) && v > 0 ? v : null;
    },
    setMax(v) {
      maxInput.value = v === null ? "" : String(v);
      render();
    },
  };
}
