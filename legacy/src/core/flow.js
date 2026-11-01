// @ts-check
// 개념도(SVG)에 쓰는 값: 패널 칸 수와 1년차 에너지 흐름(월별 엔진의 결과를 합친 값). 화면 코드와 분리해서 테스트할 수 있게 둔다.

/** 그림 눈금: 패널 한 칸이 나타내는 용량 [kWp]. 실제 패널 1장의 출력이 아니라 그림을 그리기 위한 눈금이다. */
export const KWP_PER_SLOT = 0.5;
/** 그림에 그릴 수 있는 최대 칸 수 (6 kWp 이상은 모두 12칸으로 그린다) */
export const MAX_SLOTS = 12;

/**
 * 켜 둘 패널 칸 수. 용량에 비례하고, 0보다 크면 최소 1칸.
 * @param {number} capacityKwp
 * @returns {number}
 */
export function panelsOn(capacityKwp) {
  if (!(capacityKwp > 0)) return 0;
  return Math.min(MAX_SLOTS, Math.max(1, Math.round(capacityKwp / KWP_PER_SLOT)));
}

/**
 * 월별 내역(1년차)의 연 합계: 발전, 자가소비, 잉여 [kWh]. 자가소비 + 잉여 = 발전량.
 * @param {{ gen: number[], self: number[], export: number[] }} year1
 * @returns {{ genKwh: number, selfKwh: number, exportKwh: number }}
 */
export function flowTotals(year1) {
  const sum = (/** @type {number[]} */ a) => a.reduce((x, y) => x + y, 0);
  return { genKwh: sum(year1.gen), selfKwh: sum(year1.self), exportKwh: sum(year1.export) };
}
