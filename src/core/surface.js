// @ts-check
// 용량 × 경사각 NPV 곡면(3D 그래프용 계산): 설치 용량과 경사각을 격자로 바꿔 가며 같은 설계의 25년 NPV(기준)를 계산한다.
// 나머지 가정은 입력 그대로이고, 낮시간 비중은 하한·상한의 가운데 값(결과 카드의 "기준")을 쓴다. 방향 보정은 그대로 곱해진다.
// 점마다 월별 엔진(summarizeMonthly)을 한 번씩 부르므로 20 × 19 = 380점이 수 밀리초~수십 밀리초에 끝난다.

import { summarizeMonthly } from "./seasonal.js";

/**
 * @typedef {Object} SurfaceResult
 * @property {number[]} capacities  용량 격자 [kWp] (오름차순)
 * @property {number[]} tilts       경사각 격자 [도] (오름차순)
 * @property {number[][]} npv       npv[i][j] = 용량 capacities[i], 경사각 tilts[j]일 때의 NPV [원]
 * @property {{ capacityKwp: number, tiltDeg: number, npv: number }} best  NPV가 가장 큰 점
 */

/**
 * @param {Record<string, number | null | undefined>} baseValues  가정 레지스트리 값(snake_case)
 * @param {number[]} usage
 * @param {(values: Record<string, number | null | undefined>, usage: number[]) => { input: any, dayShareLow: number, dayShareHigh: number, errors: string[] }} toInput
 * @param {number[]} capacities
 * @param {number[]} tilts
 * @returns {SurfaceResult | { error: string[] }}
 */
export function npvSurface(baseValues, usage, toInput, capacities, tilts) {
  if (capacities.length === 0 || tilts.length === 0) return { error: ["격자가 비어 있습니다"] };
  /** @type {number[][]} */
  const npv = [];
  let best = { capacityKwp: capacities[0], tiltDeg: tilts[0], npv: -Infinity };
  for (const c of capacities) {
    /** @type {number[]} */
    const row = [];
    for (const t of tilts) {
      const r = toInput({ ...baseValues, capacity_kwp: c, tilt_deg: t }, usage);
      if (r.errors.length) return { error: r.errors };
      const { dayShare: _unused, ...rest } = r.input;
      const v = summarizeMonthly({ ...rest, dayShare: (r.dayShareLow + r.dayShareHigh) / 2 }).npvKrw;
      row.push(v);
      if (v > best.npv) best = { capacityKwp: c, tiltDeg: t, npv: v };
    }
    npv.push(row);
  }
  return { capacities, tilts, npv, best };
}

/**
 * 균등 격자 [min, max]를 n개 점(양 끝 포함)으로.
 * @param {number} min
 * @param {number} max
 * @param {number} n
 * @returns {number[]}
 */
export function linspace(min, max, n) {
  if (n < 2) return [min];
  return Array.from({ length: n }, (_, i) => Math.round((min + ((max - min) * i) / (n - 1)) * 1e9) / 1e9);
}
