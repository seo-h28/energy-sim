// 설계안 비교 화면(S7): 지금 입력한 설계를 "설계안"으로 저장하고(최대 4개) '현재 입력'과 나란히 표와 누적 현금흐름 그래프로 비교한다.
// 최고값(NPV 최대, 회수기간 최단, LCOE 최저, 자급률 최고)에는 ★와 굵은 글씨를 붙인다(색만으로 구분하지 않음).
// 저장한 설계안은 이 브라우저(localStorage)에만 보관하고 서버로 보내지 않는다. 저장소를 못 쓰는 환경에서는 화면을 닫을 때까지만 유지된다.
// 계산은 src/core/designs.js(화면의 결과 카드와 같은 계산).
import { readTheme } from "./theme.js";
import { MAX_DESIGNS, cleanName, compareDesigns, sanitizeDesigns } from "../core/designs.js";
import { designBars } from "../core/visual-data.js";
import { el, fmt } from "./dom.js";

const STORAGE_KEY = "sim.designs.v1";
const T = readTheme();
/** 현재 입력, 저장 1~4의 색·선 모양·점 모양(색만으로 구분하지 않도록 모양도 다르게) */
const STYLES = [
  { color: T.dark, dash: [8, 5], point: "crossRot" },
  { color: T.primary, dash: [], point: "circle" },
  { color: T.teal, dash: [], point: "rect" },
  { color: T.brown, dash: [], point: "triangle" },
  { color: T.neutral, dash: [], point: "rectRot" },
];

const won = (/** @type {number} */ n) => `${fmt(n)}원`;
const years = (/** @type {number | null | undefined} */ v) => (v === null ? "회수 불가" : v === undefined ? "-" : `${fmt(v, 1)}년`);
const pct = (/** @type {number | undefined} */ v) => (v === undefined ? "-" : `${fmt(v * 100, 1)}%`);

function loadStored() {
  try {
    return sanitizeDesigns(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

/** @param {any[]} list */
function saveStored(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // 저장소가 막힌 환경: 이번 화면에서만 유지
  }
}

/**
 * @typedef {import("../core/designs.js").Design} Design
 * @typedef {import("../core/designs.js").EvalContext} EvalContext
 */

/**
 * @param {HTMLElement} container
 * @param {{ ctx: EvalContext, getCurrent: () => Design, apply: (d: Design) => void }} deps
 * @returns {{ refresh(): void }}
 */
export function createDesignPanel(container, deps) {
  const Chart = /** @type {any} */ (window).Chart;
  if (!Chart) throw new Error("Chart.js를 불러오지 못했습니다(vendor/chart.umd.js 확인)");

  /** @type {Design[]} */
  let saved = loadStored();

  const nameInput = /** @type {HTMLInputElement} */ (el("input", { id: "design-name", type: "text", maxlength: "24", placeholder: "설계 이름 (선택)" }));
  const saveBtn = /** @type {HTMLButtonElement} */ (el("button", { type: "button", id: "design-save" }, "현재 설계 저장"));
  const message = el("p", { class: "card-note", role: "status" });
  const saveRow = el("div", { class: "design-save-row" });
  saveRow.append(nameInput, saveBtn);
  const barsWrap = el("div", { class: "design-bars" });
  const tableWrap = el("div", { class: "table-wrap" });
  const canvas = el("canvas", { role: "img", "aria-label": "설계안별 누적 현금흐름" });
  const box = el("div", { class: "chart-box" });
  box.append(canvas);
  const legendNote = el("p", { class: "card-note" }, "★는 그 항목에서 가장 좋은 값입니다(NPV는 가장 큰 값, 회수기간·LCOE는 가장 작은 값, 자급률은 가장 큰 값). 같은 값이면 모두, 모두 같으면 표시하지 않습니다. 결과는 입력한 가정에 따른 계산이며 대부분 임의 가정입니다.");
  container.replaceChildren(
    el("h2", {}, "설계안 비교: 어느 설계가 나을까"),
    el("p", { class: "card-note" }, `지금 입력한 설계를 저장해 두고(최대 ${MAX_DESIGNS}개) 나란히 비교합니다. 입력 화면에서 값을 바꾼 뒤 저장하면 설계안이 늘고, "현재 입력" 열은 지금 입력값을 따라 바뀝니다. 저장한 설계안은 이 브라우저에만 보관되고 서버로 보내지 않습니다.`),
    saveRow,
    message,
    barsWrap,
    tableWrap,
    legendNote,
    box,
  );

  const chart = new Chart(canvas, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { title: { display: true, text: "경과 연수 (년)", color: T.text }, grid: { color: T.grid }, ticks: { color: T.text } },
        y: { title: { display: true, text: "누적 현금흐름 (원)", color: T.text }, grid: { color: T.grid }, ticks: { color: T.text, callback: (/** @type {any} */ v) => fmt(Number(v)) } },
      },
      plugins: {
        legend: { labels: { color: T.text, usePointStyle: true } },
        tooltip: { backgroundColor: T.panel, borderColor: T.grid, borderWidth: 1, titleColor: T.text, bodyColor: T.text, callbacks: { label: (/** @type {any} */ c) => `${c.dataset.label}: ${won(c.parsed.y)}` } },
      },
    },
  });

  function persist() {
    const ok = saveStored(saved);
    if (!ok) message.textContent = "이 브라우저는 저장소를 막고 있어 설계안이 화면을 닫을 때까지만 유지됩니다.";
  }

  saveBtn.addEventListener("click", () => {
    if (saved.length >= MAX_DESIGNS) return;
    const current = deps.getCurrent();
    const name = cleanName(nameInput.value, saved.length + 1);
    saved.push({ ...current, name, values: { ...current.values }, usage: [...current.usage] });
    nameInput.value = "";
    message.textContent = `"${name}"을(를) 저장했습니다.`;
    persist();
    refresh();
  });

  function refresh() {
    const current = deps.getCurrent();
    const all = [{ ...current, name: "현재 입력" }, ...saved];
    const { results, best } = compareDesigns(all, deps.ctx);
    const currentOk = results[0].ok;
    saveBtn.disabled = saved.length >= MAX_DESIGNS || !currentOk;
    saveBtn.title = !currentOk ? "입력에 오류가 있어 저장할 수 없습니다" : saved.length >= MAX_DESIGNS ? `설계안은 최대 ${MAX_DESIGNS}개까지 저장할 수 있습니다(삭제 후 다시 저장)` : "";

    const table = el("table", { class: "season-table design-table" });
    const head = el("tr");
    head.append(el("th", { scope: "col" }, "항목"));
    all.forEach((d, i) => {
      const th = el("th", { scope: "col" });
      th.append(el("span", { class: "design-name" }, d.name));
      if (i > 0) {
        const load = el("button", { type: "button", class: "link-button" }, "불러오기");
        load.addEventListener("click", () => {
          deps.apply(saved[i - 1]);
          message.textContent = `"${saved[i - 1].name}"을(를) 입력에 불러왔습니다.`;
        });
        const del = el("button", { type: "button", class: "link-button" }, "삭제");
        del.addEventListener("click", () => {
          const [gone] = saved.splice(i - 1, 1);
          message.textContent = `"${gone.name}"을(를) 삭제했습니다.`;
          persist();
          refresh();
        });
        th.append(el("br"), load, document.createTextNode(" · "), del);
      }
      head.append(th);
    });
    table.append(head);

    /** @param {string} label @param {(r: any, i: number) => string} f @param {number[]} [bestIdx] */
    const row = (label, f, bestIdx) => {
      const tr = el("tr");
      tr.append(el("th", { scope: "row" }, label));
      results.forEach((r, i) => {
        const td = el("td", {}, r.ok ? f(r, i) : "입력 오류");
        if (r.ok && bestIdx?.includes(i)) {
          td.className = "design-best";
          td.textContent = `★ ${td.textContent}`;
          td.title = "이 항목에서 가장 좋은 값";
        }
        tr.append(td);
      });
      table.append(tr);
    };
    row("요금제", (r) => r.tariffLabel);
    row("설치 용량", (r) => `${fmt(r.capacityKwp, 2)} kWp`);
    row("경사각", (r) => `${fmt(r.tiltDeg)}°`);
    row("필요 면적 / 설치 가능", (r) => (r.requiredAreaM2 === undefined ? "-" : `${fmt(r.requiredAreaM2, 1)} / ${fmt(r.roofAreaM2, 1)} m²${r.fitsArea ? "" : " (넘음)"}`));
    row("순 투자비", (r) => won(r.netInvestmentKrw));
    row("1년차 발전량", (r) => `${fmt(r.year1GenKwh)} kWh`);
    row("자가소비율", (r) => pct(r.selfConsumptionRate));
    row("자급률", (r) => pct(r.selfSufficiencyRate), best.selfSufficiency);
    row("1년차 연 절감", (r) => won(r.firstYearSavingKrw));
    row("원금 회수기간", (r) => years(r.paybackYears), best.payback);
    row("NPV (기준)", (r) => won(r.npvKrw), best.npv);
    row("NPV 범위 (하한 ~ 상한)", (r) => `${won(r.npvLow)} ~ ${won(r.npvHigh)}`);
    row("LCOE (원/kWh)", (r) => (r.lcoeKrwPerKwh === null ? "-" : fmt(r.lcoeKrwPerKwh, 1)), best.lcoe);
    tableWrap.replaceChildren(table);

    // 쉬운 그림: 설계안별 NPV 막대(길수록 좋음)와 회수기간 막대(짧을수록 좋음). ★는 표와 같은 1등 표시
    /** @param {string} title @param {"npv" | "payback"} metric @param {number[]} bestIdx */
    const barBlock = (title, metric, bestIdx) => {
      const block = el("div", { class: "design-bar-block" }, "");
      block.append(el("h3", { class: "sub-heading" }, title));
      for (const b of designBars(results, metric, bestIdx)) {
        const row = el("div", { class: "vis-bar-row" });
        const bar = el("div", { class: `vis-bar ${b.best ? "vis-bar-space" : "vis-bar-ground"}` });
        bar.style.width = `${b.fraction === 0 ? 0 : Math.max(2, b.fraction * 100)}%`;
        const track = el("div", { class: "vis-track" });
        track.append(bar);
        const text = metric === "npv" ? (b.value === null ? "-" : won(b.value)) : years(b.value);
        row.append(el("span", { class: "vis-bar-label" }, `${b.best ? "★ " : ""}${b.name}`), track, el("span", { class: "vis-bar-text" }, text));
        block.append(row);
      }
      return block;
    };
    barsWrap.replaceChildren(barBlock("NPV: 길수록 좋음", "npv", best.npv), barBlock("원금 회수기간: 짧을수록 좋음(막대 없음 = 회수 불가)", "payback", best.payback));

    // 누적 현금흐름 그래프(입력 오류인 설계안은 뺀다)
    const lines = results.map((r, i) => ({ r, i })).filter((x) => x.r.ok);
    const maxYears = Math.max(1, ...lines.map((x) => /** @type {number[]} */ (x.r.cumulative).length - 1));
    chart.data.labels = Array.from({ length: maxYears + 1 }, (_, y) => y);
    chart.data.datasets = lines.map(({ r, i }) => {
      const s = STYLES[Math.min(i, STYLES.length - 1)];
      return { label: r.name, data: r.cumulative, borderColor: s.color, backgroundColor: s.color, borderDash: s.dash, borderWidth: i === 0 ? 3 : 2, pointStyle: s.point, pointRadius: 3, tension: 0 };
    });
    chart.update();
    box.hidden = lines.length === 0;
    canvas.setAttribute("aria-label", `설계안별 누적 현금흐름. ${lines.map((x) => `${x.r.name}: 25년 말 ${won((x.r.cumulative ?? []).slice(-1)[0] ?? 0)}`).join(", ")}`);
    if (saved.length === 0 && !message.textContent) message.textContent = "저장한 설계안이 없습니다. 입력을 정한 뒤 \"현재 설계 저장\"을 눌러 보세요.";
  }

  refresh();
  return { refresh };
}
