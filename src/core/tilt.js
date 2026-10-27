// @ts-check
// 경사각에 따른 발전량 보정(spec 5.1d): PVGIS 표(data/monthly_yield_tilt_부산.json, 경사 0~90° 5° 간격, 정남향)에서
// 월별 발전 비율과 연 발전량의 상대 비율을 꺼낸다. 표의 칸 사이는 직선으로 이어 계산한다(그 값은 계산값이다).
//
// 연 발전량 입력(기본 1484.15 kWh/kWp)은 기준 경사각(35°)의 값이다. 다른 경사각에서는
//   연 발전량 = 입력 × annualFactor,  annualFactor = (그 경사각의 표 연 합계) ÷ (35°의 표 연 합계)
// 이고 월 분포는 그 경사각의 표 값이다. 35°에서는 annualFactor가 정확히 1이다.

/** 입력한 연 발전량이 가리키는 기준 경사각 [도] */
export const BASE_TILT_DEG = 35;

/**
 * @typedef {Object} TiltTable
 * @property {number[]} tilts            경사각 목록 [도], 0부터 90까지 오름차순
 * @property {number[]} annualKwhPerKwp  경사각별 연 발전량 [kWh/kWp]
 * @property {number[][]} months         경사각별 1~12월 발전량 [kWh/kWp/월]
 */

/**
 * 표 형식 검사. 문제가 없으면 빈 배열.
 * @param {any} data
 * @returns {string[]}
 */
export function validateTiltTable(data) {
  const { tilts, annualKwhPerKwp, months } = data ?? {};
  if (!Array.isArray(tilts) || tilts.length < 2) return ["tilts가 2개 이상의 목록이 아님"];
  if (!tilts.every((t, i) => Number.isFinite(t) && (i === 0 || t > tilts[i - 1]))) return ["tilts가 오름차순 숫자가 아님"];
  if (tilts[0] !== 0 || tilts[tilts.length - 1] !== 90) return ["tilts가 0°에서 90°까지 이어지지 않음"];
  if (!tilts.includes(BASE_TILT_DEG)) return [`tilts에 기준 경사각 ${BASE_TILT_DEG}°가 없음`];
  if (!Array.isArray(annualKwhPerKwp) || annualKwhPerKwp.length !== tilts.length) return ["annualKwhPerKwp의 길이가 tilts와 다름"];
  if (!Array.isArray(months) || months.length !== tilts.length) return ["months의 길이가 tilts와 다름"];
  const errors = [];
  months.forEach((row, i) => {
    if (!Array.isArray(row) || row.length !== 12 || !row.every((v) => Number.isFinite(v) && v > 0)) {
      errors.push(`경사 ${tilts[i]}°의 월별 값이 0보다 큰 숫자 12개가 아님`);
      return;
    }
    const sum = row.reduce((s, v) => s + v, 0);
    if (Math.abs(sum - annualKwhPerKwp[i]) > 0.1) errors.push(`경사 ${tilts[i]}°의 월 합계 ${sum.toFixed(2)}가 연 합계 ${annualKwhPerKwp[i]}와 다름`);
  });
  return errors;
}

/**
 * 한 경사각의 월별 발전량(kWh/kWp). 표의 칸 사이는 직선으로 잇는다.
 * @param {TiltTable} table
 * @param {number} tiltDeg  0~90
 * @returns {number[] | null}  범위 밖이거나 숫자가 아니면 null
 */
export function monthlyAtTilt(table, tiltDeg) {
  const { tilts, months } = table;
  if (!Number.isFinite(tiltDeg) || tiltDeg < tilts[0] || tiltDeg > tilts[tilts.length - 1]) return null;
  let hi = tilts.findIndex((t) => t >= tiltDeg);
  if (tilts[hi] === tiltDeg) return [...months[hi]];
  const lo = hi - 1;
  const w = (tiltDeg - tilts[lo]) / (tilts[hi] - tilts[lo]);
  return months[lo].map((v, m) => v + (months[hi][m] - v) * w);
}

/**
 * 경사각에 맞는 월별 발전 비율(합 1)과 연 발전량 보정 비율.
 * @param {TiltTable} table
 * @param {number} tiltDeg
 * @returns {{ ratios: number[], annualFactor: number, annualKwhPerKwp: number } | null}  경사각이 범위 밖이면 null
 */
export function tiltProfile(table, tiltDeg) {
  const m = monthlyAtTilt(table, tiltDeg);
  const base = monthlyAtTilt(table, BASE_TILT_DEG);
  if (!m || !base) return null;
  const sum = m.reduce((s, v) => s + v, 0);
  const baseSum = base.reduce((s, v) => s + v, 0);
  return { ratios: m.map((v) => v / sum), annualFactor: sum / baseSum, annualKwhPerKwp: sum };
}
