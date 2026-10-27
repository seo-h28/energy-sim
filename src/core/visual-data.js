// @ts-check
// 그림에 쓰는 값 계산(화면 그리기와 분리해 테스트한다). 그림의 숫자는 계산기의 결과값을 그대로 옮기고, 새로 만든 숫자는 없다.
// 상수 출처(2차 출처, 상태 reference): 지구 적도 반지름 6,378.137 km(WGS-84), 정지궤도 반지름 42,164 km → 고도 35,786 km(docs/sources.md).

export const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
export const GEO_RADIUS_KM = 42164;

/** 쉬운 한국어 금액: 1,234,567원 */
const won = (/** @type {number} */ n) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const yearsText = (/** @type {number} */ y) => `${Number(y.toFixed(1))}년`;

/**
 * 결과를 한눈에 읽는 한 줄 요약(전문 용어 없이). 숫자는 모두 결과 카드와 같은 값이다.
 * @param {{ netInvestmentKrw: number, paybackYears: number | null, years: number, totalSavingKrw: number, firstYearSavingKrw: number }} r
 * @returns {{ headline: string, detail: string }}
 */
export function plainSummary(r) {
  const yearly = `1년에 약 ${won(r.firstYearSavingKrw)}씩 전기요금이 줄어드는 계산입니다(첫해 기준).`;
  if (r.paybackYears === null) {
    return {
      headline: `이 설계는 ${r.years}년 안에는 설치비 ${won(r.netInvestmentKrw)}을 되찾지 못합니다.`,
      detail: `${yearly} ${r.years}년 동안 줄어드는 전기요금 합계는 ${won(r.totalSavingKrw)}로, 설치비보다 ${won(r.netInvestmentKrw - r.totalSavingKrw)} 적습니다.`,
    };
  }
  const after = r.totalSavingKrw - r.netInvestmentKrw;
  return {
    headline: `설치비 ${won(r.netInvestmentKrw)}을 약 ${yearsText(r.paybackYears)} 뒤에 되찾는 계산입니다.`,
    detail: `${yearly} ${r.years}년 동안 줄어드는 전기요금 합계는 ${won(r.totalSavingKrw)}이고, 설치비를 빼면 ${won(after)}이 남습니다(물가·할인은 따로 보지 않은 단순 합).`,
  };
}

/**
 * 투자 회수 타임라인의 구간 비율.
 * @param {{ paybackYears: number | null, years: number }} r
 * @returns {{ recoverFraction: number, profitFraction: number, recovered: boolean }}
 *   recoverFraction: 투자금을 되찾는 구간(0년 ~ 회수 시점)이 전체 기간에서 차지하는 비율, profitFraction: 그 뒤 구간
 */
export function paybackTimeline(r) {
  if (r.paybackYears === null || !(r.years > 0)) return { recoverFraction: 1, profitFraction: 0, recovered: false };
  const f = Math.min(1, Math.max(0, r.paybackYears / r.years));
  return { recoverFraction: f, profitFraction: 1 - f, recovered: true };
}

/**
 * 정지궤도 그림의 축척(실제 비율). 지구 반지름과 궤도 반지름의 비를 그대로 쓴다.
 * @param {number} orbitPx  그림에서 궤도 반지름 [px]
 * @returns {{ earthPx: number, orbitPx: number, altitudeKm: number, orbitOverEarth: number, altitudeOverEarth: number }}
 */
export function orbitGeometry(orbitPx) {
  return {
    earthPx: (orbitPx * EARTH_EQUATORIAL_RADIUS_KM) / GEO_RADIUS_KM,
    orbitPx,
    altitudeKm: GEO_RADIUS_KM - EARTH_EQUATORIAL_RADIUS_KM,
    orbitOverEarth: GEO_RADIUS_KM / EARTH_EQUATORIAL_RADIUS_KM,
    altitudeOverEarth: (GEO_RADIUS_KM - EARTH_EQUATORIAL_RADIUS_KM) / EARTH_EQUATORIAL_RADIUS_KM,
  };
}

/**
 * 하루 햇빛 에너지 비교(연 값을 365일로 나눔).
 * @param {number} groundKwhM2Year
 * @param {number} spaceKwhM2Year
 * @returns {{ groundPerDay: number, spacePerDay: number, ratio: number }}
 */
export function dayCompare(groundKwhM2Year, spaceKwhM2Year) {
  return { groundPerDay: groundKwhM2Year / 365, spacePerDay: spaceKwhM2Year / 365, ratio: spaceKwhM2Year / groundKwhM2Year };
}

/**
 * 우주 패널 1 m²의 에너지 흐름: 입사 → 패널이 전기로 바꾼 몫 → 송전 후 지상에 도착한 몫.
 * @param {{ incidentKwhM2Year: number, panelEfficiency: number, etaTx: number }} p
 * @returns {{ label: string, kwh: number, fraction: number }[]}
 */
export function energyFlow(p) {
  const electric = p.incidentKwhM2Year * p.panelEfficiency;
  const delivered = electric * p.etaTx;
  return [
    { label: "패널에 닿는 햇빛", kwh: p.incidentKwhM2Year, fraction: 1 },
    { label: "패널이 전기로 바꾼 몫", kwh: electric, fraction: p.panelEfficiency },
    { label: "송전 후 지상에 도착", kwh: delivered, fraction: p.panelEfficiency * p.etaTx },
  ];
}

// ── 월별·계절 그림 ──

/**
 * 달(1~12)의 계절. 3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울(seasonal.js의 SEASONS와 같음).
 * @param {number} month
 * @returns {"spring" | "summer" | "autumn" | "winter"}
 */
export function seasonOfMonth(month) {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

/**
 * 월별 막대 높이(0~1): 12개월의 발전량·사용량 중 가장 큰 값을 1로 맞춘다. coverage는 그 달 사용량 중 태양광이 채운 몫(자가소비 ÷ 사용량).
 * @param {{ gen: number[], usage: number[], self: number[] }} d  각 길이 12
 * @returns {{ max: number, months: { month: number, season: string, genFraction: number, usageFraction: number, coverage: number }[] }}
 */
export function monthBars(d) {
  const max = Math.max(...d.gen, ...d.usage, 0);
  return {
    max,
    months: d.gen.map((g, i) => ({
      month: i + 1,
      season: seasonOfMonth(i + 1),
      genFraction: max > 0 ? g / max : 0,
      usageFraction: max > 0 ? d.usage[i] / max : 0,
      coverage: d.usage[i] > 0 ? d.self[i] / d.usage[i] : 0,
    })),
  };
}

/**
 * 계절 카드의 막대 비율(0~1): 4계절의 사용·발전 합 중 가장 큰 값을 1로.
 * @param {{ id: string, usageKwh: number, genKwh: number }[]} seasons
 * @returns {{ id: string, usageFraction: number, genFraction: number }[]}
 */
export function seasonBars(seasons) {
  const max = Math.max(...seasons.map((x) => Math.max(x.usageKwh, x.genKwh)), 0);
  return seasons.map((x) => ({ id: x.id, usageFraction: max > 0 ? x.usageKwh / max : 0, genFraction: max > 0 ? x.genKwh / max : 0 }));
}

/**
 * 월별 발전·사용을 쉬운 문장으로(전문 용어 없이). 숫자는 모두 계산값이다.
 * @param {{ gen: number[], usage: number[], self: number[], export: number[] }} d  각 길이 12(1~12월, 1년차)
 * @returns {string[]}
 */
export function seasonStory(d) {
  const k = (/** @type {number} */ n) => `${Math.round(n).toLocaleString("ko-KR")} kWh`;
  const idxMax = (/** @type {number[]} */ a) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);
  const idxMin = (/** @type {number[]} */ a) => a.reduce((b, v, i) => (v < a[b] ? i : b), 0);
  const out = [];
  const gMax = idxMax(d.gen);
  const gMin = idxMin(d.gen);
  out.push(`발전은 ${gMax + 1}월에 가장 많고(${k(d.gen[gMax])}) ${gMin + 1}월에 가장 적습니다(${k(d.gen[gMin])}).`);
  const uMax = idxMax(d.usage);
  out.push(`전기 사용은 ${uMax + 1}월에 가장 많습니다(${k(d.usage[uMax])}).`);
  const surplus = d.export.map((v, i) => (v > 1e-9 ? i + 1 : 0)).filter((m) => m > 0);
  out.push(
    surplus.length > 0
      ? `낮에 쓰는 전기보다 발전이 많아 한전으로 보내는 전기가 남는 달: ${surplus.join("·")}월.`
      : "모든 달에서 발전한 전기를 그 달에 다 쓰는 것으로 계산됩니다(남는 전기 없음).",
  );
  const cov = d.usage.map((u, i) => (u > 0 ? d.self[i] / u : 0));
  const cMax = idxMax(cov);
  const cMin = idxMin(cov);
  out.push(`태양광이 채우는 몫은 ${cMax + 1}월이 가장 크고(${Math.round(cov[cMax] * 100)}%) ${cMin + 1}월이 가장 작습니다(${Math.round(cov[cMin] * 100)}%).`);
  return out;
}

