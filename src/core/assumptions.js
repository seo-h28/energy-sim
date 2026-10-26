// @ts-check
// 가정 레지스트리(data/assumptions.json) 검사·조회. 브라우저와 Node 양쪽에서 쓴다.

/** @typedef {"sourced" | "reference" | "assumed" | "user"} Status */

/**
 * @typedef {Object} Param
 * @property {string} label   화면 표시 이름
 * @property {number | null} value  값(null이면 아직 미정)
 * @property {string} unit    단위
 * @property {Status} status  출처 상태
 * @property {string} source  출처 또는 가정 설명
 */

/** @typedef {{ meta?: object, params: Record<string, Param> }} Assumptions */

export const STATUSES = /** @type {const} */ (["sourced", "reference", "assumed", "user"]);

/** 화면 배지 글자(색만으로 구분하지 않기 위해 글자도 함께 쓴다) */
export const STATUS_LABELS = {
  sourced: "[Sourced] 출처 확인",
  reference: "[Reference] 참고값",
  assumed: "[Assumed] 임의 가정",
  user: "[User] 사용자 입력",
};

/**
 * 형식 검사. 문제가 없으면 빈 배열을 돌려준다.
 * @param {any} data
 * @returns {string[]} 오류 메시지 목록
 */
export function validateAssumptions(data) {
  const errors = [];
  if (!data || typeof data.params !== "object") return ["params 객체가 없음"];
  for (const [id, p] of Object.entries(data.params)) {
    if (!p || typeof p !== "object") {
      errors.push(`${id}: 항목이 객체가 아님`);
      continue;
    }
    if (typeof p.label !== "string" || !p.label) errors.push(`${id}: label 없음`);
    if (typeof p.unit !== "string" || !p.unit) errors.push(`${id}: unit 없음`);
    if (typeof p.source !== "string" || !p.source) errors.push(`${id}: source 없음`);
    if (!STATUSES.includes(p.status)) errors.push(`${id}: status가 ${STATUSES.join("/")} 중 하나가 아님`);
    if (p.value !== null && !Number.isFinite(p.value)) errors.push(`${id}: value가 숫자 또는 null이 아님`);
  }
  return errors;
}

/**
 * 브라우저에서 JSON을 불러와 검사한다. 형식 오류가 있으면 예외를 던진다.
 * @param {string} url
 * @returns {Promise<Assumptions>}
 */
export async function loadAssumptions(url = "data/assumptions.json") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 불러오기 실패 (HTTP ${res.status})`);
  const data = await res.json();
  const errors = validateAssumptions(data);
  if (errors.length) throw new Error("assumptions.json 형식 오류:\n" + errors.join("\n"));
  return data;
}
