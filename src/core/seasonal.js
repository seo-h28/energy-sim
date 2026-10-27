// @ts-check
// 월별 엔진(spec 5.0, 5.1b, 5.7): 12개월 발전량 vs 12개월 사용량으로 자가소비·잉여·절감을 계산한다.
//
// 달마다:  발전량[m] = 연 발전량(y) × 월 비율[m]
//          낮에 쓰는 전기[m] = 사용량[m] × 낮시간 비중
//          자가소비[m] = min(발전량[m], 낮에 쓰는 전기[m]),  잉여[m] = 발전량[m] − 자가소비[m]
//          절감[m] = 자가소비[m] × 전기요금(y) + 잉여[m] × 판매단가
// 연 절감(y) = Σ절감[m] − 연 유지비.  이후 현금흐름·회수기간·NPV는 finance.js와 같다.
//
// 요금: 기본은 단일 단가. monthlyBilling(12개월 요금표, billing.js)이 있으면 누진·계절 요금으로
//        절감[m] = (요금(사용량[m]) − 요금(사용량[m] − 자가소비[m])) × 요금 상승 + 잉여[m] × 판매단가 로 계산한다(S13).
// 단순화(화면에 공개): 사용량은 해마다 같고,
// 월 단위 합산은 낮 발전·저녁 사용의 시간대 차이를 완전히 반영하지 못하는 근사다.

import { annualGeneration } from "./ground.js";
import { netInvestment, summaryFromFlows, validateFinanceInput } from "./finance.js";
import { billKrw, validateMonthlyBilling } from "./billing.js";

/**
 * @typedef {Omit<import("./finance.js").FinanceInput, "selfConsumptionRate"> & {
 *   monthlyUsageKwh: number[],
 *   monthlyRatios: number[],
 *   dayShare: number,
 * }} MonthlyInput
 * monthlyUsageKwh: 1~12월 전기 사용량 [kWh], monthlyRatios: 1~12월 발전 비율(합 1), dayShare: 낮시간 사용 비중(0~1)
 * monthlyBilling(선택): 1~12월 요금표(billing.js). 있으면 전기요금 단가 대신 월별 요금표로 절감을 계산한다. billScale(선택, 기본 1): 요금표 전체에 곱하는 배수(민감도용)
 */

const MONTHS = 12;
/** @typedef {import("./billing.js").MonthBilling} MonthBilling */
const RATIO_SUM_TOLERANCE = 1e-6;

/**
 * 입력 검사. 문제가 없으면 빈 배열.
 * @param {MonthlyInput} input
 * @returns {string[]}
 */
export function validateMonthlyInput(input) {
  const errors = validateFinanceInput(/** @type {any} */ (input), ["selfConsumptionRate"]);
  const usage = input.monthlyUsageKwh;
  if (!Array.isArray(usage) || usage.length !== MONTHS || !usage.every((v) => Number.isFinite(v) && v >= 0)) {
    errors.push("monthlyUsageKwh: 월별 사용량은 12개월 모두 0 이상의 숫자여야 함");
  }
  const ratios = input.monthlyRatios;
  if (!Array.isArray(ratios) || ratios.length !== MONTHS || !ratios.every((v) => Number.isFinite(v) && v >= 0)) {
    errors.push("monthlyRatios: 월별 발전 비율은 12개월 모두 0 이상의 숫자여야 함");
  } else if (Math.abs(ratios.reduce((a, b) => a + b, 0) - 1) > RATIO_SUM_TOLERANCE) {
    errors.push("monthlyRatios: 월별 발전 비율의 합이 1이 아님");
  }
  // 경사각은 선택 항목(엔진 식에는 쓰지 않고 입력 단계의 월 비율·연 보정에서 쓰인다). 있으면 범위만 확인한다
  if (/** @type {any} */ (input).tiltDeg !== undefined && !(/** @type {any} */ (input).tiltDeg >= 0 && /** @type {any} */ (input).tiltDeg <= 90)) {
    errors.push(`tiltDeg: 경사각은 0~90도 (받은 값 ${/** @type {any} */ (input).tiltDeg})`);
  }
  const billing = /** @type {any} */ (input).monthlyBilling;
  if (billing !== undefined) errors.push(...validateMonthlyBilling(billing));
  if (!(input.dayShare >= 0 && input.dayShare <= 1)) errors.push(`dayShare: 낮시간 사용 비중은 0~1 (받은 값 ${input.dayShare})`);
  return errors;
}

/**
 * y년차 월별 내역.
 * @param {MonthlyInput} input
 * @param {number} year  1부터 시작
 * @returns {{ gen: number[], self: number[], export: number[], saving: number[] }}  각 길이 12 (절감은 유지비를 빼기 전)
 */
export function monthlyBreakdown(input, year) {
  const yearGen = annualGeneration(input, year);
  const escalation = Math.pow(1 + input.priceEscalationRate, year - 1);
  const price = input.electricityPriceKrwPerKwh * escalation;
  /** @type {MonthBilling[] | undefined} */
  const billing = /** @type {any} */ (input).monthlyBilling;
  const billScale = /** @type {any} */ (input).billScale ?? 1;
  /** @type {number[]} */ const gen = [];
  /** @type {number[]} */ const self = [];
  /** @type {number[]} */ const exp = [];
  /** @type {number[]} */ const saving = [];
  for (let m = 0; m < MONTHS; m++) {
    const g = yearGen * input.monthlyRatios[m];
    const s = Math.min(g, input.monthlyUsageKwh[m] * input.dayShare);
    gen.push(g);
    self.push(s);
    exp.push(g - s);
    const u = input.monthlyUsageKwh[m];
    // 월별 요금표가 있으면 "요금(사용량) − 요금(사용량 − 자가소비)", 없으면 단일 단가(S13)
    const bill = billing ? escalation * billScale * (billKrw(billing[m], u) - billKrw(billing[m], u - s)) : s * price;
    saving.push(bill + (g - s) * input.feedInPriceKrwPerKwh);
  }
  return { gen, self, export: exp, saving };
}

/**
 * y년차 연 절감 [원] = Σ월 절감 − 연 유지비
 * @param {MonthlyInput} input
 * @param {number} year
 * @returns {number}
 */
export function monthlyAnnualSaving(input, year) {
  return monthlyBreakdown(input, year).saving.reduce((a, b) => a + b, 0) - input.omCostKrwPerYear;
}

/**
 * 연도별 현금흐름 [원] (길이 N+1, 0번은 −순 투자비). 입력이 잘못되면 RangeError.
 * @param {MonthlyInput} input
 * @returns {number[]}
 */
export function monthlyCashFlows(input) {
  const errors = validateMonthlyInput(input);
  if (errors.length) throw new RangeError("월별 입력 오류:\n" + errors.join("\n"));
  const flows = [-netInvestment(/** @type {any} */ (input))];
  for (let y = 1; y <= input.analysisYears; y++) flows.push(monthlyAnnualSaving(input, y));
  return flows;
}

/**
 * 결과 요약 + 1년차 월별 내역과 비율 지표.
 * @param {MonthlyInput} input
 * @returns {import("./finance.js").Summary & { year1: ReturnType<typeof monthlyBreakdown>, selfConsumptionRate: number, selfSufficiencyRate: number }}
 */
export function summarizeMonthly(input) {
  const flows = monthlyCashFlows(input);
  const year1 = monthlyBreakdown(input, 1);
  const genTotal = year1.gen.reduce((a, b) => a + b, 0);
  const selfTotal = year1.self.reduce((a, b) => a + b, 0);
  const usageTotal = input.monthlyUsageKwh.reduce((a, b) => a + b, 0);
  return {
    ...summaryFromFlows(flows, input.discountRate, input.analysisYears),
    year1,
    // 자가소비율 = 자가소비 ÷ 발전량, 자급률 = 자가소비 ÷ 총 사용량 (spec 5.6)
    selfConsumptionRate: genTotal > 0 ? selfTotal / genTotal : 0,
    selfSufficiencyRate: usageTotal > 0 ? selfTotal / usageTotal : 0,
  };
}

/**
 * 낮시간 비중을 하한·상한 두 값으로 계산해 결과를 범위로 만든다(spec 5.1b, 8차). 기준은 두 값의 가운데(범위 안의 한 점).
 * @param {Omit<MonthlyInput, "dayShare">} input
 * @param {number} dayShareLow
 * @param {number} dayShareHigh
 * @returns {{ low: ReturnType<typeof summarizeMonthly>, base: ReturnType<typeof summarizeMonthly>, high: ReturnType<typeof summarizeMonthly>, dayShares: { low: number, base: number, high: number } }}
 */
export function summarizeRange(input, dayShareLow, dayShareHigh) {
  if (!(dayShareLow >= 0 && dayShareHigh <= 1 && dayShareLow <= dayShareHigh)) {
    throw new RangeError(`낮시간 비중 하한·상한은 0 ≤ 하한 ≤ 상한 ≤ 1 이어야 함: ${dayShareLow}, ${dayShareHigh}`);
  }
  const base = (dayShareLow + dayShareHigh) / 2;
  return {
    low: summarizeMonthly({ ...input, dayShare: dayShareLow }),
    base: summarizeMonthly({ ...input, dayShare: base }),
    high: summarizeMonthly({ ...input, dayShare: dayShareHigh }),
    dayShares: { low: dayShareLow, base, high: dayShareHigh },
  };
}

/**
 * 낮시간 사용 비중 하한·상한 검사. 문제가 없으면 빈 배열.
 * @param {number} low
 * @param {number} high
 * @returns {string[]}
 */
export function validateDayShareRange(low, high) {
  const errors = [];
  if (!(low >= 0 && low <= 1)) errors.push(`dayShareLow: 낮시간 사용 비중 하한은 0~1 (받은 값 ${low})`);
  if (!(high >= 0 && high <= 1)) errors.push(`dayShareHigh: 낮시간 사용 비중 상한은 0~1 (받은 값 ${high})`);
  if (low > high) errors.push(`dayShareLow: 낮시간 사용 비중 하한은 상한보다 클 수 없음 (하한 ${low}, 상한 ${high})`);
  return errors;
}

/** 계절 구분(기상 기준). 요금표의 계절(주택용 하계 7~8월 등)과는 따로 쓴다. 월은 1~12 */
export const SEASONS = Object.freeze([
  { id: "spring", label: "봄 (3~5월)", months: [3, 4, 5] },
  { id: "summer", label: "여름 (6~8월)", months: [6, 7, 8] },
  { id: "autumn", label: "가을 (9~11월)", months: [9, 10, 11] },
  { id: "winter", label: "겨울 (12~2월)", months: [12, 1, 2] },
]);

/**
 * 1년차 월별 내역을 계절별로 합친다(화면의 계절 요약용).
 * @param {{ gen: number[], self: number[], export: number[], saving: number[] }} year1
 * @param {number[]} monthlyUsageKwh
 * @returns {{ id: string, label: string, usageKwh: number, genKwh: number, selfKwh: number, exportKwh: number, savingKrw: number, selfSufficiency: number }[]}
 */
export function seasonSummary(year1, monthlyUsageKwh) {
  return SEASONS.map((s) => {
    const sum = (/** @type {number[]} */ arr) => s.months.reduce((acc, m) => acc + arr[m - 1], 0);
    const usageKwh = sum(monthlyUsageKwh);
    const selfKwh = sum(year1.self);
    return {
      id: s.id,
      label: s.label,
      usageKwh,
      genKwh: sum(year1.gen),
      selfKwh,
      exportKwh: sum(year1.export),
      savingKrw: sum(year1.saving),
      selfSufficiency: usageKwh > 0 ? selfKwh / usageKwh : 0,
    };
  });
}

/**
 * LCOE(균등화 발전단가) [원/kWh] (spec 5.6): (순 투자비 + Σ 유지비 ÷ (1+r)^t) ÷ Σ 발전량(t) ÷ (1+r)^t, t = 1..분석 기간.
 * 발전량은 총 발전량(자가소비+잉여)이고 효율저하·손실·방향 보정을 반영한다. 한전 단가와 나란히 놓고 볼 수 있는 "내가 만든 전기 1 kWh의 비용"이다.
 * 발전량 합이 0이면 null.
 * @param {Omit<MonthlyInput, "dayShare"> | MonthlyInput} input
 * @returns {number | null}
 */
export function lcoeKrwPerKwh(input) {
  const errors = validateMonthlyInput(/** @type {any} */ ({ dayShare: 0.5, ...input }));
  if (errors.length) throw new RangeError("월별 입력 오류:\n" + errors.join("\n"));
  const r = input.discountRate;
  let cost = netInvestment(/** @type {any} */ (input));
  let energy = 0;
  for (let y = 1; y <= input.analysisYears; y++) {
    const d = Math.pow(1 + r, y);
    cost += input.omCostKrwPerYear / d;
    energy += annualGeneration(/** @type {any} */ (input), y) / d;
  }
  return energy > 0 ? cost / energy : null;
}
