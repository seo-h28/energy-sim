// 결과 카드: 큰 숫자 4개(기준값) + 낮시간 비중 하한~상한 범위. 각 카드 아래 <details class="proof-box">를 열면 대입 수식이 한 단계씩 나온다.
// 기준값은 낮시간 비중 하한과 상한의 가운데이며, 범위 안의 한 점일 뿐이다(spec 5.1b, 8차).
import { cumulativeFlows } from "../core/finance.js";
import { annualGeneration } from "../core/ground.js";
import { flowTotals } from "../core/flow.js";
import { summarizeMonthly } from "../core/seasonal.js";
import { LOW_GENERATION_FACTOR, SOURCE_GAP, lowGenerationInput } from "../core/uncertainty.js";
import { el, fmt } from "./dom.js";

const won = (/** @type {number} */ n, digits = 0) => `${fmt(n, digits)}원`;
const years = (/** @type {number | null} */ v) => (v === null ? "회수 불가" : `${fmt(v, 1)}년`);

/**
 * 범위 한 줄: 값들을 작은 쪽부터 "a ~ b"로. 모두 같으면 빈 글자(범위가 없다는 뜻).
 * @param {(number | null)[]} values  null은 "회수 불가"(가장 나쁜 값)
 * @param {(v: number | null) => string} format
 */
function rangeText(values, format) {
  const key = (/** @type {number | null} */ v) => (v === null ? Infinity : v);
  const sorted = [...values].sort((a, b) => key(a) - key(b));
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  return key(lo) === key(hi) ? "" : `${format(lo)} ~ ${format(hi)}`;
}

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
  const s = range.base;
  const lo = range.low;
  const hi = range.high;
  const n = input.analysisYears;
  const net = s.netInvestmentKrw;
  const cum = cumulativeFlows(s.flows);
  const shares = range.dayShares;
  const pct = (/** @type {number} */ v) => `${fmt(v * 100)}%`;

  // 회수기간: 누적이 0 이상이 되는 해를 찾아 보여준다
  /** @type {string[]} */
  let paybackSteps;
  if (s.paybackYears === null) {
    paybackSteps = [
      `시작(t=0): 누적 현금흐름 = −순 투자비 = −${won(net)}`,
      "해마다 그 해의 연 절감을 더해 가며 누적이 0 이상이 되는 해를 찾습니다.",
      `${n}년 말 누적 = ${won(cum[n])} → 0에 이르지 못해 ${n}년 안에는 회수하지 못합니다.`,
      "한계: 회수 이후의 수익과 돈의 시간 가치(할인)는 반영하지 않는 지표입니다.",
    ];
  } else if (net <= 0) {
    paybackSteps = [`순 투자비가 ${won(net)}(0 이하)라서 처음부터 회수된 상태입니다.`];
  } else {
    const t = Math.ceil(s.paybackYears - 1e-9);
    const before = cum[t - 1];
    const after = cum[t];
    paybackSteps = [
      `시작(t=0): 누적 현금흐름 = −순 투자비 = −${won(net)}`,
      `해마다 그 해의 연 절감을 더합니다(1년차 연 절감 ${won(s.firstYearSavingKrw)}).`,
      `${t - 1}년 말 누적 ${won(before)} → ${t}년 말 누적 ${won(after)}: ${t}년째에 0선을 넘습니다.`,
      `해 안에서는 직선으로 이어 계산: ${t - 1} + ${won(-before)} ÷ ${t}년째 연 절감 ${won(s.flows[t])} = ${fmt(s.paybackYears, 2)}년`,
      "한계: 회수 이후의 수익과 돈의 시간 가치(할인)는 반영하지 않는 지표입니다.",
    ];
  }

  // 연 평균 절감: 월별 계산의 예시 한 달(발전이 가장 많은 달)을 따라가 본다
  const y1 = s.year1;
  const m = y1.gen.indexOf(Math.max(...y1.gen)); // 0부터
  const tot = flowTotals(y1);
  const yearGen1 = annualGeneration(input, 1);
  const pv = s.npvKrw + net;

  return [
    card("원금 회수기간", years(s.paybackYears), rangeText([lo.paybackYears, s.paybackYears, hi.paybackYears], years), paybackSteps),
    card(`${n}년 NPV`, won(s.npvKrw), rangeText([lo.npvKrw, s.npvKrw, hi.npvKrw], (v) => won(/** @type {number} */ (v))), [
      `식: NPV = −순 투자비 + Σ(t=1..${n}) 연 절감(t) ÷ (1 + 할인율)^t`,
      `할인율 ${fmt(input.discountRate * 100, 2)}%, 분석 기간 ${n}년`,
      `연 절감의 현재가치 합 Σ = ${won(pv)}`,
      `NPV = −${won(net)} + ${won(pv)} = ${won(s.npvKrw)}`,
      "한계: 할인율 가정에 민감합니다.",
    ]),
    card("순 투자비", won(net), "", [
      "식: 순 투자비 = 용량 × kWp당 설치비 − 보조금",
      `대입: ${fmt(input.capacityKwp, 3)} kWp × ${won(input.installCostKrwPerKwp)}/kWp − ${won(input.subsidyKrw)}`,
      `= ${won(net)}`,
    ]),
    card("연 평균 절감액", `${won(s.averageSavingKrw)}/년`, rangeText([lo.averageSavingKrw, s.averageSavingKrw, hi.averageSavingKrw], (v) => `${won(/** @type {number} */ (v))}/년`), [
      "① 1년차 연 발전량 = 용량 × 연간 발전시간(35° 기준) × 경사각 보정 × 방향 보정 × (1 − 추가 손실)",
      `   = ${fmt(input.capacityKwp, 3)} × ${fmt(input.yieldKwhPerKwp, 2)} × ${fmt(input.tiltAnnualFactor ?? 1, 4)}(경사 ${fmt(input.tiltDeg ?? 35)}°) × ${fmt(input.userOrientationFactor ?? input.orientationFactor, 2)} × (1 − ${fmt(input.lossRate, 3)}) = ${fmt(yearGen1, 1)} kWh`,
      `② ${m + 1}월 발전량(발전이 가장 많은 달) = 연 발전량 × 그 달 비율 ${fmt(input.monthlyRatios[m] * 100, 2)}% = ${fmt(y1.gen[m], 1)} kWh`,
      `③ ${m + 1}월 자가소비 = min(발전량, 사용량 × 낮시간 비중) = min(${fmt(y1.gen[m], 1)}, ${fmt(input.monthlyUsageKwh[m])} × ${pct(shares.base)}) = ${fmt(y1.self[m], 1)} kWh, 잉여 ${fmt(y1.export[m], 1)} kWh`,
      `④ 12개월 합: 자가소비 ${fmt(tot.selfKwh, 1)} kWh, 잉여 ${fmt(tot.exportKwh, 1)} kWh`,
      `⑤ 1년차 연 절감 = 자가소비 × 요금 + 잉여 × 판매단가 − 연 유지비 = ${fmt(tot.selfKwh, 1)} × ${fmt(input.electricityPriceKrwPerKwh, 2)} + ${fmt(tot.exportKwh, 1)} × ${fmt(input.feedInPriceKrwPerKwh, 2)} − ${fmt(input.omCostKrwPerYear)} = ${won(s.firstYearSavingKrw)}`,
      `⑥ 효율저하·요금 상승이 있으면 해마다 달라집니다. ${n}년 합계 ${won(s.totalSavingKrw)} ÷ ${n}년 = ${won(s.averageSavingKrw)}/년`,
    ]),
  ];
}

/** 낮시간 사용 비중 범위 표(하한·기준·상한) */
function buildShareRangeBox(range) {
  const box = el("section", { class: "range-box" });
  box.append(
    el("h3", {}, "자가소비 범위 (낮시간 사용 비중 하한 ~ 상한)"),
    el(
      "p",
      {},
      "발전 시간대에 쓰는 전기의 비중을 값 하나로 정할 수 없어서 하한과 상한으로 계산합니다. 기준(가운데)은 범위 안의 한 점이며, 비중 값은 모두 임의 가정입니다.",
    ),
  );
  const table = el("table", { class: "range-table" });
  const head = el("tr");
  const { low, base, high } = range.dayShares;
  head.append(el("th", {}, "지표"));
  for (const [name, v] of [["하한", low], ["기준", base], ["상한", high]]) head.append(el("th", {}, `${name} (${fmt(v * 100)}%)`));
  table.append(head);
  const results = [range.low, range.base, range.high];
  for (const [name, get] of /** @type {[string, (r: any) => string][]} */ ([
    ["자가소비율 (자가소비 ÷ 발전량)", (r) => `${fmt(r.selfConsumptionRate * 100, 1)}%`],
    ["자급률 (자가소비 ÷ 사용량)", (r) => `${fmt(r.selfSufficiencyRate * 100, 1)}%`],
    ["1년차 연 절감", (r) => won(r.firstYearSavingKrw)],
    ["원금 회수기간", (r) => years(r.paybackYears)],
    [`${range.base.flows.length - 1}년 NPV`, (r) => won(r.npvKrw)],
  ])) {
    const row = el("tr");
    row.append(el("th", { scope: "row" }, name), ...results.map((r) => el("td", {}, get(r))));
    table.append(row);
  }
  box.append(table);
  return box;
}

/**
 * 일사 자료 출처 격차(ASOS 대 NASA)를 반영한 범위 상자. 기준 입력에서 발전량을 NASA 수준으로 낮춘 경우를 함께 계산한다.
 * @param {import("../core/seasonal.js").MonthlyInput} input
 * @param {ReturnType<typeof summarizeMonthly>} s  기준 결과
 */
function buildUncertaintyBox(input, s) {
  const low = summarizeMonthly(lowGenerationInput(input));
  const box = el("section", { class: "range-box" });
  box.append(
    el("h3", {}, "데이터 불확실성 범위"),
    el(
      "p",
      {},
      `일사 자료 출처에 따라 발전량이 약 ${fmt((1 - LOW_GENERATION_FACTOR) * 100, 1)}% 달라질 수 있습니다(같은 해 ASOS ${fmt(SOURCE_GAP.asosKwhM2)} 대 NASA POWER ${fmt(SOURCE_GAP.nasaKwhM2)} kWh/m²). 입력한 발전량을 기준으로, NASA 수준이면 발전량이 ×${fmt(LOW_GENERATION_FACTOR, 3)}가 된다고 가정한 값입니다(기준 낮시간 비중 사용).`,
    ),
  );
  const table = el("table", { class: "range-table" });
  const head = el("tr");
  for (const h of ["지표", "입력 기준", "NASA 수준(발전량 낮춤)"]) head.append(el("th", {}, h));
  table.append(head);
  for (const [name, a, b] of [
    ["원금 회수기간", years(s.paybackYears), years(low.paybackYears)],
    [`${input.analysisYears}년 NPV`, won(s.npvKrw), won(low.npvKrw)],
    ["연 평균 절감액", `${won(s.averageSavingKrw)}/년`, `${won(low.averageSavingKrw)}/년`],
  ]) {
    const row = el("tr");
    row.append(el("th", { scope: "row" }, name), el("td", {}, a), el("td", {}, b));
    table.append(row);
  }
  box.append(table);
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
