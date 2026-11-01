// @ts-check
// 설계안 비교(S7, spec 6-5): 지금 입력한 설계를 "설계안"으로 저장해 두고(최대 4개) 나란히 비교한다.
// 설계안 = 입력값 전체(가정 레지스트리 키: 값) + 월별 사용량 + 요금제 상태. 평가는 화면의 결과 카드와 같은 계산(buildEngineInput → summarizeRange)을 쓴다.
// 최고값 표시: NPV 최대, 회수기간 최단, LCOE 최저, 자급률 최고(같은 값이면 모두 표시, 모든 설계안이 같으면 표시하지 않음).

import { cumulativeFlows } from "./finance.js";
import { summarizeRange, lcoeKrwPerKwh } from "./seasonal.js";
import { buildEngineInput } from "./build-input.js";
import { buildMonthlyBilling } from "./billing.js";

export const MAX_DESIGNS = 4;
const MAX_NAME_LENGTH = 24;

/**
 * @typedef {{ id: string, tier: number, c: number, f: number, b?: 0 | 1, i?: 0 | 1 }} TariffState
 * @typedef {{ name: string, values: Record<string, number | null>, usage: number[], tariff: TariffState | null }} Design
 */

/**
 * 요금제 상태 → 12개월 요금표. 월별 요금표 방식(b === 1)이 아니거나 모르는 요금제면 null(한 단가).
 * @param {any} tariffData  data/tariffs.json
 * @param {TariffState | null} state
 * @returns {import("./billing.js").MonthBilling[] | null}
 */
export function billingFromTariffState(tariffData, state) {
  if (!state || state.b !== 1) return null;
  const tariff = tariffData.tariffs.find((/** @type {any} */ t) => t.id === state.id);
  if (!tariff) return null;
  const a = tariffData.adders;
  return buildMonthlyBilling(tariff, { climateKrwPerKwh: state.c, fuelAdjustmentKrwPerKwh: state.f, vatRate: a.vatRate.value, fundRate: a.fundRate.value }, { includeBasic: state.i !== 0 });
}

/**
 * @typedef {Object} EvalContext
 * @property {import("./tilt.js").TiltTable} tiltTable
 * @property {number[]} fallbackRatios
 * @property {any} tariffData
 */

/**
 * @typedef {Object} DesignResult
 * @property {boolean} ok
 * @property {string} name
 * @property {string[]} [errors]
 * @property {number} [capacityKwp]
 * @property {number} [tiltDeg]
 * @property {number} [netInvestmentKrw]
 * @property {number} [year1GenKwh]
 * @property {number} [selfConsumptionRate]
 * @property {number} [selfSufficiencyRate]
 * @property {number} [firstYearSavingKrw]
 * @property {number | null} [paybackYears]
 * @property {number} [npvKrw]
 * @property {number} [npvLow]
 * @property {number} [npvHigh]
 * @property {number | null} [lcoeKrwPerKwh]
 * @property {number[]} [cumulative]  연도별 누적 현금흐름(0년차부터)
 * @property {string} [tariffLabel]
 * @property {number} [requiredAreaM2]  이 설계 용량에 필요한 면적(설치 가능 면적 입력이 있을 때)
 * @property {number} [roofAreaM2]      설치 가능 면적
 * @property {boolean} [fitsArea]       필요 면적이 설치 가능 면적 안인가
 */

/**
 * 설계안 하나 평가. 입력이 잘못되면 { ok: false, errors }.
 * @param {Design} design
 * @param {EvalContext} ctx
 * @returns {DesignResult}
 */
export function evaluateDesign(design, ctx) {
  const billing = billingFromTariffState(ctx.tariffData, design.tariff);
  const built = buildEngineInput(design.values, design.usage, ctx.tiltTable, ctx.fallbackRatios, billing);
  if (built.errors.length) return { ok: false, name: design.name, errors: built.errors };
  const { dayShare: _unused, ...withoutShare } = built.input;
  const range = summarizeRange(withoutShare, built.dayShareLow, built.dayShareHigh);
  const b = range.base;
  const tariff = design.tariff ? ctx.tariffData.tariffs.find((/** @type {any} */ t) => t.id === design.tariff?.id) : null;
  return {
    ok: true,
    name: design.name,
    capacityKwp: built.input.capacityKwp,
    tiltDeg: /** @type {number} */ (design.values.tilt_deg),
    netInvestmentKrw: b.netInvestmentKrw,
    year1GenKwh: b.year1.gen.reduce((a, c) => a + c, 0),
    selfConsumptionRate: b.selfConsumptionRate,
    selfSufficiencyRate: b.selfSufficiencyRate,
    firstYearSavingKrw: b.firstYearSavingKrw,
    paybackYears: b.paybackYears,
    npvKrw: b.npvKrw,
    npvLow: range.low.npvKrw,
    npvHigh: range.high.npvKrw,
    lcoeKrwPerKwh: lcoeKrwPerKwh(withoutShare),
    cumulative: cumulativeFlows(b.flows),
    tariffLabel: tariff ? `${tariff.label}${billing ? " (월별 요금표)" : " (한 단가)"}` : "직접 입력(한 단가)",
    ...(built.input.roofAreaM2 > 0 && built.input.areaPerKwpM2 > 0
      ? { requiredAreaM2: built.input.capacityKwp * built.input.areaPerKwpM2, roofAreaM2: built.input.roofAreaM2, fitsArea: built.input.capacityKwp * built.input.areaPerKwpM2 <= built.input.roofAreaM2 * (1 + 1e-12) }
      : {}),
  };
}

/**
 * @typedef {Object} BestSets
 * @property {number[]} npv           NPV가 가장 큰 설계안의 번호들
 * @property {number[]} payback       회수기간이 가장 짧은 번호들(회수 불가는 가장 나쁨)
 * @property {number[]} lcoe          LCOE가 가장 낮은 번호들
 * @property {number[]} selfSufficiency  자급률이 가장 높은 번호들
 */

const SAME = 1e-9;
const same = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) <= SAME * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * 값 목록에서 가장 좋은 번호들(목록 안의 위치). 비교할 값이 2개 미만이거나 모두 같으면 빈 목록(표시할 차이가 없음).
 * @param {(number | null)[]} values
 * @param {"max" | "min"} mode
 * @param {boolean} nullIsWorst  true면 null(예: 회수 불가)을 가장 나쁜 값으로 비교에 포함, false면 null을 비교에서 뺌
 * @returns {number[]}
 */
export function bestIndices(values, mode, nullIsWorst) {
  const worst = mode === "min" ? Infinity : -Infinity;
  const entries = values.map((v, i) => ({ v: v === null ? worst : v, i, isNull: v === null })).filter((e) => nullIsWorst || !e.isNull);
  if (entries.length < 2) return [];
  const best = mode === "min" ? Math.min(...entries.map((e) => e.v)) : Math.max(...entries.map((e) => e.v));
  const isBest = (/** @type {{ v: number }} */ e) => e.v === best || (Number.isFinite(best) && Number.isFinite(e.v) && same(e.v, best));
  if (entries.every(isBest)) return [];
  return entries.filter(isBest).map((e) => e.i);
}

/**
 * 여러 설계안을 평가하고 항목별 최고값 번호를 구한다(입력 오류인 설계안은 비교에서 뺀다).
 * @param {Design[]} designs
 * @param {EvalContext} ctx
 * @returns {{ results: DesignResult[], best: BestSets }}
 */
export function compareDesigns(designs, ctx) {
  const results = designs.map((d) => evaluateDesign(d, ctx));
  const okIdx = results.map((r, i) => (r.ok ? i : -1)).filter((i) => i >= 0);
  const best = (/** @type {(r: DesignResult) => number | null | undefined} */ f, /** @type {"max" | "min"} */ mode, /** @type {boolean} */ nullIsWorst) =>
    bestIndices(okIdx.map((i) => f(results[i]) ?? null), mode, nullIsWorst).map((k) => okIdx[k]);
  return {
    results,
    best: {
      npv: best((r) => r.npvKrw, "max", false),
      payback: best((r) => r.paybackYears, "min", true),
      lcoe: best((r) => r.lcoeKrwPerKwh, "min", false),
      selfSufficiency: best((r) => r.selfSufficiencyRate, "max", false),
    },
  };
}

// ── 저장 데이터 검사(브라우저 저장소에서 읽은 값은 믿지 않고 검사한다) ──

const isNum = (/** @type {any} */ v) => typeof v === "number" && Number.isFinite(v);

/**
 * 저장소에서 읽은 설계안 목록을 검사해 쓸 수 있는 것만 돌려준다(형식이 틀린 항목은 버림, 최대 MAX_DESIGNS개).
 * @param {any} raw
 * @returns {Design[]}
 */
export function sanitizeDesigns(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {Design[]} */
  const out = [];
  for (const d of raw) {
    if (out.length >= MAX_DESIGNS) break;
    if (!d || typeof d !== "object" || typeof d.name !== "string") continue;
    if (!d.values || typeof d.values !== "object" || Array.isArray(d.values)) continue;
    if (!Object.values(d.values).every((v) => v === null || isNum(v))) continue;
    if (!Array.isArray(d.usage) || d.usage.length !== 12 || !d.usage.every((v) => isNum(v) && v >= 0)) continue;
    let tariff = null;
    if (d.tariff !== null && d.tariff !== undefined) {
      const t = d.tariff;
      const flag = (/** @type {any} */ v) => v === undefined || v === 0 || v === 1;
      if (!t || typeof t.id !== "string" || !Number.isInteger(t.tier) || t.tier < 0 || !isNum(t.c) || !isNum(t.f) || !flag(t.b) || !flag(t.i)) continue;
      tariff = { id: t.id, tier: t.tier, c: t.c, f: t.f, ...(t.b !== undefined ? { b: t.b } : {}), ...(t.i !== undefined ? { i: t.i } : {}) };
    }
    out.push({ name: d.name.slice(0, MAX_NAME_LENGTH), values: { ...d.values }, usage: [...d.usage], tariff });
  }
  return out;
}

/**
 * 설계안 이름 정리: 앞뒤 공백 제거, 길이 제한, 비어 있으면 기본 이름.
 * @param {string} name
 * @param {number} fallbackNumber
 * @returns {string}
 */
export function cleanName(name, fallbackNumber) {
  const t = String(name ?? "").trim().slice(0, MAX_NAME_LENGTH);
  return t || `설계 ${fallbackNumber}`;
}
