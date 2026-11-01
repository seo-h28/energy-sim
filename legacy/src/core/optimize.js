// @ts-check
// 용량 곡선과 추천(spec 5.4, 8차): 설치 용량을 바꿔 가며 NPV·회수기간·자가소비율·자급률을 계산하고,
// NPV가 가장 큰 용량과 "포화 용량"(이보다 크면 잉여만 늘어나는 용량)을 찾는다.
//
// 탐색은 용량 한 가지 변수의 격자(수십~백 개)라서 한 번에 몇 밀리초면 끝난다. 그래서 Web Worker는 쓰지 않는다
// (경사각·방위까지 2차원 격자를 만드는 단계에서 필요하면 그때 도입한다).

import { annualGeneration } from "./ground.js";
import { summarizeRange } from "./seasonal.js";

/** 격자 간격 후보 [kWp]. 점이 100개 이하가 되는 가장 촘촘한 간격을 고른다 */
const STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5];

/**
 * 탐색 범위의 격자 간격 [kWp].
 * @param {number} maxKwp
 * @returns {number}
 */
export function niceStep(maxKwp) {
  return STEPS.find((s) => maxKwp / s <= 100) ?? STEPS[STEPS.length - 1];
}

/**
 * 용량 격자: step, 2·step, …, maxKwp (0은 넣지 않는다. 용량 0은 "투자하지 않음"이라 비교 대상이 아님).
 * @param {number} maxKwp
 * @returns {number[]}
 */
export function capacityGrid(maxKwp) {
  if (!(maxKwp > 0)) return [];
  const step = niceStep(maxKwp);
  const n = Math.max(1, Math.round(maxKwp / step));
  return Array.from({ length: n }, (_, k) => Math.round((k + 1) * step * 1e9) / 1e9);
}

/**
 * 포화 용량 [kWp] (1년차 기준): 모든 달에서 월 발전량이 낮에 쓰는 전기(사용량 × 낮시간 비중) 이상이 되는 가장 작은 용량.
 * 이보다 크면 자가소비가 더 늘지 않고 잉여만 늘어난다. 용량에 비례하는 발전량으로 달마다 필요한 용량을 구해 가장 큰 값을 쓴다.
 * 발전이 0인 달에 낮 사용이 있으면 포화되지 않으므로 Infinity.
 * @param {Omit<import("./seasonal.js").MonthlyInput, "capacityKwp">} input  dayShare를 포함한 입력
 * @returns {number}
 */
export function saturationCapacity(input) {
  const perKwp = annualGeneration({ ...input, capacityKwp: 1 }, 1);
  let need = 0;
  for (let m = 0; m < 12; m++) {
    const dayUse = input.monthlyUsageKwh[m] * input.dayShare;
    const gen = perKwp * input.monthlyRatios[m];
    if (dayUse <= 0) continue;
    if (!(gen > 0)) return Infinity;
    need = Math.max(need, dayUse / gen);
  }
  return need;
}

/**
 * 용량 하나의 결과 요약(하한·기준·상한).
 * @typedef {Object} CurvePoint
 * @property {number} capacityKwp
 * @property {number} netInvestmentKrw
 * @property {{ low: number, base: number, high: number }} npv
 * @property {{ low: number | null, base: number | null, high: number | null }} payback
 * @property {number} selfConsumptionRate  기준 낮시간 비중
 * @property {number} selfSufficiencyRate  기준 낮시간 비중
 * @property {number} firstYearSavingKrw   기준 낮시간 비중
 */

/**
 * 용량 하나를 계산한다.
 * @param {Omit<import("./seasonal.js").MonthlyInput, "dayShare">} input
 * @param {number} capacityKwp
 * @param {number} dayShareLow
 * @param {number} dayShareHigh
 * @returns {CurvePoint}
 */
export function evaluateCapacity(input, capacityKwp, dayShareLow, dayShareHigh) {
  const r = summarizeRange({ ...input, capacityKwp }, dayShareLow, dayShareHigh);
  return {
    capacityKwp,
    netInvestmentKrw: r.base.netInvestmentKrw,
    npv: { low: r.low.npvKrw, base: r.base.npvKrw, high: r.high.npvKrw },
    payback: { low: r.low.paybackYears, base: r.base.paybackYears, high: r.high.paybackYears },
    selfConsumptionRate: r.base.selfConsumptionRate,
    selfSufficiencyRate: r.base.selfSufficiencyRate,
    firstYearSavingKrw: r.base.firstYearSavingKrw,
  };
}

/**
 * 용량 곡선: 격자의 각 용량을 계산한다.
 * @param {Omit<import("./seasonal.js").MonthlyInput, "dayShare">} input  capacityKwp는 무시된다
 * @param {number} dayShareLow
 * @param {number} dayShareHigh
 * @param {number[]} capacities
 * @returns {CurvePoint[]}
 */
export function capacityCurve(input, dayShareLow, dayShareHigh, capacities) {
  return capacities.map((c) => evaluateCapacity(input, c, dayShareLow, dayShareHigh));
}

/**
 * NPV가 가장 큰 점. NPV가 모두 0 이하면 "투자하지 않는 편이 낫다"는 뜻이라 null. 같은 값이면 작은 용량을 고른다.
 * @param {CurvePoint[]} points
 * @param {"low" | "base" | "high"} [which]
 * @returns {CurvePoint | null}
 */
export function bestByNpv(points, which = "base") {
  /** @type {CurvePoint | null} */
  let best = null;
  for (const p of points) {
    if (p.npv[which] > 0 && (best === null || p.npv[which] > best.npv[which])) best = p;
  }
  return best;
}

/**
 * 탐색 범위 최대 용량 [kWp] 자동 선택: 포화 용량의 1.5배, 현재 입력의 1.2배, 최소 5 중 큰 값을 올림(10 이하는 정수, 그 위는 5 단위), 최대 50.
 * @param {number} saturationKwp  Infinity 가능
 * @param {number} currentKwp
 * @param {number} [areaLimitKwp]  설치 가능 면적에서 나오는 최대 용량(없으면 NaN)
 * @returns {number}
 */
export function autoMaxCapacity(saturationKwp, currentKwp, areaLimitKwp = NaN) {
  const sat = Number.isFinite(saturationKwp) ? saturationKwp * 1.5 : 0;
  const area = Number.isFinite(areaLimitKwp) ? areaLimitKwp * 1.2 : 0; // 설치 가능 면적의 한계선이 그래프 안에 보이도록
  const raw = Math.max(5, sat, area, (Number.isFinite(currentKwp) ? currentKwp : 0) * 1.2);
  const rounded = raw <= 10 ? Math.ceil(raw) : Math.ceil(raw / 5) * 5;
  return Math.min(50, rounded);
}
