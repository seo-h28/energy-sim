// @ts-check
// 에너지 결손(Energy Gap, spec 0.1): 설치 가능 면적을 모두 쓴 설계의 발전량으로도 채우지 못하는 전기.
//   최대 용량 = 설치 가능 면적 ÷ kWp당 필요 면적
//   결손(연) = max(0, 연 사용량 − 그 용량의 1년차 연 발전량),  결손_m = max(0, 사용량_m − 발전량_m)  (월 단위도 같은 방식)
// 연·월 단위 에너지 합계 기준이며 낮 발전·저녁 사용 같은 시간대 불일치는 반영하지 않는다(화면에 표기).
// 지상 설계의 계산값이며 측정값이 아니다. 면적과 kWp당 필요 면적이 assumed이면 결손도 가정에 의존한다.
// 우주 비교 모드와 연결하지 않는다(결손의 원인은 대부분 면적이고, 우주 전력은 건물이 아니라 지상 수신 부지로 들어오므로).

import { monthlyBreakdown } from "./seasonal.js";

const sum = (/** @type {number[]} */ a) => a.reduce((x, y) => x + y, 0);

/**
 * 설치 가능 면적에 놓을 수 있는 최대 용량 [kWp].
 * @param {number} roofAreaM2
 * @param {number} areaPerKwpM2
 * @returns {number}
 */
export function maxCapacityKwp(roofAreaM2, areaPerKwpM2) {
  return roofAreaM2 / areaPerKwpM2;
}

/**
 * 용량에 필요한 면적 [m²].
 * @param {number} capacityKwp
 * @param {number} areaPerKwpM2
 * @returns {number}
 */
export function requiredAreaM2(capacityKwp, areaPerKwpM2) {
  return capacityKwp * areaPerKwpM2;
}

/**
 * @typedef {Object} GapResult
 * @property {number} maxCapacityKwp          설치 가능 면적에 놓을 수 있는 최대 용량
 * @property {number} usageYearKwh            연 사용량
 * @property {number[]} genMonthly            최대 용량 설계의 1년차 월별 발전량(1~12월)
 * @property {number} genYearKwh              최대 용량 설계의 1년차 연 발전량
 * @property {number} gapYearKwh              연 결손 = max(0, 연 사용량 − 연 발전량)
 * @property {number[]} gapMonthly            월별 결손 = max(0, 사용량 − 발전량)
 * @property {number[]} surplusMonthly        월별 초과 발전 = max(0, 발전량 − 사용량)
 * @property {number} coverage                연 사용량 중 발전이 채우는 몫(0~1, 넘으면 1로 자름)
 * @property {number} perKwpYearKwh           1 kWp의 1년차 연 발전량(방향·경사 보정 반영)
 * @property {number} fullCoverCapacityKwp    연 사용량을 연 합계로 100% 채우는 데 필요한 용량
 * @property {number} fullCoverAreaM2         그 용량에 필요한 면적
 * @property {number} currentCapacityKwp      지금 입력한 설치 용량
 * @property {number} currentAreaM2           지금 설치 용량에 필요한 면적
 * @property {boolean} currentFits            지금 설치 용량이 설치 가능 면적 안에 들어가는가
 */

/**
 * 에너지 결손 계산.
 * @param {Omit<import("./seasonal.js").MonthlyInput, "dayShare"> | import("./seasonal.js").MonthlyInput} input  월별 엔진 입력(용량은 지금 입력한 값)
 * @param {number} roofAreaM2
 * @param {number} areaPerKwpM2
 * @returns {GapResult}
 */
export function energyGap(input, roofAreaM2, areaPerKwpM2) {
  if (!(roofAreaM2 > 0) || !(areaPerKwpM2 > 0)) throw new RangeError(`면적은 0보다 커야 함: 설치 가능 면적 ${roofAreaM2}, kWp당 필요 면적 ${areaPerKwpM2}`);
  const genAt = (/** @type {number} */ cap) => monthlyBreakdown(/** @type {any} */ ({ ...input, capacityKwp: cap, dayShare: 0 }), 1).gen;
  const maxCap = maxCapacityKwp(roofAreaM2, areaPerKwpM2);
  const usage = input.monthlyUsageKwh;
  const usageYear = sum(usage);
  const genMonthly = genAt(maxCap);
  const genYear = sum(genMonthly);
  const perKwp = sum(genAt(1));
  const fullCap = perKwp > 0 ? usageYear / perKwp : Infinity;
  return {
    maxCapacityKwp: maxCap,
    usageYearKwh: usageYear,
    genMonthly,
    genYearKwh: genYear,
    gapYearKwh: Math.max(0, usageYear - genYear),
    gapMonthly: usage.map((u, i) => Math.max(0, u - genMonthly[i])),
    surplusMonthly: usage.map((u, i) => Math.max(0, genMonthly[i] - u)),
    coverage: usageYear > 0 ? Math.min(1, genYear / usageYear) : 0,
    perKwpYearKwh: perKwp,
    fullCoverCapacityKwp: fullCap,
    fullCoverAreaM2: requiredAreaM2(fullCap, areaPerKwpM2),
    currentCapacityKwp: input.capacityKwp,
    currentAreaM2: requiredAreaM2(input.capacityKwp, areaPerKwpM2),
    currentFits: requiredAreaM2(input.capacityKwp, areaPerKwpM2) <= roofAreaM2 * (1 + 1e-12),
  };
}
