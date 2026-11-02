// @ts-check
// 방위각 보정: PVGIS가 계산한 방위각별 연 발전량(data/aspect_factor_부산.json)에서, 같은 경사각의 정남향 대비 비율을 구한다.
// 비율 표를 경사각(10° 간격)과 방위각(30° 간격) 두 방향으로 직선 보간한다. 0°(눕힘)은 방위가 의미 없어 비율 1이다.
// 한계: 연 발전량의 비율만 바꾸며, 월별 분포는 정남향 기준 그대로 쓴다(방위에 따른 월 분포 변화는 반영하지 않음).

/**
 * @typedef {Object} AspectTable
 * @property {number[]} tilts    경사각 [도], 오름차순
 * @property {number[]} aspects  방위각 [도], 오름차순(0 = 정남향, +서, −동)
 * @property {number[][]} ratio  ratio[i][j] = 경사각 tilts[i], 방위각 aspects[j]의 연 발전량 ÷ 같은 경사각 정남향 연 발전량
 */

export const ASPECT_MIN = -90;
export const ASPECT_MAX = 90;

/**
 * @param {number[]} grid  오름차순 격자
 * @param {number} v
 * @returns {{ lo: number, hi: number, w: number } | null}  v가 격자 밖이면 null
 */
function bracket(grid, v) {
  if (!Number.isFinite(v) || v < grid[0] || v > grid[grid.length - 1]) return null;
  const hi = grid.findIndex((g) => g >= v);
  if (grid[hi] === v) return { lo: hi, hi, w: 0 };
  const lo = hi - 1;
  return { lo, hi, w: (v - grid[lo]) / (grid[hi] - grid[lo]) };
}

/**
 * 경사각·방위각에서 정남향 대비 연 발전량 비율.
 * @param {AspectTable} table
 * @param {number} tiltDeg
 * @param {number} aspectDeg  0 = 정남향, +서, −동
 * @returns {number | null}  범위 밖(경사각 0~90, 방위각 −90~90)이면 null
 */
export function aspectFactor(table, tiltDeg, aspectDeg) {
  const t = bracket(table.tilts, tiltDeg);
  const a = bracket(table.aspects, aspectDeg);
  if (!t || !a) return null;
  const at = (/** @type {number} */ i, /** @type {number} */ j) => table.ratio[i][j];
  const row = (/** @type {number} */ i) => at(i, a.lo) + (at(i, a.hi) - at(i, a.lo)) * a.w;
  return row(t.lo) + (row(t.hi) - row(t.lo)) * t.w;
}

/**
 * 파일 형식 검사. 문제가 없으면 빈 배열.
 * @param {any} data
 * @returns {string[]}
 */
export function validateAspectTable(data) {
  /** @type {string[]} */
  const errors = [];
  if (!data || !Array.isArray(data.tilts) || !Array.isArray(data.aspects) || !Array.isArray(data.ratio)) return ["tilts·aspects·ratio가 없습니다"];
  if (data.ratio.length !== data.tilts.length) errors.push("ratio 줄 수가 경사각 수와 다릅니다");
  for (const row of data.ratio) {
    if (!Array.isArray(row) || row.length !== data.aspects.length) errors.push("ratio 칸 수가 방위각 수와 다릅니다");
    else if (row.some((v) => !(v > 0 && v <= 1.5))) errors.push("ratio에 이상한 값이 있습니다");
  }
  const south = data.aspects.indexOf(0);
  if (south < 0) errors.push("방위각 0(정남향)이 없습니다");
  else if (data.ratio.some((/** @type {number[]} */ r) => Math.abs(r[south] - 1) > 1e-9)) errors.push("정남향의 비율은 1이어야 합니다");
  return errors;
}
