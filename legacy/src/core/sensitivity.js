// @ts-check
// 민감도 분석(토네이도, spec 5.5): 기준 설계에서 가정을 하나씩 "줄일 때"와 "늘릴 때"로 바꿔 NPV와 회수기간이 얼마나 움직이는지 계산한다.
// 나머지 가정은 기준 그대로 두고 하나만 바꾼다. 변화 폭(늘릴 때 NPV − 줄일 때 NPV의 절댓값)이 큰 순서로 정렬한다.
//
// 바꾸는 범위는 확률이 아니라 "설정한 범위"다(근거 있는 분포가 없는 값이 많음). 상대 변수는 ±rel(기본 20%),
// 비율 변수는 절대 폭(효율저하 ±0.5%p, 요금 상승 ±2%p, 할인율 ±3%p, 추가 손실 ±5%p)이며 허용 범위를 넘지 않게 자른다.
// 연 발전량은 일사 자료 두 출처의 격차(≈10%), 방향 보정은 슬라이더 허용 범위 전체(0.8~1.0), 낮시간 비중은 이미 정해 둔 하한~상한,
// 경사각은 기준 ±10°(0~90°로 자름)를 쓴다.

import { summarizeMonthly } from "./seasonal.js";
import { LOW_GENERATION_FACTOR } from "./uncertainty.js";

/** 상대 변수(전기요금, 설치비, 월별 사용량)의 기본 변화 폭: ±20% */
export const DEFAULT_RELATIVE_RANGE = 0.2;
/** 연 발전량 변화 폭: 일사 자료 두 출처 격차(1 − NASA/ASOS ≈ 0.1007) */
export const GENERATION_RANGE = 1 - LOW_GENERATION_FACTOR;
/** 경사각 변화 폭 [도] */
export const TILT_RANGE_DEG = 10;
/** 비율 변수의 절대 변화 폭 */
export const RATE_RANGES = Object.freeze({ degradation_rate: 0.005, price_escalation_rate: 0.02, discount_rate: 0.03, loss_rate: 0.05 });
/** 방향 보정 슬라이더의 허용 범위(입력 패널과 같음) */
export const ORIENTATION_BOUNDS = Object.freeze({ min: 0.8, max: 1.0 });

/**
 * @typedef {Object} Variant
 * @property {Record<string, number>} set  덮어쓸 입력값(가정 레지스트리 키)
 * @property {number} usageScale           월별 사용량에 곱할 배수(1이면 그대로)
 * @property {string} text                 화면에 보일 설명 ("100 → 80")
 */

/**
 * @typedef {Object} VariantPair
 * @property {string} id
 * @property {string} label
 * @property {Variant} low   변수를 줄일 때(낮시간 비중은 하한)
 * @property {Variant} high  변수를 늘릴 때(낮시간 비중은 상한)
 */

const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(hi, Math.max(lo, v));
/** 유효숫자 4자리까지만 보이게(부동소수점 꼬리 제거). 만 단위 이상은 천 단위 쉼표를 붙인다 */
const num = (/** @type {number} */ v) => {
  const s = String(Number(v.toPrecision(4)));
  return /^-?\d{5,}$/.test(s) ? s.replace(/\B(?=(\d{3})+$)/g, ",") : s;
};
/** "기준 → 바꾼 값". 허용 범위 끝이라 값이 그대로면 그렇게 적는다 */
const change = (/** @type {string} */ from, /** @type {string} */ to) => (from === to ? `${from} (허용 범위 끝이라 그대로)` : `${from} → ${to}`);
const pct = (/** @type {number} */ v) => `${num(v * 100)}%`;

/**
 * 기준 입력에서 가정별 "줄일 때/늘릴 때" 값을 만든다.
 * @param {Record<string, number | null | undefined>} base  가정 레지스트리 값(snake_case 키)
 * @param {number} [rel]  상대 변수의 변화 폭(0~1)
 * @returns {VariantPair[]}
 */
export function buildVariants(base, rel = DEFAULT_RELATIVE_RANGE) {
  const b = (/** @type {string} */ id) => /** @type {number} */ (base[id]);
  /** 곱하기 변수: 값 × (1 ∓ f) */
  const scaled = (/** @type {string} */ id, /** @type {string} */ label, /** @type {number} */ f) => {
    const lo = b(id) * (1 - f);
    const hi = b(id) * (1 + f);
    return /** @type {VariantPair} */ ({
      id, label,
      low: { set: { [id]: lo }, usageScale: 1, text: `${num(b(id))} → ${num(lo)}` },
      high: { set: { [id]: hi }, usageScale: 1, text: `${num(b(id))} → ${num(hi)}` },
    });
  };
  /** 더하기 변수: 값 ∓ 폭, 허용 범위로 자름 */
  const shifted = (/** @type {string} */ id, /** @type {string} */ label, /** @type {number} */ d, /** @type {number} */ min, /** @type {number} */ max, /** @type {(v: number) => string} */ show) => {
    const lo = clamp(b(id) - d, min, max);
    const hi = clamp(b(id) + d, min, max);
    return /** @type {VariantPair} */ ({
      id, label,
      low: { set: { [id]: lo }, usageScale: 1, text: change(show(b(id)), show(lo)) },
      high: { set: { [id]: hi }, usageScale: 1, text: change(show(b(id)), show(hi)) },
    });
  };
  const dayLow = b("day_share_low");
  const dayHigh = b("day_share_high");
  /** @type {VariantPair[]} */
  const list = [
    // 월별 요금표(누진·계절)로 계산 중이면 단가 칸이 쓰이지 않으므로 요금표 전체의 배수(tariff_scale)를 바꾼다
    typeof base.tariff_scale === "number"
      ? /** @type {VariantPair} */ ({
          id: "tariff_scale", label: "전기요금 (요금표 전체)",
          low: { set: { tariff_scale: b("tariff_scale") * (1 - rel) }, usageScale: 1, text: `요금표 × ${num(b("tariff_scale") * (1 - rel))}` },
          high: { set: { tariff_scale: b("tariff_scale") * (1 + rel) }, usageScale: 1, text: `요금표 × ${num(b("tariff_scale") * (1 + rel))}` },
        })
      : scaled("electricity_price_krw_per_kwh", "전기요금 단가", rel),
    scaled("install_cost_krw_per_kwp", "kWp당 설치비", rel),
    scaled("yield_kwh_per_kwp", "연 발전량 (일사 자료 차이)", GENERATION_RANGE),
    {
      id: "usage", label: "월별 전기 사용량",
      low: { set: {}, usageScale: 1 - rel, text: `사용량 × ${num(1 - rel)}` },
      high: { set: {}, usageScale: 1 + rel, text: `사용량 × ${num(1 + rel)}` },
    },
    {
      id: "day_share", label: "낮시간 사용 비중",
      low: { set: { day_share_low: dayLow, day_share_high: dayLow }, usageScale: 1, text: `하한 ${pct(dayLow)}` },
      high: { set: { day_share_low: dayHigh, day_share_high: dayHigh }, usageScale: 1, text: `상한 ${pct(dayHigh)}` },
    },
    shifted("tilt_deg", "경사각", TILT_RANGE_DEG, 0, 90, (v) => `${num(v)}°`),
    {
      id: "orientation_factor", label: "방향 보정",
      low: { set: { orientation_factor: ORIENTATION_BOUNDS.min }, usageScale: 1, text: change(num(b("orientation_factor")), num(ORIENTATION_BOUNDS.min)) },
      high: { set: { orientation_factor: ORIENTATION_BOUNDS.max }, usageScale: 1, text: change(num(b("orientation_factor")), num(ORIENTATION_BOUNDS.max)) },
    },
    shifted("degradation_rate", "연 효율저하율", RATE_RANGES.degradation_rate, 0, 1, pct),
    shifted("price_escalation_rate", "전기요금 상승률", RATE_RANGES.price_escalation_rate, -0.99, Infinity, pct),
    shifted("discount_rate", "할인율", RATE_RANGES.discount_rate, 0, Infinity, pct),
    shifted("loss_rate", "추가 시스템 손실률", RATE_RANGES.loss_rate, 0, 1, pct),
  ];
  return list;
}

/**
 * @typedef {Object} Outcome
 * @property {string} text
 * @property {number} [npv]
 * @property {number | null} [payback]  null이면 분석 기간 안에 회수 불가
 * @property {string[]} [errors]
 */

/**
 * @typedef {Object} TornadoItem
 * @property {string} id
 * @property {string} label
 * @property {Outcome} low
 * @property {Outcome} high
 * @property {number} swing  |높을 때 NPV − 낮을 때 NPV| [원]. 계산할 수 없으면 NaN
 */

/**
 * 토네이도 계산.
 * @param {Record<string, number | null | undefined>} baseValues  기준 가정 값(snake_case 키)
 * @param {number[]} usage  기준 월별 사용량 [kWh]
 * @param {(values: Record<string, number | null | undefined>, usage: number[]) => { input: any, dayShareLow: number, dayShareHigh: number, errors: string[] }} toInput
 *        값 → 월별 엔진 입력(경사각·방향 보정 등 화면과 같은 변환) + 입력 검사 결과
 * @param {number} [rel]
 * @returns {{ base: { npv: number, payback: number | null }, items: TornadoItem[] } | { error: string[] }}
 */
export function tornado(baseValues, usage, toInput, rel = DEFAULT_RELATIVE_RANGE) {
  /** @returns {{ npv: number, payback: number | null } | { errors: string[] }} */
  const evaluate = (/** @type {Record<string, number | null | undefined>} */ values, /** @type {number[]} */ u) => {
    const r = toInput(values, u);
    if (r.errors.length) return { errors: r.errors };
    // 기준 값만 필요하므로 하한·상한까지 계산하는 summarizeRange 대신 가운데 값(기준)만 계산한다(화면의 기준 결과와 같은 값, 계산량 1/3)
    const { dayShare: _unused, ...withoutShare } = r.input;
    const s = summarizeMonthly({ ...withoutShare, dayShare: (r.dayShareLow + r.dayShareHigh) / 2 });
    return { npv: s.npvKrw, payback: s.paybackYears };
  };
  const base = evaluate(baseValues, usage);
  if ("errors" in base) return { error: base.errors };

  /** @type {TornadoItem[]} */
  const items = buildVariants(baseValues, rel).map((pair) => {
    const run = (/** @type {Variant} */ v) => {
      const res = evaluate({ ...baseValues, ...v.set }, usage.map((x) => x * v.usageScale));
      return /** @type {Outcome} */ ("errors" in res ? { text: v.text, errors: res.errors } : { text: v.text, npv: res.npv, payback: res.payback });
    };
    const low = run(pair.low);
    const high = run(pair.high);
    const swing = low.npv !== undefined && high.npv !== undefined ? Math.abs(high.npv - low.npv) : NaN;
    return { id: pair.id, label: pair.label, low, high, swing };
  });
  // 큰 순서. 계산할 수 없는 항목(NaN)은 맨 뒤. 같은 값이면 원래 순서 유지(안정 정렬)
  const order = items.map((it, i) => ({ it, i }));
  order.sort((a, b) => {
    const an = Number.isNaN(a.it.swing);
    const bn = Number.isNaN(b.it.swing);
    if (an !== bn) return an ? 1 : -1;
    if (an && bn) return a.i - b.i;
    return b.it.swing - a.it.swing || a.i - b.i;
  });
  return { base, items: order.map((o) => o.it) };
}
