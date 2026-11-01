// 민감도 분석(토네이도) 화면: 가정을 하나씩 줄이거나 늘렸을 때 NPV가 기준에서 얼마나 달라지는지 가로 막대로 보여 주고,
// 아래 표에 어떤 값으로 바꿨는지와 결과를 적는다. 계산은 src/core/sensitivity.js가 한다.
// 그래프는 한 번 만들고 입력이 바뀌면 데이터만 바꿔 update()한다.
import { readTheme } from "./theme.js";
import { DEFAULT_RELATIVE_RANGE, tornado } from "../core/sensitivity.js";
import { el, fmt } from "./dom.js";

const T = readTheme();
const COLORS = { low: T.neutral, high: T.primary, grid: T.grid, text: T.text, zero: T.dark, panel: T.panel };

const won = (/** @type {number} */ n) => `${fmt(n)}원`;
const years = (/** @type {number | null | undefined} */ v) => (v === null ? "회수 불가" : v === undefined ? "-" : `${fmt(v, 1)}년`);
const signed = (/** @type {number} */ n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}원`;

/** 상대 변수 변화 폭 입력 범위(%) */
const REL_MIN = 5;
const REL_MAX = 50;

/**
 * @param {HTMLElement} container
 * @param {() => void} onRangeChange  변화 폭을 바꾸면 호출(다시 계산하도록)
 * @returns {{ update(args: { values: Record<string, number | null>, usage: number[], toInput: Parameters<typeof tornado>[2] }): void, hide(): void, getRel(): number, setRel(rel: number): void }}
 */
export function createSensitivityPanel(container, onRangeChange) {
  const Chart = /** @type {any} */ (window).Chart;
  if (!Chart) throw new Error("Chart.js를 불러오지 못했습니다(vendor/chart.umd.js 확인)");

  const relInput = /** @type {HTMLInputElement} */ (el("input", { id: "sens-rel", type: "number", min: String(REL_MIN), max: String(REL_MAX), step: "1", value: String(Math.round(DEFAULT_RELATIVE_RANGE * 100)) }));
  const controls = el("div", { class: "field curve-controls" });
  controls.append(el("label", { for: "sens-rel" }, "전기요금·설치비·사용량 변화 폭 (±%)"), relInput);

  const canvas = el("canvas", { role: "img", "aria-label": "가정별 NPV 변화 폭(토네이도 그래프)" });
  const box = el("div", { class: "chart-box sens-box" });
  box.append(canvas);
  const summary = el("p", { class: "card-note" });
  const tableWrap = el("div", { class: "table-wrap" });
  const notes = el("ul", { class: "curve-bullets" });
  container.replaceChildren(
    el("h2", {}, "민감도 분석: 어떤 가정이 결과를 가장 크게 흔들까"),
    el("p", { class: "card-note" }, "기준 설계에서 가정을 하나씩만 줄이거나 늘려 25년 NPV가 얼마나 달라지는지 봅니다(나머지는 그대로). 막대가 길수록 그 가정이 결과를 크게 흔듭니다. 바꾼 폭은 확률이 아니라 정해 둔 범위입니다."),
    controls,
    box,
    summary,
    tableWrap,
    notes,
  );

  /** @type {any} */
  let lastItems = [];
  const chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        { label: "줄일 때(낮시간 비중은 하한)", data: [], backgroundColor: COLORS.low, borderColor: COLORS.low, borderWidth: 1, grouped: false, barPercentage: 0.8, categoryPercentage: 0.9 },
        { label: "늘릴 때(낮시간 비중은 상한)", data: [], backgroundColor: COLORS.high, borderColor: COLORS.high, borderWidth: 1, grouped: false, barPercentage: 0.8, categoryPercentage: 0.9 },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { title: { display: true, text: "기준 NPV 대비 변화 (원)", color: COLORS.text }, grid: { color: COLORS.grid }, ticks: { color: COLORS.text, callback: (/** @type {any} */ v) => fmt(Number(v)) } },
        y: { grid: { display: false }, ticks: { color: COLORS.text, autoSkip: false } },
      },
      plugins: {
        legend: { labels: { color: COLORS.text, usePointStyle: true } },
        tooltip: {
          backgroundColor: COLORS.panel, borderColor: COLORS.grid, borderWidth: 1, titleColor: COLORS.text, bodyColor: COLORS.text,
          callbacks: {
            label: (/** @type {any} */ c) => {
              const it = lastItems[c.dataIndex];
              const o = c.datasetIndex === 0 ? it.low : it.high;
              return [`${c.dataset.label}: ${o.text}`, `NPV ${o.npv === undefined ? "-" : won(o.npv)} (${signed(c.parsed.x)}), 회수 ${years(o.payback)}`];
            },
          },
        },
      },
    },
  });

  function renderTable(/** @type {any[]} */ items) {
    const table = el("table", { class: "season-table sens-table" });
    const head = el("tr");
    for (const h of ["가정", "줄일 때", "NPV", "늘릴 때", "NPV", "변화 폭"]) head.append(el("th", {}, h));
    table.append(head);
    for (const it of items) {
      const cell = (/** @type {any} */ o) => (o.errors ? "입력 오류" : won(o.npv) + (o.payback === null ? " (회수 불가)" : ""));
      const row = el("tr");
      row.append(
        el("th", { scope: "row" }, it.label),
        el("td", {}, it.low.text),
        el("td", {}, cell(it.low)),
        el("td", {}, it.high.text),
        el("td", {}, cell(it.high)),
        el("td", {}, Number.isNaN(it.swing) ? "-" : won(it.swing)),
      );
      table.append(row);
    }
    tableWrap.replaceChildren(table);
  }

  // 변화 폭 입력은 값이 정해졌을 때(Enter, 칸을 벗어남, 화살표) 다시 계산한다
  relInput.addEventListener("change", onRangeChange);

  return {
    getRel: () => relInput.valueAsNumber / 100,
    setRel(rel) {
      relInput.value = String(Math.round(rel * 100));
    },
    update({ values, usage, toInput }) {
      const rel = Math.min(REL_MAX, Math.max(REL_MIN, relInput.valueAsNumber || DEFAULT_RELATIVE_RANGE * 100)) / 100;
      const r = tornado(values, usage, toInput, rel);
      if ("error" in r) {
        container.hidden = true;
        return;
      }
      container.hidden = false;
      lastItems = r.items;
      const base = r.base.npv;
      const rows = r.items.filter((it) => !Number.isNaN(it.swing));
      chart.data.labels = rows.map((it) => it.label);
      chart.data.datasets[0].data = rows.map((it) => /** @type {number} */ (it.low.npv) - base);
      chart.data.datasets[1].data = rows.map((it) => /** @type {number} */ (it.high.npv) - base);
      lastItems = rows;
      // 막대가 많아도 읽히도록 항목 수에 맞춰 높이를 정한다
      box.style.height = `${Math.max(260, 80 + rows.length * 38)}px`;
      chart.update();
      const top = rows[0];
      const text = top
        ? `기준 NPV는 ${won(base)}, 회수기간은 ${years(r.base.payback)}입니다. 가장 크게 흔드는 가정은 "${top.label}"입니다: ${top.low.text}이면 NPV ${won(top.low.npv ?? 0)}, ${top.high.text}이면 ${won(top.high.npv ?? 0)}.`
        : "계산할 수 있는 항목이 없습니다.";
      summary.textContent = text;
      canvas.setAttribute("aria-label", `가정별 NPV 변화 폭(토네이도 그래프). ${text}`);
      renderTable(rows);
      notes.replaceChildren(
        ...[
          "하나씩만 바꿉니다. 여러 가정이 함께 바뀌는 경우의 효과는 이 그래프에 나타나지 않습니다.",
          "전기요금 상승률은 25년 복리로 쌓여서 작은 폭(±2%p)도 크게 나옵니다. 폭을 어떻게 정하느냐에 따라 순서가 바뀔 수 있습니다.",
          "연 발전량의 폭은 일사 자료 두 출처(ASOS·NASA)의 격차(약 ±10%)를 썼고, 낮시간 비중은 입력한 하한~상한, 경사각은 기준 ±10°, 방향 보정은 허용 범위 전체(0.8~1.0)입니다.",
          "잉여 판매단가·보조금·연 유지비는 기준값이 0이라 이 그래프에서 뺐습니다(상계 규정을 확인한 뒤 추가).",
        ].map((t) => el("li", {}, t)),
      );
    },
    hide() {
      container.hidden = true;
    },
  };

}
