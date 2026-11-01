// @ts-check
// 한전 요금표(data/tariffs.json)에서 "자가소비로 아끼는 전기 1kWh의 단가"를 뽑는다(단일 단가 모드).
// 월 사용량에 따라 단계가 바뀌는 누진·계절 요금 계산은 billing.js(S13)가 한다. 이 파일은 "한 단가" 방식과 요금표 형식 검사를 맡는다. 단위: 원/kWh.

/**
 * @typedef {Object} Adders
 * @property {number} climateKrwPerKwh        기후환경요금 [원/kWh]
 * @property {number} fuelAdjustmentKrwPerKwh 연료비조정요금 [원/kWh]
 * @property {number} vatRate                 부가가치세율 [0~1]
 * @property {number} fundRate                전력산업기반기금률 [0~1]
 */

/**
 * @typedef {Object} Tariff
 * @property {string} id
 * @property {string} label
 * @property {"tiered" | "seasonal"} kind
 * @property {string} status
 * @property {string} source
 * @property {{ label: string, energyKrwPerKwh: number }[]} [tiers]                     tiered: 단계별 전력량요금
 * @property {Record<string, number>} [seasonRatesKrwPerKwh]                            seasonal: 계절별 전력량요금
 * @property {Record<string, number[]>} [seasonMonths]                                  seasonal: 계절별 해당 월
 */

const isNum = (/** @type {any} */ v) => typeof v === "number" && Number.isFinite(v);

/**
 * 형식 검사. 문제가 없으면 빈 배열.
 * @param {any} data
 * @returns {string[]}
 */
export function validateTariffs(data) {
  const errors = [];
  if (!data || !Array.isArray(data.tariffs) || !data.adders) return ["tariffs 배열 또는 adders가 없음"];
  for (const key of ["climateKrwPerKwh", "fuelAdjustmentKrwPerKwh", "vatRate", "fundRate"]) {
    if (!isNum(data.adders[key]?.value)) errors.push(`adders.${key}: value가 숫자가 아님`);
  }
  const ids = new Set();
  for (const t of data.tariffs) {
    if (!t?.id || ids.has(t.id)) errors.push(`요금제 id 없음 또는 중복: ${t?.id}`);
    ids.add(t?.id);
    if (!t?.label || !t?.source) errors.push(`${t?.id}: label 또는 source 없음`);
    if (t.kind === "tiered") {
      if (!Array.isArray(t.tiers) || t.tiers.length === 0 || !t.tiers.every((x) => isNum(x.energyKrwPerKwh) && x.energyKrwPerKwh >= 0)) {
        errors.push(`${t.id}: tiers가 올바르지 않음`);
      }
    } else if (t.kind === "seasonal") {
      const months = Object.values(t.seasonMonths ?? {}).flat().sort((a, b) => a - b);
      if (months.join() !== "1,2,3,4,5,6,7,8,9,10,11,12") errors.push(`${t.id}: seasonMonths가 1~12월을 한 번씩 덮지 않음`);
      for (const season of Object.keys(t.seasonMonths ?? {})) {
        if (!isNum(t.seasonRatesKrwPerKwh?.[season])) errors.push(`${t.id}: ${season} 계절 요금이 숫자가 아님`);
      }
    } else {
      errors.push(`${t.id}: kind는 tiered 또는 seasonal`);
    }
  }
  return errors;
}

/**
 * 전력량요금 [원/kWh]. tiered는 고른 단계의 단가, seasonal은 계절 단가를 개월 수로 가중평균한 값.
 * @param {Tariff} tariff
 * @param {number} [tierIndex]  tiered일 때 단계 번호(0부터)
 * @returns {number}
 */
export function energyRateKrwPerKwh(tariff, tierIndex = 0) {
  if (tariff.kind === "tiered") {
    const tier = tariff.tiers?.[tierIndex];
    if (!tier) throw new RangeError(`${tariff.id}: 없는 단계 ${tierIndex}`);
    return tier.energyKrwPerKwh;
  }
  const rates = /** @type {Record<string, number>} */ (tariff.seasonRatesKrwPerKwh);
  const months = /** @type {Record<string, number[]>} */ (tariff.seasonMonths);
  let weighted = 0;
  for (const [season, list] of Object.entries(months)) weighted += rates[season] * list.length;
  return weighted / 12;
}

/**
 * 자가소비로 아끼는 1kWh의 단가 [원/kWh] = (전력량요금 + 기후환경요금 + 연료비조정요금) × (1 + 부가세율 + 기금률).
 * 기본요금은 태양광을 달아도 줄지 않는다고 보고 뺀다(가정).
 * @param {Tariff} tariff
 * @param {Adders} adders
 * @param {number} [tierIndex]
 * @returns {number}
 */
export function effectivePriceKrwPerKwh(tariff, adders, tierIndex = 0) {
  const energy = energyRateKrwPerKwh(tariff, tierIndex);
  return (energy + adders.climateKrwPerKwh + adders.fuelAdjustmentKrwPerKwh) * (1 + adders.vatRate + adders.fundRate);
}

/**
 * 단가를 어떻게 구했는지 한 줄 설명(화면의 출처 칸에 쓴다).
 * @param {Tariff} tariff
 * @param {Adders} adders
 * @param {number} [tierIndex]
 * @returns {string}
 */
export function describePrice(tariff, adders, tierIndex = 0) {
  const energy = energyRateKrwPerKwh(tariff, tierIndex);
  const price = effectivePriceKrwPerKwh(tariff, adders, tierIndex);
  const n = (/** @type {number} */ x) => Number(x.toFixed(2)).toString();
  const what =
    tariff.kind === "tiered"
      ? `${tariff.label} ${tariff.tiers?.[tierIndex]?.label} 전력량요금 ${n(energy)}원`
      : `${tariff.label} 전력량요금(계절 단가를 개월 수로 가중평균) ${n(energy)}원`;
  return (
    `${what} + 기후환경요금 ${n(adders.climateKrwPerKwh)}원 + 연료비조정요금 ${n(adders.fuelAdjustmentKrwPerKwh)}원` +
    ` = ${n(energy + adders.climateKrwPerKwh + adders.fuelAdjustmentKrwPerKwh)}원, ` +
    `× ${Number((1 + adders.vatRate + adders.fundRate).toFixed(4))}(부가세 10%·기반기금 3.2%) = ${n(price)}원/kWh. ` +
    `한전 요금표 2024-07-01 시행 값(현재 시행 여부 미확인), 기본요금 제외, 월 사용량에 따른 단계 변화 미반영`
  );
}

/**
 * 브라우저에서 요금표 JSON을 불러와 검사한다. 형식 오류가 있으면 예외를 던진다.
 * @param {string} url
 * @returns {Promise<any>}
 */
export async function loadTariffs(url = "data/tariffs.json") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 불러오기 실패 (HTTP ${res.status})`);
  const data = await res.json();
  const errors = validateTariffs(data);
  if (errors.length) throw new Error("tariffs.json 형식 오류:\n" + errors.join("\n"));
  return data;
}
