// @ts-check
// 결과 카드와 범위 표의 "내용"(숫자와 문장)을 만든다. 화면 요소는 만들지 않는 순수 함수라 기존 화면(ui/result-cards.js)과
// React 화면(react/)이 같은 문장을 그대로 쓴다. 숫자는 월별 엔진 결과를 그대로 옮긴다.
import { cumulativeFlows } from "./finance.js";
import { annualGeneration } from "./ground.js";
import { flowTotals } from "./flow.js";
import { summarizeMonthly } from "./seasonal.js";
import { billKrw } from "./billing.js";
import { LOW_GENERATION_FACTOR, SOURCE_GAP, lowGenerationInput } from "./uncertainty.js";

/** 천 단위 구분 + 소수 자리 제한(표시용) */
const fmt = (/** @type {number} */ n, maxFractionDigits = 0) => n.toLocaleString("ko-KR", { maximumFractionDigits: maxFractionDigits });
const won = (/** @type {number} */ n, digits = 0) => `${fmt(n, digits)}원`;
const years = (/** @type {number | null} */ v) => (v === null ? "본전 못 찾음" : `${fmt(v, 1)}년`);

/**
 * 범위 한 줄: 값들을 작은 쪽부터 "a ~ b"로. 모두 같으면 빈 글자(범위가 없다는 뜻).
 * @param {(number | null)[]} values  null은 "본전 못 찾음"(가장 나쁜 값)
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
 * @typedef {Object} CardData
 * @property {string} title
 * @property {string} value   "7.1년", "2,541,024원" 같은 큰 글자
 * @property {string} range   범위 한 줄(없으면 빈 글자)
 * @property {string[]} steps 계산 과정(한 줄씩)
 */

/** @returns {CardData} */
function card(/** @type {string} */ title, /** @type {string} */ value, /** @type {string} */ range, /** @type {string[]} */ steps) {
  return { title, value, range, steps };
}

/**
 * @param {import("./seasonal.js").MonthlyInput} input  기준 입력(낮시간 비중은 하한과 상한의 가운데)
 * @param {ReturnType<typeof import("./seasonal.js").summarizeRange>} range
 * @returns {CardData[]}
 */
export function buildCardData(input, range) {
  const s = range.base;
  const lo = range.low;
  const hi = range.high;
  const n = input.analysisYears;
  const net = s.netInvestmentKrw;
  const cum = cumulativeFlows(s.flows);
  const shares = range.dayShares;
  const pct = (/** @type {number} */ v) => `${fmt(v * 100)}%`;

  // 본전 기간: 누적이 0 이상이 되는 해를 찾아 보여준다
  /** @type {string[]} */
  let paybackSteps;
  if (s.paybackYears === null) {
    paybackSteps = [
      `시작(t=0): 누적 현금흐름 = −실제 투자비 = −${won(net)}`,
      "해마다 그 해의 연 절감을 더해 가며 누적이 0 이상이 되는 해를 찾습니다.",
      `${n}년 말 누적 = ${won(cum[n])} → 0에 이르지 못해 ${n}년 안에는 회수하지 못합니다.`,
      "한계: 회수 이후의 수익과 돈의 시간 가치(할인)는 반영하지 않는 지표입니다.",
    ];
  } else if (net <= 0) {
    paybackSteps = [`실제 투자비가 ${won(net)}(0 이하)라서 처음부터 회수된 상태입니다.`];
  } else {
    const t = Math.ceil(s.paybackYears - 1e-9);
    const before = cum[t - 1];
    const after = cum[t];
    paybackSteps = [
      `시작(t=0): 누적 현금흐름 = −실제 투자비 = −${won(net)}`,
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
  const isNet = input.netMetering === 1;
  const offTot = (y1.offset ?? []).reduce((a, b) => a + b, 0);
  const leftover = tot.exportKwh - offTot;
  const soldKwh = isNet ? leftover : tot.exportKwh;
  const cut = (/** @type {number} */ k) => y1.self[k] + (y1.offset?.[k] ?? 0);
  const inv = input.inverterReplaceYear > 0 && input.inverterReplaceYear <= n && input.inverterReplaceKrw > 0 ? input.inverterReplaceKrw : 0;

  return [
    card("본전 기간", years(s.paybackYears), rangeText([lo.paybackYears, s.paybackYears, hi.paybackYears], years), paybackSteps),
    card(`${n}년 순이익`, won(s.npvKrw), rangeText([lo.npvKrw, s.npvKrw, hi.npvKrw], (v) => won(/** @type {number} */ (v))), [
      `식: 순이익 = −실제 투자비 + Σ(t=1..${n}) 연 절감(t) ÷ (1 + 할인율)^t`,
      `할인율 ${fmt(input.discountRate * 100, 2)}%, 분석 기간 ${n}년`,
      `연 절감의 현재가치 합 Σ = ${won(pv)}${inv ? ` (${input.inverterReplaceYear}년차 인버터 교체비 ${won(inv)}를 그 해 절감에서 뺌)` : ""}`,
      `순이익 = −${won(net)} + ${won(pv)} = ${won(s.npvKrw)}`,
      "한계: 할인율 가정에 민감합니다.",
    ]),
    card("실제 투자비", won(net), "", [
      "식: 실제 투자비 = 용량 × kWp당 설치비 − 보조금",
      `대입: ${fmt(input.capacityKwp, 3)} kWp × ${won(input.installCostKrwPerKwp)}/kWp − ${won(input.subsidyKrw)}`,
      `= ${won(net)}`,
    ]),
    card("연 평균 절감액", `${won(s.averageSavingKrw)}/년`, rangeText([lo.averageSavingKrw, s.averageSavingKrw, hi.averageSavingKrw], (v) => `${won(/** @type {number} */ (v))}/년`), [
      "① 1년차 연 발전량 = 용량 × 연간 발전시간(35° 기준) × 경사각 보정 × 방위각 보정 × 추가 보정 × (1 − 추가 손실)",
      `   = ${fmt(input.capacityKwp, 3)} × ${fmt(input.yieldKwhPerKwp, 2)} × ${fmt(input.tiltAnnualFactor ?? 1, 4)}(경사 ${fmt(input.tiltDeg ?? 35)}°) × ${fmt(input.aspectFactor ?? 1, 4)}(방위 ${fmt(input.azimuthDeg ?? 0)}°) × ${fmt(input.userOrientationFactor ?? input.orientationFactor, 2)} × (1 − ${fmt(input.lossRate, 3)}) = ${fmt(yearGen1, 1)} kWh`,
      `② ${m + 1}월 발전량(발전이 가장 많은 달) = 연 발전량 × 그 달 비율 ${fmt(input.monthlyRatios[m] * 100, 2)}% = ${fmt(y1.gen[m], 1)} kWh`,
      `③ ${m + 1}월 바로 쓴 전기 = min(발전량, 사용량 × 낮시간 비중) = min(${fmt(y1.gen[m], 1)}, ${fmt(input.monthlyUsageKwh[m])} × ${pct(shares.base)}) = ${fmt(y1.self[m], 1)} kWh, 남는 전기 ${fmt(y1.export[m], 1)} kWh`,
      isNet
        ? `④ 12개월 합: 바로 쓴 전기 ${fmt(tot.selfKwh, 1)} kWh, 남는 전기 ${fmt(tot.exportKwh, 1)} kWh 중 상계(적립했다가 한전에서 사는 전기에서 뺌) ${fmt(offTot, 1)} kWh, 해 끝에 남은 적립 ${fmt(leftover, 1)} kWh`
        : `④ 12개월 합: 바로 쓴 전기 ${fmt(tot.selfKwh, 1)} kWh, 남는 전기 ${fmt(tot.exportKwh, 1)} kWh(상계거래 안 함)`,
      ...(input.monthlyBilling
        ? [
            isNet
              ? "⑤ 요금표(누진·계절)로 계산: 월 절감 = 요금(사용량) − 요금(사용량 − 바로 쓴 전기 − 상계)  (그만큼 한전에서 덜 산다고 봄)"
              : "⑤ 요금표(누진·계절)로 계산: 월 절감 = 요금(사용량) − 요금(사용량 − 바로 쓴 전기)  (바로 쓴 전기만큼 한전에서 덜 산다고 봄)",
            `   예) ${m + 1}월: 요금(${fmt(input.monthlyUsageKwh[m])} kWh) ${won(billKrw(input.monthlyBilling[m], input.monthlyUsageKwh[m]) * (input.billScale ?? 1))} − 요금(${fmt(input.monthlyUsageKwh[m] - cut(m), 1)} kWh) ${won(billKrw(input.monthlyBilling[m], input.monthlyUsageKwh[m] - cut(m)) * (input.billScale ?? 1))} = ${won((billKrw(input.monthlyBilling[m], input.monthlyUsageKwh[m]) - billKrw(input.monthlyBilling[m], input.monthlyUsageKwh[m] - cut(m))) * (input.billScale ?? 1))}`,
            `⑥ 1년차 연 절감 = Σ월 요금 절감 + ${isNet ? "남은 적립" : "남는 전기"} × 판매단가 − 연 유지비 = ${won(y1.saving.reduce((a, b) => a + b, 0) - soldKwh * input.feedInPriceKrwPerKwh)} + ${fmt(soldKwh, 1)} × ${fmt(input.feedInPriceKrwPerKwh, 2)} − ${fmt(input.omCostKrwPerYear)} = ${won(s.firstYearSavingKrw)}`,
            `⑦ 효율저하·요금 상승이 있으면 해마다 달라집니다(요금표 전체에 요금 상승률을 곱함). ${n}년 합계 ${won(s.totalSavingKrw)} ÷ ${n}년 = ${won(s.averageSavingKrw)}/년`,
          ]
        : [
            `⑤ 1년차 연 절감 = (바로 쓴 전기${isNet ? " + 상계" : ""}) × 요금 + ${isNet ? "남은 적립" : "남는 전기"} × 판매단가 − 연 유지비 = ${fmt(tot.selfKwh + offTot, 1)} × ${fmt(input.electricityPriceKrwPerKwh, 2)} + ${fmt(soldKwh, 1)} × ${fmt(input.feedInPriceKrwPerKwh, 2)} − ${fmt(input.omCostKrwPerYear)} = ${won(s.firstYearSavingKrw)}`,
            `⑥ 효율저하·요금 상승이 있으면 해마다 달라집니다. ${n}년 합계 ${won(s.totalSavingKrw)} ÷ ${n}년 = ${won(s.averageSavingKrw)}/년`,
          ]),
    ]),
  ];
}


/**
 * 낮시간 사용 비중 범위 표(하한·기준·상한).
 * @param {ReturnType<typeof import("./seasonal.js").summarizeRange>} range
 * @returns {{ headers: string[], rows: { name: string, cells: string[] }[] }}
 */
export function shareRangeTable(range) {
  const { low, base, high } = range.dayShares;
  const results = [range.low, range.base, range.high];
  /** @type {[string, (r: any) => string][]} */
  const defs = [
    ["바로 쓴 비율 (바로 쓴 전기 ÷ 발전량)", (r) => `${fmt(r.selfConsumptionRate * 100, 1)}%`],
    ["집에서 바로 쓴 몫 (바로 쓴 전기 ÷ 사용량)", (r) => `${fmt(r.selfSufficiencyRate * 100, 1)}%`],
    ["1년차 연 절감", (r) => won(r.firstYearSavingKrw)],
    ["본전 기간", (r) => years(r.paybackYears)],
    [`${range.base.flows.length - 1}년 순이익`, (r) => won(r.npvKrw)],
  ];
  return {
    headers: ["지표", ...[["하한", low], ["기준", base], ["상한", high]].map(([name, v]) => `${name} (${fmt(/** @type {number} */ (v) * 100)}%)`)],
    rows: defs.map(([name, get]) => ({ name, cells: results.map(get) })),
  };
}

/**
 * 일사 자료 출처 격차(ASOS 대 NASA)를 반영한 범위: 기준 입력에서 발전량을 NASA 수준으로 낮춘 경우를 함께 계산한다.
 * @param {import("./seasonal.js").MonthlyInput} input
 * @param {ReturnType<typeof summarizeMonthly>} s  기준 결과
 * @returns {{ intro: string, headers: string[], rows: { name: string, cells: string[] }[] }}
 */
export function uncertaintyTable(input, s) {
  const low = summarizeMonthly(lowGenerationInput(input));
  return {
    intro: `일사 자료 출처에 따라 발전량이 약 ${fmt((1 - LOW_GENERATION_FACTOR) * 100, 1)}% 달라질 수 있습니다(같은 해 ASOS ${fmt(SOURCE_GAP.asosKwhM2)} 대 NASA POWER ${fmt(SOURCE_GAP.nasaKwhM2)} kWh/m²). 입력한 발전량을 기준으로, NASA 수준이면 발전량이 ×${fmt(LOW_GENERATION_FACTOR, 3)}가 된다고 가정한 값입니다(기준 낮시간 비중 사용).`,
    headers: ["지표", "입력 기준", "NASA 수준(발전량 낮춤)"],
    rows: [
      { name: "본전 기간", cells: [years(s.paybackYears), years(low.paybackYears)] },
      { name: `${input.analysisYears}년 순이익`, cells: [won(s.npvKrw), won(low.npvKrw)] },
      { name: "연 평균 절감액", cells: [`${won(s.averageSavingKrw)}/년`, `${won(low.averageSavingKrw)}/년`] },
    ],
  };
}
