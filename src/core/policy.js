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
 * @property {{ status: "unverified" | "verified", text: string }} amount
 * @property {{ status: "unverified" | "verified", text: string }} eligibility
 * @property {{ label: string, url: string }[]} sources
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
  { id: "apartment", label: "공동주택(아파트·빌라)" },
  { id: "building", label: "상가·사무 건물" },
  { id: "factory", label: "공장·창고" },
]);
export const INSTALL_KINDS = Object.freeze([
  { id: "rooftop", label: "옥상·지붕" },
  { id: "balcony", label: "베란다·발코니(소형)" },
  { id: "ground", label: "지상(마당·대지)" },
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
    if (!typeOk) reasons.push("건물 유형이 맞지 않음");
    if (!kindOk) reasons.push("설치 형태가 맞지 않음");
    if (regionOk && typeOk && kindOk) matches.push({ program, kind: "full", notes: [] });
    else if (regionOk && typeOk) matches.push({ program, kind: "partial", notes: ["지역·건물 유형은 맞지만 설치 형태가 사업의 설명과 다릅니다. 공고에서 대상 설비를 확인하세요."] });
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
