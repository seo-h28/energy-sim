// @ts-check
// 지상 태양광 연 발전량(spec 5.1). 단위: 용량 kWp, 발전량 kWh, 비율은 0~1.

/**
 * @typedef {Object} GenerationInput
 * @property {number} capacityKwp        설치 용량 [kWp]
 * @property {number} yieldKwhPerKwp     kWp당 연간 발전시간 [kWh/kWp/년]
 * @property {number} orientationFactor  방향 보정 [배, 0.8~1.0]
 * @property {number} lossRate           시스템 손실률 [0~1]
 * @property {number} degradationRate    연 효율저하율 [0~1/년]
 */

/**
 * y년차 연 발전량 [kWh].
 * 발전량(y) = 용량 × kWh/kWp × 방향 보정 × (1 − 손실) × (1 − 효율저하)^(y−1)
 * @param {GenerationInput} input
 * @param {number} year  1부터 시작하는 연차
 * @returns {number}
 */
export function annualGeneration(input, year) {
  if (!Number.isInteger(year) || year < 1) throw new RangeError(`year는 1 이상의 정수여야 함: ${year}`);
  const { capacityKwp, yieldKwhPerKwp, orientationFactor, lossRate, degradationRate } = input;
  return (
    capacityKwp *
    yieldKwhPerKwp *
    orientationFactor *
    (1 - lossRate) *
    Math.pow(1 - degradationRate, year - 1)
  );
}

/**
 * 1년차부터 years년차까지의 연 발전량 배열 [kWh]. 인덱스 0이 1년차.
 * @param {GenerationInput} input
 * @param {number} years
 * @returns {number[]}
 */
export function generationSeries(input, years) {
  return Array.from({ length: years }, (_, i) => annualGeneration(input, i + 1));
}
