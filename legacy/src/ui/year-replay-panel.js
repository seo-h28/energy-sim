// 연도별 일사 다시 계산 화면: 부산 ASOS 일사의 해마다 차이로 같은 설계의 NPV·회수기간을 다시 계산해 보여 준다.
// 계산은 src/core/year-replay.js. 확률이 아니라 "과거 그 해의 일사였다면"이며, 눈금 변화 가능성을 화면에 밝힌다.
import { yearReplay } from "../core/year-replay.js";
import { designBars } from "../core/visual-data.js";
import { el, fmt } from "./dom.js";

const won = (/** @type {number} */ n) => `${fmt(n)}원`;
const years = (/** @type {number | null} */ v) => (v === null ? "회수 불가" : `${fmt(v, 1)}년`);

/**
 * @param {HTMLElement} container
 * @param {import("../core/year-replay.js").YearRow[]} yearRows
 * @returns {{ update(args: { values: Record<string, number | null>, usage: number[], toInput: Parameters<typeof yearReplay>[2] }): void, hide(): void }}
 */
export function createYearReplayPanel(container, yearRows) {
  function hide() {
    container.hidden = true;
  }
  /** @param {{ values: Record<string, number | null>, usage: number[], toInput: Parameters<typeof yearReplay>[2] }} a */
  function update(a) {
    const r = yearReplay(a.values, a.usage, a.toInput, yearRows);
    if ("error" in r) return hide();
    container.hidden = false;
    const skipped = yearRows.filter((y) => !y.used);
    const best = r.rows.reduce((m, x) => (x.npv > m.npv ? x : m));
    const worst = r.rows.reduce((m, x) => (x.npv < m.npv ? x : m));

    const bars = el("div", { class: "design-bar-block" });
    const bs = designBars(r.rows.map((x) => ({ ok: true, name: `${x.year}년`, npvKrw: x.npv, paybackYears: x.payback })), "npv", []);
    for (const b of bs) {
      const row = el("div", { class: "vis-bar-row" });
      const bar = el("div", { class: "vis-bar vis-bar-ground" });
      bar.style.width = `${b.fraction === 0 ? 0 : Math.max(2, b.fraction * 100)}%`;
      const track = el("div", { class: "vis-track" });
      track.append(bar);
      row.append(el("span", { class: "vis-bar-label" }, b.name), track, el("span", { class: "vis-bar-text" }, won(/** @type {number} */ (b.value))));
      bars.append(row);
    }

    const table = el("table", { class: "season-table" });
    const head = el("tr");
    for (const h of ["연도", "일사(kWh/m²)", "평균 대비", "NPV", "원금 회수기간"]) head.append(el("th", { scope: "col" }, h));
    table.append(head);
    for (const x of r.rows) {
      const tr = el("tr");
      tr.append(el("th", { scope: "row" }, `${x.year}`), el("td", {}, fmt(x.ghiKwhM2)), el("td", {}, `${fmt(x.factor * 100, 1)}%`), el("td", {}, won(x.npv)), el("td", {}, years(x.payback)));
      table.append(tr);
    }
    const wrap = el("div", { class: "table-wrap" });
    wrap.append(table);

    container.replaceChildren(
      el("h2", {}, "해마다 일사가 달랐다면: 연도별 다시 계산"),
      el("p", { class: "card-note" }, `부산 기상청 관측(ASOS) ${r.rows.length}개 연도의 일사 차이를 연 발전량의 배수로 바꿔, 같은 설계를 해마다 다시 계산했습니다. NPV는 ${won(worst.npv)}(${worst.year}년) ~ ${won(best.npv)}(${best.year}년)이고, 원금을 회수하지 못하는 해는 ${r.paybackFailCount}개입니다.`),
      bars,
      wrap,
      el("p", { class: "vis-note" }, `확률이 아니라 "과거 그 해의 일사였다면"의 결과입니다. 연도 수가 적고, 배수는 이 연도들의 평균에 대한 비율입니다. 2015~2016년이 이후보다 낮게 나오는 것이 날씨 차이인지 관측 장비의 눈금 변화인지는 확인하지 못했습니다. ${skipped.length ? `낮 시간 관측이 크게 빠진 ${skipped.map((y) => y.year).join(", ")}년은 합계가 작아 제외했습니다. ` : ""}출처: 기상청 ASOS 시간자료(data.go.kr)를 합산한 값[Reference].`),
    );
  }
  return { update, hide };
}
