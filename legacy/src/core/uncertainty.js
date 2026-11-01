// @ts-check
// 일사 자료 출처 간 격차를 "데이터 불확실성 범위"로 바꾼다.
// 근거(docs/data_audit.md, docs/sources.md): 같은 해(2024) 부산 수평면 연 일사가 ASOS 1609 kWh/m², NASA POWER 약 1447 kWh/m².
// 어느 쪽이 맞는지는 아직 모른다. 그래서 입력한 발전량을 기준으로 두고, NASA 수준이면 발전량이 이 비율만큼 낮아진다고 가정한 경우를 함께 계산한다.

export const SOURCE_GAP = Object.freeze({
  asosKwhM2: 1609,
  nasaKwhM2: 1447,
  year: 2024,
});

/** NASA 값이 ASOS 값의 몇 배인가 (약 0.899). 발전량은 일사에 비례한다고 보는 단순화 */
export const LOW_GENERATION_FACTOR = SOURCE_GAP.nasaKwhM2 / SOURCE_GAP.asosKwhM2;

/** ASOS가 NASA보다 몇 % 높은가 (약 11.2%) */
export const ASOS_OVER_NASA = SOURCE_GAP.asosKwhM2 / SOURCE_GAP.nasaKwhM2 - 1;

/**
 * 발전량을 NASA 수준으로 낮춘 입력.
 * @template {{ yieldKwhPerKwp: number }} T
 * @param {T} input
 * @returns {T}
 */
export function lowGenerationInput(input) {
  return { ...input, yieldKwhPerKwp: input.yieldKwhPerKwp * LOW_GENERATION_FACTOR };
}
