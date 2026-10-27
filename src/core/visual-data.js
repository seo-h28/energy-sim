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
