// @ts-check
// 화면의 입력값(가정 레지스트리 키) → 월별 엔진 입력 + 입력 검사. 결과 카드·그래프·민감도 분석이 같은 변환을 쓰도록 한 곳에 둔다.
import { toEngineInput } from "./params.js";
import { tiltProfile } from "./tilt.js";
import { validateMonthlyInput, validateDayShareRange } from "./seasonal.js";

/**
 * @param {Record<string, number | null | undefined>} values  입력값(snake_case 키)
 * @param {number[]} usage  월별 사용량 [kWh]
 * @param {import("./tilt.js").TiltTable} tiltTable
 * @param {number[]} fallbackRatios  경사각이 범위 밖이어서 표를 못 쓸 때 대신 두는 월 비율(이때 경사각 오류는 검사에서 따로 알려 줌)
 * @returns {{ input: any, dayShareLow: number, dayShareHigh: number, errors: string[] }}
 */
export function buildEngineInput(values, usage, tiltTable, fallbackRatios) {
  const tilt = tiltProfile(tiltTable, /** @type {number} */ (values.tilt_deg));
  const { input, dayShareLow, dayShareHigh } = toEngineInput(values, usage, tilt ? tilt.ratios : fallbackRatios, tilt ? tilt.annualFactor : 1);
  const errors = [...validateMonthlyInput(input), ...validateDayShareRange(dayShareLow, dayShareHigh)];
  return { input, dayShareLow, dayShareHigh, errors };
}
