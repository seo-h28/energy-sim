// @ts-check
// 연도별 일사 다시 계산: 부산 ASOS 일사의 해마다 차이(data/annual_insolation_부산.json)를 연 발전량의 배수로 바꿔
// 같은 설계를 해마다 다시 계산한다. 확률 분포가 아니라 "과거 그 해의 일사였다면"의 결과이며 해 수가 적다(몇 개).
// 배수 = 그 해 일사 ÷ 사용한 해들의 평균 일사. 눈금(ASOS가 다른 자료보다 약 10% 높음)은 배수에서 상쇄된다.
// 한계: 해마다 일사계 눈금이 바뀐 경우도 날씨 차이로 섞여 들어간다(docs/data_audit.md).

import { summarizeMonthly } from "./seasonal.js";

/**
 * @typedef {Object} YearRow
 * @property {number} year
 * @property {number} ghiKwhM2
 * @property {boolean} used
 * @property {number} missingDaylightHours
 */

/**
 * 사용한 해들의 평균 대비 배수.
 * @param {YearRow[]} years
 * @returns {{ year: number, ghiKwhM2: number, factor: number }[]}  used인 해만, 연도 순
 */
export function yearFactors(years) {
  const used = years.filter((y) => y.used && y.ghiKwhM2 > 0);
  if (used.length === 0) return [];
  const mean = used.reduce((a, y) => a + y.ghiKwhM2, 0) / used.length;
  return used.map((y) => ({ year: y.year, ghiKwhM2: y.ghiKwhM2, factor: y.ghiKwhM2 / mean }));
}

/**
 * 해마다 연 발전량(kWp당)을 배수만큼 바꿔 NPV·회수기간을 계산한다.
 * @param {Record<string, number | null | undefined>} baseValues  가정 레지스트리 값(snake_case)
 * @param {number[]} usage
 * @param {(values: Record<string, number | null | undefined>, usage: number[]) => { input: any, dayShareLow: number, dayShareHigh: number, errors: string[] }} toInput
 * @param {YearRow[]} years
 * @returns {{ rows: { year: number, ghiKwhM2: number, factor: number, npv: number, payback: number | null }[], npvMin: number, npvMax: number, paybackFailCount: number } | { error: string[] }}
 */
export function yearReplay(baseValues, usage, toInput, years) {
  const factors = yearFactors(years);
  const baseYield = baseValues.yield_kwh_per_kwp;
  if (typeof baseYield !== "number" || !Number.isFinite(baseYield)) return { error: ["연 발전량 값이 없습니다"] };
  if (factors.length === 0) return { error: ["사용할 수 있는 연도 자료가 없습니다"] };
  const rows = [];
  for (const f of factors) {
    const r = toInput({ ...baseValues, yield_kwh_per_kwp: baseYield * f.factor }, usage);
    if (r.errors.length) return { error: r.errors };
    const { dayShare: _unused, ...rest } = r.input;
    const s = summarizeMonthly({ ...rest, dayShare: (r.dayShareLow + r.dayShareHigh) / 2 });
    rows.push({ ...f, npv: s.npvKrw, payback: s.paybackYears });
  }
  const npvs = rows.map((r) => r.npv);
  return { rows, npvMin: Math.min(...npvs), npvMax: Math.max(...npvs), paybackFailCount: rows.filter((r) => r.payback === null).length };
}
