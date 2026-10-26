// @ts-check
// 지상 태양광 경제성 계산(spec 5.1, 5.6, 13장). 금액 원, 에너지 kWh, 비율 0~1.
// 현금흐름 시점: 투자는 t=0(음수), 수익은 연말 t=1..N.

import { annualGeneration } from "./ground.js";

/**
 * @typedef {import("./ground.js").GenerationInput & {
 *   installCostKrwPerKwp: number,
 *   subsidyKrw: number,
 *   electricityPriceKrwPerKwh: number,
 *   priceEscalationRate: number,
 *   selfConsumptionRate: number,
 *   feedInPriceKrwPerKwh: number,
 *   omCostKrwPerYear: number,
 *   discountRate: number,
 *   analysisYears: number,
 * }} FinanceInput
 */

/** 회수 판정 허용 오차(투자비 대비 비율). 부동소수점 누적 오차로 정확히 회수되는 해를 놓치지 않기 위함 */
const PAYBACK_TOLERANCE = 1e-9;

/** 입력 검사 규칙: [키, 최솟값, 최댓값, 설명] — 범위는 양 끝 포함 */
const RULES = /** @type {const} */ ([
  ["capacityKwp", 0, Infinity, "설치 용량(kWp)은 0 이상"],
  ["yieldKwhPerKwp", 0, Infinity, "kWp당 발전량은 0 이상"],
  ["orientationFactor", 0, 1.5, "방향 보정은 0~1.5"],
  ["lossRate", 0, 1, "손실률은 0~1"],
  ["degradationRate", 0, 1, "효율저하율은 0~1"],
  ["installCostKrwPerKwp", 0, Infinity, "설치비는 0 이상"],
  ["subsidyKrw", 0, Infinity, "보조금은 0 이상"],
  ["electricityPriceKrwPerKwh", 0, Infinity, "전기요금은 0 이상"],
  ["priceEscalationRate", -0.99, Infinity, "요금 상승률은 -0.99 초과"],
  ["selfConsumptionRate", 0, 1, "자가소비율은 0~1"],
  ["feedInPriceKrwPerKwh", 0, Infinity, "판매단가는 0 이상"],
  ["omCostKrwPerYear", 0, Infinity, "유지비는 0 이상"],
  ["discountRate", -0.99, Infinity, "할인율은 -0.99 초과"],
]);

/**
 * 입력 검사. 문제가 없으면 빈 배열을 돌려준다(assumptions.js의 validateAssumptions와 같은 방식).
 * NaN·Infinity·범위 밖 값이 조용히 결과를 오염시키는 것을 막는다.
 * @param {FinanceInput} input
 * @param {string[]} [skipKeys]  검사에서 뺄 키(월별 엔진은 자가소비율을 입력으로 받지 않음)
 * @returns {string[]} 오류 메시지 목록
 */
export function validateFinanceInput(input, skipKeys = []) {
  const errors = [];
  for (const [key, min, max, message] of RULES) {
    if (skipKeys.includes(key)) continue;
    const v = input[key];
    if (typeof v !== "number" || Number.isNaN(v) || v < min || v > max) errors.push(`${key}: ${message} (받은 값 ${v})`);
  }
  const n = input.analysisYears;
  if (!Number.isInteger(n) || n < 1 || n > 100) errors.push(`analysisYears: 분석 기간은 1~100 사이 정수 (받은 값 ${n})`);
  return errors;
}

/**
 * 순 투자비 = 용량 × kWp당 설치비 − 보조금 [원]
 * @param {FinanceInput} input
 * @returns {number}
 */
export function netInvestment(input) {
  return input.capacityKwp * input.installCostKrwPerKwp - input.subsidyKrw;
}

/**
 * y년차 연 절감 [원]
 * = 발전량(y) × [자가소비율 × 전기요금(y) + (1 − 자가소비율) × 잉여 판매단가] − 연 유지비
 * 전기요금(y) = 단가 × (1 + 상승률)^(y−1). 판매단가와 유지비는 물가에 연동하지 않는다.
 * @param {FinanceInput} input
 * @param {number} year  1부터 시작하는 연차
 * @returns {number}
 */
export function annualSaving(input, year) {
  const price = input.electricityPriceKrwPerKwh * Math.pow(1 + input.priceEscalationRate, year - 1);
  const perKwh =
    input.selfConsumptionRate * price + (1 - input.selfConsumptionRate) * input.feedInPriceKrwPerKwh;
  return annualGeneration(input, year) * perKwh - input.omCostKrwPerYear;
}

/**
 * 연도별 현금흐름 [원]. 길이 N+1, 인덱스 t가 t년 말. 인덱스 0은 −순 투자비.
 * @param {FinanceInput} input
 * @returns {number[]}
 */
export function cashFlows(input) {
  const errors = validateFinanceInput(input);
  if (errors.length) throw new RangeError("재무 입력 오류:\n" + errors.join("\n"));
  const flows = [-netInvestment(input)];
  for (let y = 1; y <= input.analysisYears; y++) flows.push(annualSaving(input, y));
  return flows;
}

/**
 * 회수기간 [년]: 누적 현금흐름이 처음 0 이상이 되는 시점(해 안에서는 선형 보간).
 * 분석 기간 안에 회수하지 못하면 null.
 * @param {number[]} flows  cashFlows()의 결과
 * @returns {number | null}
 */
export function paybackYears(flows) {
  let cumulative = flows[0];
  if (cumulative >= 0) return 0;
  const tolerance = PAYBACK_TOLERANCE * -flows[0];
  for (let t = 1; t < flows.length; t++) {
    const previous = cumulative;
    cumulative += flows[t];
    // 이 해에 0을 넘었다면 flows[t] > 0 이므로 0으로 나눌 일이 없다
    if (cumulative >= -tolerance) return t - 1 + Math.min(1, -previous / flows[t]);
  }
  return null;
}

/**
 * NPV [원] = Σ_{t=0..N} 현금흐름_t / (1 + r)^t  (t=0 항이 −순 투자비)
 * @param {number[]} flows
 * @param {number} discountRate
 * @returns {number}
 */
export function npv(flows, discountRate) {
  if (!(discountRate > -1)) throw new RangeError(`할인율은 -1보다 커야 함: ${discountRate}`);
  return flows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + discountRate, t), 0);
}

/**
 * @typedef {Object} Summary
 * @property {number} netInvestmentKrw     순 투자비 [원]
 * @property {number} firstYearSavingKrw   1년차 연 절감 [원]
 * @property {number} totalSavingKrw       분석 기간 연 절감의 합 [원]
 * @property {number} averageSavingKrw     연 평균 절감 [원] (합 ÷ 분석 기간)
 * @property {number | null} paybackYears  회수기간 [년], 기간 내 회수 불가면 null
 * @property {number} npvKrw               NPV [원]
 * @property {number[]} flows              연도별 현금흐름(0번이 −순 투자비)
 */

/**
 * 연도별 현금흐름에서 결과 요약을 만든다(연 단위 엔진과 월별 엔진이 함께 쓴다).
 * @param {number[]} flows  인덱스 0은 −순 투자비, 1..N은 연 절감
 * @param {number} discountRate
 * @param {number} analysisYears
 * @returns {Summary}
 */
export function summaryFromFlows(flows, discountRate, analysisYears) {
  const totalSavingKrw = flows.slice(1).reduce((sum, cf) => sum + cf, 0);
  return {
    netInvestmentKrw: -flows[0],
    firstYearSavingKrw: flows[1],
    totalSavingKrw,
    averageSavingKrw: totalSavingKrw / analysisYears,
    paybackYears: paybackYears(flows),
    npvKrw: npv(flows, discountRate),
    flows,
  };
}

/**
 * 화면 결과 카드용 요약. 입력이 잘못되면 cashFlows가 RangeError를 던진다.
 * @param {FinanceInput} input
 * @returns {Summary}
 */
export function summarize(input) {
  return summaryFromFlows(cashFlows(input), input.discountRate, input.analysisYears);
}

/**
 * 누적 현금흐름 [원]. 인덱스 t가 t년 말까지의 합(0번은 −순 투자비). 그래프용.
 * @param {number[]} flows  cashFlows()의 결과
 * @returns {number[]}
 */
export function cumulativeFlows(flows) {
  let sum = 0;
  return flows.map((cf) => (sum += cf));
}
