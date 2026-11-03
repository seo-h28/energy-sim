// @ts-check
// 지원 정책 매칭: 내 지역·건물·설치 형태로 받을 수 있는 태양광 지원 사업 후보를 고른다(data/policies.json).
// 금액·자격 기준은 공고 원문을 확인하지 못한 값이라 데이터에 넣지 않았고(status "unverified"), 이 모듈은 사업의 "후보"만 고른다.
// 후보인지의 판단은 데이터에 적힌 지역·건물 유형·설치 형태 세 가지뿐이다(소득·용량·접수 시기 같은 자격은 판단하지 않음).

/**
 * @typedef {Object} Program
 * @property {string} id
 * @property {string} name
 * @property {string} agency
 * @property {"national" | "local"} level
 * @property {"subsidy" | "loan"} form
 * @property {string[]} regions        "all" 또는 지역 코드(busan 등)
 * @property {string[]} buildingTypes  detached | apartment | building | factory
 * @property {string[]} installKinds   rooftop | balcony | ground
 * @property {string} summary
 * @property {string[]} facts
 * @property {{ status: "unverified" | "reference" | "verified", text: string }} amount
 * @property {{ status: "unverified" | "verified", text: string }} eligibility
 * @property {{ label: string, url: string }[]} sources
 * @property {number} [basisYear]            금액·단가의 기준 연도(있으면 화면에 표시)
 * @property {string} [noticeNote]           공고 시기·변경 가능성 안내
 * @property {string[]} [steps]              신청 절차(순서대로)
 * @property {{ category: string, maxKw: number, krwPerKw: number, minKw?: number, capAtMax?: boolean, floorKrw?: number, ambiguous?: boolean }[]} [unitSupport]  용량 구간별 지원 단가표(원/kW). 값의 확인 정도는 amount.status를 따른다
 * @property {string} [unitSupportNote]
 * @property {number} [ratePct]   정률 지원 비율(0~1, 설치 단가 기준). 있으면 unitSupport 대신 쓴다
 * @property {number} [maxKw]     정률 사업의 지원 설비 상한 [kW]
 * @property {{ number: string, date: string }} [noticeRef]  근거 공고(공고번호·날짜)
 */

/**
 * @typedef {Object} Profile
 * @property {string} region        busan | other
 * @property {string} buildingType  detached | apartment | building | factory
 * @property {string} installKind   rooftop | balcony | ground
 */

export const REGIONS = Object.freeze([
  { id: "busan", label: "부산" },
  { id: "other", label: "그 밖의 지역" },
]);
export const BUILDING_TYPES = Object.freeze([
  { id: "detached", label: "단독주택" },
  { id: "apartment", label: "아파트·빌라" },
  { id: "building", label: "가게·사무실 건물" },
  { id: "factory", label: "공장·창고" },
]);
export const INSTALL_KINDS = Object.freeze([
  { id: "rooftop", label: "옥상·지붕" },
  { id: "balcony", label: "베란다·발코니(작은 것)" },
  { id: "ground", label: "마당·땅" },
]);

/** @param {any} data  policies.json */
export function validatePolicies(data) {
  /** @type {string[]} */
  const errors = [];
  if (!data || !Array.isArray(data.programs)) return ["programs 배열이 없습니다"];
  const ids = new Set();
  for (const p of data.programs) {
    if (!p.id || ids.has(p.id)) errors.push(`id가 없거나 겹칩니다: ${p.id}`);
    ids.add(p.id);
    for (const k of ["regions", "buildingTypes", "installKinds", "facts", "sources"]) if (!Array.isArray(p[k])) errors.push(`${p.id}: ${k}가 배열이 아닙니다`);
    if (!p.amount || !p.eligibility) errors.push(`${p.id}: amount·eligibility가 없습니다`);
    if (!Array.isArray(p.sources) || p.sources.length === 0) errors.push(`${p.id}: 출처 링크가 없습니다`);
  }
  return errors;
}

/**
 * @param {Profile} profile
 * @param {{ programs: Program[] }} data
 * @returns {{ matches: { program: Program, kind: "full" | "partial", notes: string[] }[], others: { program: Program, reasons: string[] }[] }}
 */
export function matchPolicies(profile, data) {
  /** @type {{ program: Program, kind: "full" | "partial", notes: string[] }[]} */
  const matches = [];
  /** @type {{ program: Program, reasons: string[] }[]} */
  const others = [];
  for (const program of data.programs) {
    const regionOk = program.regions.includes("all") || program.regions.includes(profile.region);
    const typeOk = program.buildingTypes.includes(profile.buildingType);
    const kindOk = program.installKinds.includes(profile.installKind);
    /** @type {string[]} */
    const reasons = [];
    if (!regionOk) reasons.push("지역이 맞지 않음");
    if (!typeOk) reasons.push("집(건물) 종류가 맞지 않음");
    if (!kindOk) reasons.push("다는 곳이 맞지 않음");
    if (regionOk && typeOk && kindOk) matches.push({ program, kind: "full", notes: [] });
    else if (regionOk && typeOk) matches.push({ program, kind: "partial", notes: ["지역과 집 종류는 맞지만, 다는 곳(옥상·베란다 등)이 이 사업의 설명과 다릅니다. 공고에서 어떤 설비가 대상인지 확인하세요."] });
    else others.push({ program, reasons });
  }
  // 전부 맞는 것 먼저, 같으면 전국 사업 → 지자체 순
  matches.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "full" ? -1 : 1) || (a.program.level === b.program.level ? 0 : a.program.level === "national" ? -1 : 1));
  return { matches, others };
}

/**
 * 정책 자료 파일을 불러온다.
 * @param {string} [url]
 * @returns {Promise<{ meta: any, programs: Program[] }>}
 */
export async function loadPolicies(url = "data/policies.json") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 불러오기 실패 (HTTP ${res.status})`);
  const data = await res.json();
  const errors = validatePolicies(data);
  if (errors.length) throw new Error("policies 형식 오류:\n" + errors.join("\n"));
  return data;
}

/**
 * 지원 기준으로 내 설계의 예상 지원액을 계산한다. 지원 기준이 없으면 null.
 * - 용량별 단가표(unitSupport): 용량 × 단가. 용량이 구간의 상한을 넘으면, 공고가 "기준 범위 안에서만 지급"이라고 밝힌 구간(capAtMax)은 상한 용량까지만
 *   계산하고, 그렇지 않으면 넘는 부분의 처리를 알 수 없어 추정액을 내지 않는다. 구간이 겹치거나 산정 방식이 표만으로는 불분명한 구간(ambiguous)도 추정하지 않는다.
 * - 정률(program.ratePct, 설치 단가의 일정 비율): 용량이 program.maxKw 이하일 때 비율 × 용량 × 설치 단가(입력 탭의 kWp당 설치비를 설치 단가로 가정).
 * - floorKrw가 있으면 그 단위 미만은 버린다(공고의 "만 원 미만 절사").
 * 결과는 지원 기준의 확인 정도(amount.status)를 따르는 계산이며, 선정·예산 소진·사업 평가에 따라 달라질 수 있어 확정 금액이 아니다.
 * @param {Program} program
 * @param {number} categoryIndex  unitSupport 안의 위치(정률 사업은 무시)
 * @param {number} capacityKwp    내 설계의 설치 용량 [kWp]
 * @param {number} [installCostKrwPerKwp]  kWp당 설치비(정률 사업의 설치 단가로 가정)
 * @returns {{ category: string, maxKw: number, krwPerKw: number, fits: boolean, estimateKrw: number | null, reason: string } | null}
 */
export function supportEstimate(program, categoryIndex, capacityKwp, installCostKrwPerKwp = NaN) {
  const floorTo = (/** @type {number} */ krw, /** @type {number | undefined} */ unit) => (unit ? Math.floor(krw / unit) * unit : Math.round(krw));
  if (program.ratePct !== undefined) {
    const max = program.maxKw ?? Infinity;
    const base = { category: `설치 단가의 ${Math.round(program.ratePct * 100)}%`, maxKw: max, krwPerKw: Number.isFinite(installCostKrwPerKwp) ? installCostKrwPerKwp * program.ratePct : NaN };
    if (!(Number.isFinite(capacityKwp) && capacityKwp > 0)) return { ...base, fits: false, estimateKrw: null, reason: "패널 크기가 0보다 커야 계산할 수 있습니다." };
    if (capacityKwp > max) return { ...base, fits: false, estimateKrw: null, reason: `패널 크기 ${capacityKwp} kWp가 이 사업에서 지원하는 최대 크기 ${max} kW를 넘어 받을 수 없습니다(미니 태양광은 500W 이하 1대).` };
    if (!(Number.isFinite(installCostKrwPerKwp) && installCostKrwPerKwp > 0)) return { ...base, fits: true, estimateKrw: null, reason: "설치비를 넣어야 계산할 수 있습니다." };
    return { ...base, fits: true, estimateKrw: floorTo(capacityKwp * installCostKrwPerKwp * program.ratePct, 1), reason: "" };
  }
  const u = program.unitSupport?.[categoryIndex];
  if (!u) return null;
  if (!(Number.isFinite(capacityKwp) && capacityKwp > 0)) return { ...u, fits: false, estimateKrw: null, reason: "패널 크기가 0보다 커야 계산할 수 있습니다." };
  if (u.minKw !== undefined && capacityKwp <= u.minKw) return { ...u, fits: false, estimateKrw: null, reason: `패널 크기 ${capacityKwp} kWp는 이 항목(${u.minKw} kW 넘는 구간)에 해당하지 않습니다. 더 작은 크기의 항목을 고르세요.` };
  if (u.ambiguous) return { ...u, fits: capacityKwp <= u.maxKw, estimateKrw: null, reason: "이 구간의 금액을 전체 용량에 적용하는지 넘는 부분에만 적용하는지 공고의 표만으로는 알 수 없어 계산하지 않습니다. 센터에 확인하세요." };
  if (capacityKwp > u.maxKw) {
    if (u.capAtMax) return { ...u, fits: true, estimateKrw: floorTo(u.maxKw * u.krwPerKw, u.floorKrw), reason: `패널이 ${u.maxKw} kW보다 크지만 보조금은 ${u.maxKw} kW 몫까지만 나와서 ${u.maxKw} kW로 계산했습니다(설비는 ${Number((u.maxKw * 1.1).toFixed(2))} kW까지 달 수 있음).` };
    return { ...u, fits: false, estimateKrw: null, reason: `패널 크기 ${capacityKwp} kWp가 이 항목의 최대 ${u.maxKw} kW를 넘습니다. 넘는 부분을 어떻게 하는지는 공고에서 확인하세요.` };
  }
  return { ...u, fits: true, estimateKrw: floorTo(capacityKwp * u.krwPerKw, u.floorKrw), reason: "" };
}
