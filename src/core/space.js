// @ts-check
// 우주 비교 사고실험(spec 5.3, 8차 C안). "SIMULATION · 사고실험 · 입력값은 가정".
// 원칙: 대규모로 만들어진 적 없는 기술(무선 송전, 우주 설비 제작·발사)의 비용과 효율은 "모르는 값"이므로 예측하지 않는다.
//  1) 물리 상수와 측정값으로 계산되는 부분(1 m²당 연 입사 에너지)만 계산하고,
//  2) 모르는 부분은 질문을 뒤집어 "지상과 같은 발전 단가가 되려면 설비 비용이 얼마 이하여야 하는가"(목표치)로 계산한다.
// 이 모듈은 우주 설비의 비용이나 사업성을 주장하지 않는다. 지상 쪽 기준은 우리 계산기의 LCOE(seasonal.js)다.

/** 물리 상수와 출처(2차 출처: Wikipedia가 인용한 IAU 결의문, 상태 reference). docs/sources.md "우주 비교 상수" 참고 */
export const SPACE_CONSTANTS = Object.freeze({
  /** 천문단위 [m]: IAU 2012 결의 B2에서 정의한 정확한 값 */
  astronomicalUnitM: 149_597_870_700,
  /** 태양 광도 공칭값 [W]: IAU 2015 결의 B3 */
  solarLuminosityW: 3.828e26,
  /** 1년의 시간 [h] (평년) */
  hoursPerYear: 8760,
  /** 정지궤도(GEO)의 태양까지 거리는 지구까지 거리(약 1 au)와 거의 같다고 본다 */
  distanceAu: 1,
});

/**
 * 정지궤도 식(지구 그림자)으로 잃는 햇빛의 최대 비율(계산값, 일조율 하한의 참고).
 * 출처 값: 식은 하루 최대 72분(NOAA GOES eclipse schedule), 춘분·추분 각각 약 45~48일(자료마다 다름, 큰 쪽 48일 사용).
 * 최대 손실 = 2회 × 48일 × 72분 ÷ (8760 h × 60) ≈ 1.3%. 실제 평균은 이보다 작다(하루 최대는 춘분 한가운데뿐).
 */
export const GEO_ECLIPSE_MAX_LOSS = (2 * 48 * 72) / (SPACE_CONSTANTS.hoursPerYear * 60);

/**
 * 태양 복사 플럭스 S = L / (4π r²) [W/m²]. 거리 제곱에 반비례한다.
 * @param {number} luminosityW
 * @param {number} distanceM
 * @returns {number}
 */
export function solarFlux(luminosityW, distanceM) {
  return luminosityW / (4 * Math.PI * distanceM * distanceM);
}

/** 1 au에서의 대기권 밖 태양 복사 플럭스 [W/m²] (약 1361). 지상 값이 아니다 */
export function solarFluxAtAu(distanceAu = SPACE_CONSTANTS.distanceAu) {
  return solarFlux(SPACE_CONSTANTS.solarLuminosityW, distanceAu * SPACE_CONSTANTS.astronomicalUnitM);
}

/**
 * 우주(정지궤도) 패널 1 m²가 1년에 받는 입사 에너지 [kWh/m²/년] = S × 8760 h × 일조율 ÷ 1000.
 * 일조율 1.0은 춘분·추분 무렵의 식(지구 그림자)을 무시한 단순화다.
 * @param {number} fluxWm2
 * @param {number} sunlightFraction  0~1
 * @returns {number}
 */
export function spaceAnnualIncident(fluxWm2, sunlightFraction) {
  return (fluxWm2 * SPACE_CONSTANTS.hoursPerYear * sunlightFraction) / 1000;
}

/**
 * @typedef {Object} TargetInput
 * @property {number} lcoeKrwPerKwh        지상 설계의 LCOE [원/kWh] (기준 단가)
 * @property {number} fluxWm2              태양 복사 플럭스 [W/m²]
 * @property {number} panelEfficiency      패널 효율 0~1
 * @property {number} sunlightFraction     일조율 0~1
 * @property {number} degradationRate      연 효율저하율 0~1
 * @property {number} discountRate         할인율
 * @property {number} years                분석 기간 [년]
 */

/**
 * 입력 검사. 문제가 없으면 빈 배열.
 * @param {TargetInput} t
 * @returns {string[]}
 */
export function validateTargetInput(t) {
  const errors = [];
  if (!(t.lcoeKrwPerKwh >= 0 && Number.isFinite(t.lcoeKrwPerKwh))) errors.push("lcoeKrwPerKwh: 기준 단가(LCOE)를 계산할 수 없음");
  if (!(t.fluxWm2 > 0)) errors.push("fluxWm2: 태양 복사 플럭스는 0보다 커야 함");
  if (!(t.panelEfficiency > 0 && t.panelEfficiency <= 1)) errors.push(`panelEfficiency: 패널 효율은 0 초과 1 이하 (받은 값 ${t.panelEfficiency})`);
  if (!(t.sunlightFraction > 0 && t.sunlightFraction <= 1)) errors.push(`sunlightFraction: 일조율은 0 초과 1 이하 (받은 값 ${t.sunlightFraction})`);
  if (!(t.degradationRate >= 0 && t.degradationRate <= 1)) errors.push(`degradationRate: 효율저하율은 0~1 (받은 값 ${t.degradationRate})`);
  if (!(t.discountRate > -0.99)) errors.push(`discountRate: 할인율은 -0.99 초과 (받은 값 ${t.discountRate})`);
  if (!(Number.isInteger(t.years) && t.years >= 1)) errors.push(`years: 분석 기간은 1 이상의 정수 (받은 값 ${t.years})`);
  return errors;
}

/**
 * 송전 효율 η_tx에 대한 1 m²당 연 도착량과 허용 설비 비용(목표치).
 *   E_d(η_tx) = S × 패널 효율 × 8760 h × 일조율 × η_tx ÷ 1000   [kWh/m²/년, 1년차]
 *   C_max(η_tx) = LCOE_지상 × Σ_{t=1..N} E_d × (1 − 효율저하)^(t−1) ÷ (1 + r)^t   [원/m²]
 * "곡선 아래의 비용으로 만들 수 있어야 지상과 같은 발전 단가"라는 조건이며 예측이 아니다.
 * 우주 쪽 유지비는 0으로 단순화했다(실제로는 허용 비용이 더 낮아짐).
 * @param {TargetInput} t
 * @param {number} etaTx  송전 효율 0~1
 * @returns {{ etaTx: number, deliveredKwhPerM2Year: number, maxCostKrwPerM2: number }}
 */
export function allowedCost(t, etaTx) {
  const errors = validateTargetInput(t);
  if (errors.length) throw new RangeError("우주 비교 입력 오류:\n" + errors.join("\n"));
  if (!(etaTx >= 0 && etaTx <= 1)) throw new RangeError(`송전 효율은 0~1 (받은 값 ${etaTx})`);
  const eD = (t.fluxWm2 * t.panelEfficiency * SPACE_CONSTANTS.hoursPerYear * t.sunlightFraction * etaTx) / 1000;
  let pv = 0;
  for (let y = 1; y <= t.years; y++) pv += (eD * Math.pow(1 - t.degradationRate, y - 1)) / Math.pow(1 + t.discountRate, y);
  return { etaTx, deliveredKwhPerM2Year: eD, maxCostKrwPerM2: t.lcoeKrwPerKwh * pv };
}

/**
 * 송전 효율 격자(0, step, …, 1)에서의 목표치 곡선.
 * @param {TargetInput} t
 * @param {number} [steps]  구간 수(기본 20 → 5% 간격)
 */
export function allowedCostCurve(t, steps = 20) {
  return Array.from({ length: steps + 1 }, (_, k) => allowedCost(t, k / steps));
}
