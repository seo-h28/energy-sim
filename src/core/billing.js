// @ts-check
// 월별 요금표 계산(누진제·계절 단가, spec 5.7): 한 달 사용량(kWh)으로 그 달 전기요금(원)을 계산한다.
// 태양광의 절감 = 요금(사용량) − 요금(사용량 − 자가소비)  (자가소비만큼 한전에서 덜 사는 것으로 본다. 상계 정산 단위는 미확인)
//
// 한 달 요금 = (전력량요금 + 기후환경요금 + 연료비조정요금) × 단계별 합 + 기본요금(주택용은 사용량 단계에 따라 다름)) × (1 + 부가세율 + 기금률)
//  - 주택용(누진): 사용량이 단계 경계를 넘을 때마다 넘은 부분에 더 비싼 단가. 하계(7~8월)는 경계가 다르고,
//    하계와 동계(12~2월)에 1,000 kWh 초과분은 슈퍼유저 단가.
//  - 일반용·교육용(계절 단가): 달마다 계절 단가 하나(누진 없음). 기본요금(계약전력 기준)은 태양광으로 줄지 않는다고 보고 뺀다(가정).
// 요금표는 data/tariffs.json(한전 2024-07-01 시행 값, 현재 시행 여부 미확인)이다. 계산식은 단순화이며 실제 청구서의 끝전 처리와 10원 미만 절사 등은 반영하지 않는다.

/**
 * @typedef {Object} MonthBilling
 * @property {{ upTo: number, rate: number }[]} tiers  누적 사용량 구간별 단가(원/kWh, 전력량+기후환경+연료비조정). 마지막 upTo는 Infinity
 * @property {{ upTo: number, fee: number }[] | null} basic  사용량 단계별 기본요금(원). 없으면 null
 * @property {number} multiplier  1 + 부가세율 + 기금률
 */

/**
 * 한 달 요금 [원].
 * @param {MonthBilling} spec
 * @param {number} usageKwh  0 이상
 * @returns {number}
 */
export function billKrw(spec, usageKwh) {
  const u = Math.max(0, usageKwh);
  let energy = 0;
  let from = 0;
  for (const t of spec.tiers) {
    if (u <= from) break;
    energy += (Math.min(u, t.upTo) - from) * t.rate;
    from = t.upTo;
  }
  let basic = 0;
  if (spec.basic) {
    const tier = spec.basic.find((b) => u <= b.upTo) ?? spec.basic[spec.basic.length - 1];
    basic = tier.fee;
  }
  return (energy + basic) * spec.multiplier;
}

/**
 * 요금표 형식 검사(엔진 입력의 monthlyBilling). 문제가 없으면 빈 배열.
 * @param {any} billing
 * @returns {string[]}
 */
export function validateMonthlyBilling(billing) {
  if (!Array.isArray(billing) || billing.length !== 12) return ["monthlyBilling은 12개월 항목이어야 함"];
  const errors = [];
  billing.forEach((b, i) => {
    const where = `${i + 1}월 요금표`;
    if (!b || !Array.isArray(b.tiers) || b.tiers.length === 0) return void errors.push(`${where}: tiers가 없음`);
    let prev = 0;
    for (const t of b.tiers) {
      if (!(t.upTo > prev) || !(t.rate >= 0) || !Number.isFinite(t.rate)) errors.push(`${where}: 구간이 오름차순이 아니거나 단가가 0 이상 숫자가 아님`);
      prev = t.upTo;
    }
    if (b.tiers[b.tiers.length - 1].upTo !== Infinity) errors.push(`${where}: 마지막 구간의 상한은 Infinity여야 함`);
    if (b.basic !== null && !(Array.isArray(b.basic) && b.basic.length > 0 && b.basic.every((x) => x.upTo > 0 && x.fee >= 0))) errors.push(`${where}: basic이 올바르지 않음`);
    if (!(b.multiplier > 0)) errors.push(`${where}: multiplier는 0보다 커야 함`);
  });
  return errors;
}

/**
 * 요금제 하나를 12개월 요금표로 바꾼다.
 * @param {any} tariff  data/tariffs.json의 요금제 항목
 * @param {{ climateKrwPerKwh: number, fuelAdjustmentKrwPerKwh: number, vatRate: number, fundRate: number }} adders
 * @param {{ includeBasic?: boolean }} [options]  includeBasic: 주택용 기본요금(단계별)을 포함할지(기본 true)
 * @returns {MonthBilling[]}  1월부터 12월
 */
export function buildMonthlyBilling(tariff, adders, options = {}) {
  const includeBasic = options.includeBasic ?? true;
  const add = adders.climateKrwPerKwh + adders.fuelAdjustmentKrwPerKwh;
  const multiplier = 1 + adders.vatRate + adders.fundRate;
  /** @type {MonthBilling[]} */
  const out = [];
  for (let month = 1; month <= 12; month++) {
    if (tariff.kind === "seasonal") {
      const season = Object.keys(tariff.seasonMonths).find((s) => tariff.seasonMonths[s].includes(month));
      if (!season) throw new RangeError(`${tariff.id}: ${month}월이 어느 계절에도 없음`);
      out.push({ tiers: [{ upTo: Infinity, rate: tariff.seasonRatesKrwPerKwh[season] + add }], basic: null, multiplier });
      continue;
    }
    const limits = tariff.tierLimitsKwh;
    const isSummer = (limits.summer.months ?? []).includes(month);
    const lim = isSummer ? limits.summer : limits.other;
    const [r1, r2, r3] = tariff.tiers.map((/** @type {any} */ t) => t.energyKrwPerKwh + add);
    const superOn = tariff.superUser && (tariff.superUser.months ?? []).includes(month);
    /** @type {{ upTo: number, rate: number }[]} */
    const tiers = [{ upTo: lim.tier1Upto, rate: r1 }, { upTo: lim.tier2Upto, rate: r2 }];
    if (superOn) {
      tiers.push({ upTo: tariff.superUser.overKwh, rate: r3 }, { upTo: Infinity, rate: tariff.superUser.energyKrwPerKwh + add });
    } else {
      tiers.push({ upTo: Infinity, rate: r3 });
    }
    const basic = includeBasic
      ? [{ upTo: lim.tier1Upto, fee: tariff.tiers[0].basicKrwPerHousehold }, { upTo: lim.tier2Upto, fee: tariff.tiers[1].basicKrwPerHousehold }, { upTo: Infinity, fee: tariff.tiers[2].basicKrwPerHousehold }]
      : null;
    out.push({ tiers, basic, multiplier });
  }
  return out;
}

/**
 * 요금제를 월별 요금표로 바꿨을 때 화면에 보일 한 줄 설명.
 * @param {any} tariff
 * @param {{ includeBasic?: boolean }} [options]
 * @returns {string}
 */
export function describeBilling(tariff, options = {}) {
  if (tariff.kind === "seasonal") {
    return `${tariff.label}: 달마다 계절 단가(여름·봄가을·겨울)로 요금을 계산합니다. 누진 없음, 기본요금(계약전력 기준)은 태양광으로 줄지 않는다고 보고 뺐습니다(가정).`;
  }
  const lim = tariff.tierLimitsKwh;
  const basic = options.includeBasic ?? true;
  return (
    `${tariff.label}: 달마다 사용량으로 누진 요금을 계산합니다(기타계절 ${lim.other.tier1Upto}·${lim.other.tier2Upto} kWh, 하계 ${lim.summer.tier1Upto}·${lim.summer.tier2Upto} kWh 경계, ` +
    `하계·동계 ${tariff.superUser?.overKwh} kWh 초과분은 슈퍼유저 단가). ` +
    (basic ? "기본요금은 사용량 단계에 따라 달라지므로 자가소비로 단계가 내려가면 줄어듭니다(순사용량 기준 청구라는 가정, 상계 정산 단위는 미확인)." : "기본요금은 뺐습니다(가정).")
  );
}
