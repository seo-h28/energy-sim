// @ts-check
// 가정 레지스트리(snake_case 키)를 월별 엔진 입력(camelCase)으로 바꾼다.

/** JSON 키 → 엔진 입력 키. 여기 없는 키(예: area_per_kwp_m2)는 아직 재무 계산에 쓰지 않는다. */
export const PARAM_TO_INPUT = /** @type {const} */ ({
  capacity_kwp: "capacityKwp",
  yield_kwh_per_kwp: "yieldKwhPerKwp",
  orientation_factor: "orientationFactor",
  tilt_deg: "tiltDeg",
  loss_rate: "lossRate",
  degradation_rate: "degradationRate",
  install_cost_krw_per_kwp: "installCostKrwPerKwp",
  subsidy_krw: "subsidyKrw",
  electricity_price_krw_per_kwh: "electricityPriceKrwPerKwh",
  price_escalation_rate: "priceEscalationRate",
  day_share_low: "dayShareLow",
  day_share_high: "dayShareHigh",
  feed_in_price_krw_per_kwh: "feedInPriceKrwPerKwh",
  om_cost_krw_per_year: "omCostKrwPerYear",
  discount_rate: "discountRate",
  analysis_years: "analysisYears",
});

/**
 * 입력칸의 값(+ 월별 사용량·월 비율)을 월별 엔진 입력으로 바꾼다.
 * 비어 있거나 null인 값은 NaN으로 두어, 검사가 "받은 값 NaN"으로 알려 주게 한다.
 * 기준 입력의 낮시간 비중은 하한과 상한의 가운데(범위 안의 한 점)다.
 * @param {Record<string, number | null | undefined>} values
 * @param {number[]} monthlyUsageKwh  1~12월 사용량 [kWh]
 * @param {number[]} monthlyRatios    1~12월 발전 비율(합 1). 경사각을 쓰면 그 경사각의 비율(tilt.js)
 * @param {number} [tiltAnnualFactor]  경사각에 따른 연 발전량 보정 비율(tilt.js, 기준 경사각이면 1). 방향 보정에 곱해 넣는다
 * @returns {{ input: import("./seasonal.js").MonthlyInput, dayShareLow: number, dayShareHigh: number }}
 */
export function toEngineInput(values, monthlyUsageKwh, monthlyRatios, tiltAnnualFactor = 1) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [paramId, inputKey] of Object.entries(PARAM_TO_INPUT)) {
    const v = values[paramId];
    out[inputKey] = typeof v === "number" ? v : NaN;
  }
  const { dayShareLow, dayShareHigh, ...rest } = out;
  const input = /** @type {any} */ ({
    ...rest,
    orientationFactor: rest.orientationFactor * tiltAnnualFactor, // 방향 보정 × 경사각 보정(하나의 곱셈 계수로 엔진에 전달)
    userOrientationFactor: rest.orientationFactor, // 화면의 계산 과정 보기용(엔진은 쓰지 않음)
    tiltAnnualFactor,
    monthlyUsageKwh,
    monthlyRatios,
    dayShare: (dayShareLow + dayShareHigh) / 2,
  });
  return { input, dayShareLow, dayShareHigh };
}

/**
 * 가정 레지스트리에서 현재 값만 뽑는다.
 * @param {import("./assumptions.js").Assumptions} data
 * @returns {Record<string, number | null>}
 */
export function valuesFromAssumptions(data) {
  return Object.fromEntries(Object.entries(data.params).map(([id, p]) => [id, p.value]));
}
