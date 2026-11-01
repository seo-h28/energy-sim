// 결과 카드: 큰 숫자 4개(기준값) + 낮시간 비중 하한~상한 범위. 각 카드 아래 <details class="proof-box">를 열면 대입 수식이 한 단계씩 나온다.
// 기준값은 낮시간 비중 하한과 상한의 가운데이며, 범위 안의 한 점일 뿐이다(spec 5.1b, 8차).
import { buildCardData, shareRangeTable, uncertaintyTable } from "../core/result-data.js";
import { el, fmt } from "./dom.js";

/**
 * 큰 숫자 + 작은 단위. "2,576,301원"은 숫자 부분을 크게, "원"을 작게. 숫자가 없는 글자("회수 불가")는 그대로.
 * @param {string} text
 */
function bigValue(text) {
  const p = el("p", { class: "card-value" });
  const m = /^(-?[\d.,]+)(.*)$/.exec(text);
  if (!m) {
    p.textContent = text;
    return p;
  }
  p.append(document.createTextNode(m[1]));
  if (m[2]) p.append(el("span", { class: "unit" }, m[2]));
  return p;
}

/**
 * 카드 하나: 제목 + 큰 숫자 + (있으면) 범위 한 줄 + (접힌) 계산 과정.
 * @param {string} title
 * @param {string} value
 * @param {string} range
 * @param {string[]} steps
 */
function card(title, value, range, steps) {
  const box = el("article", { class: "card" });
  const proof = el("details", { class: "proof-box" });
  const list = el("ol", { class: "steps" });
  for (const line of steps) list.append(el("li", {}, line));
  proof.append(el("summary", {}, "계산 과정 보기"), list);
  box.append(el("h3", { class: "card-title" }, title), bigValue(value));
  if (range) box.append(el("p", { class: "card-range" }, `범위 ${range}`));
  box.append(proof);
  return box;
}

/**
 * @param {import("../core/seasonal.js").MonthlyInput} input  기준 입력(낮시간 비중은 하한과 상한의 가운데)
 * @param {ReturnType<typeof import("../core/seasonal.js").summarizeRange>} range
 */
function buildCards(input, range) {
  return buildCardData(input, range).map((c) => card(c.title, c.value, c.range, c.steps));
}

/** 표 만들기: 머리줄 + 줄마다 (첫 칸 머리글, 나머지 칸) */
function tableOf(/** @type {{ headers: string[], rows: { name: string, cells: string[] }[] }} */ t) {
  const table = el("table", { class: "range-table" });
  const head = el("tr");
  for (const h of t.headers) head.append(el("th", {}, h));
  table.append(head);
  for (const r of t.rows) {
    const row = el("tr");
    row.append(el("th", { scope: "row" }, r.name), ...r.cells.map((c) => el("td", {}, c)));
    table.append(row);
  }
  return table;
}

/** 낮시간 사용 비중 범위 표(하한·기준·상한) */
function buildShareRangeBox(range) {
  const box = el("section", { class: "range-box" });
  box.append(
    el("h3", {}, "자가소비 범위 (낮시간 사용 비중 하한 ~ 상한)"),
    el("p", {}, "발전 시간대에 쓰는 전기의 비중을 값 하나로 정할 수 없어서 하한과 상한으로 계산합니다. 기준(가운데)은 범위 안의 한 점이며, 비중 값은 모두 임의 가정입니다."),
    tableOf(shareRangeTable(range)),
  );
  return box;
}

/**
 * 일사 자료 출처 격차(ASOS 대 NASA)를 반영한 범위 상자.
 * @param {import("../core/seasonal.js").MonthlyInput} input
 * @param {ReturnType<typeof import("../core/seasonal.js").summarizeMonthly>} s  기준 결과
 */
function buildUncertaintyBox(input, s) {
  const t = uncertaintyTable(input, s);
  const box = el("section", { class: "range-box" });
  box.append(el("h3", {}, "데이터 불확실성 범위"), el("p", {}, t.intro), tableOf(t));
  return box;
}

/**
 * @param {HTMLElement} container
 * @param {import("../core/seasonal.js").MonthlyInput} input  기준 입력
 * @param {ReturnType<typeof import("../core/seasonal.js").summarizeRange>} range
 * @param {number} assumedCount  임의 가정 값을 그대로 쓴 입력 개수(사용량 예시 포함)
 */
export function renderResultCards(container, input, range, assumedCount) {
  // 입력이 바뀔 때마다 카드를 새로 만들므로, 사용자가 펼쳐 둔 계산 과정은 순서(번호)로 기억했다가 다시 펼친다
  const openIndexes = [...container.querySelectorAll(".proof-box")].flatMap((d, i) => (/** @type {HTMLDetailsElement} */ (d).open ? [i] : []));

  const grid = el("div", { class: "cards" });
  grid.append(...buildCards(input, range));
  grid.querySelectorAll(".proof-box").forEach((d, i) => {
    if (openIndexes.includes(i)) /** @type {HTMLDetailsElement} */ (d).open = true;
  });

  const note = el(
    "p",
    { class: "card-note" },
    assumedCount > 0
      ? `이 결과는 출처를 확인하지 못한 임의 가정 ${assumedCount}개(월별 사용량 예시 포함)를 그대로 쓴 계산입니다. 실제 설치 결과의 예측이 아닙니다.`
      : "이 계산에 쓴 입력값은 모두 출처 확인값, 참고값, 사용자 입력입니다.",
  );
  const heading = el("div", { class: "section-head" });
  heading.append(
    el("h2", {}, "핵심 결과"),
    el("span", { class: "section-sub" }, `기준: 낮시간 사용 비중 ${fmt(range.dayShares.base * 100)}% (범위 ${fmt(range.dayShares.low * 100)}~${fmt(range.dayShares.high * 100)}%)`),
  );
  container.replaceChildren(heading, grid, note);
}

/**
 * 낮시간 비중 범위 표와 일사 자료 불확실성 표(두 상자). 개요 화면의 아래쪽에 나란히 놓는다.
 * @param {HTMLElement} container
 * @param {import("../core/seasonal.js").MonthlyInput} input  기준 입력
 * @param {ReturnType<typeof import("../core/seasonal.js").summarizeRange>} range
 */
export function renderRangeBoxes(container, input, range) {
  const grid = el("div", { class: "range-grid" });
  grid.append(buildShareRangeBox(range), buildUncertaintyBox(input, range.base));
  container.replaceChildren(grid);
}

/**
 * 입력 오류가 있을 때 결과 대신 보여준다.
 * @param {HTMLElement} container
 */
export function renderResultPlaceholder(container) {
  container.replaceChildren(
    el("h2", {}, "결과"),
    el("p", { class: "card-note" }, "입력을 확인해 주세요. 오류가 없어지면 결과가 나타납니다."),
  );
}
