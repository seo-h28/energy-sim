// @ts-check
// 설계 공유 링크(spec S15): 화면 상태를 URL 조각(#s=...)으로 줄였다가 되살린다.
// 기본값과 다른 값만 담아 링크를 짧게 하고, 읽을 때는 숫자·형식을 모두 검사해서 이상한 링크가 화면을 깨지 않게 한다.
// 서버가 필요 없고 개인 정보가 들어가지 않는다(입력한 숫자만 들어 있으며 링크를 아는 사람은 누구나 읽을 수 있다).

export const SHARE_VERSION = 1;
export const SHARE_PREFIX = "#s=";
/** 이보다 긴 링크 조각은 읽지 않는다(잘못된 입력·악용 방지) */
export const MAX_ENCODED_LENGTH = 6000;
const MAX_TIER = 9;
const MAX_CURVE_KWP = 200;

/**
 * @typedef {Object} ShareState
 * @property {Record<string, number>} p                       기본값과 다른 입력칸 값(가정 레지스트리의 키: 값)
 * @property {number[]} [u]                                   월별 사용량 12개(예시가 아닐 때만)
 * @property {{ id: string, tier: number, c: number, f: number }} [t]  요금제 선택(id, 주택용 단계, 기후환경요금, 연료비조정요금)
 * @property {number} [m]                                     용량 곡선의 탐색 최대 용량(직접 지정했을 때만)
 */

/** @param {Uint8Array} bytes */
function toBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @param {string} text */
function fromBase64Url(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * 상태를 링크 조각(#s=...)으로 바꾼다. 담을 것이 하나도 없으면(모두 기본값) 빈 글자.
 * @param {ShareState} state
 * @returns {string}
 */
export function encodeShare(state) {
  const empty = Object.keys(state.p).length === 0 && !state.u && !state.t && state.m === undefined;
  if (empty) return "";
  /** @type {Record<string, any>} */
  const payload = { v: SHARE_VERSION, p: state.p };
  if (state.u) payload.u = state.u;
  if (state.t) payload.t = state.t;
  if (state.m !== undefined) payload.m = state.m;
  return SHARE_PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

const isNum = (/** @type {any} */ v) => typeof v === "number" && Number.isFinite(v);

/**
 * 링크 조각(#s=... 또는 s=... 뒤의 글자)을 읽어 상태로 되돌린다. 문제가 있으면 한글 이유를 돌려준다.
 * @param {string} hash  location.hash 전체("#s=...")
 * @param {string[]} knownParamIds  읽을 수 있는 입력칸 키 목록(모르는 키는 버림)
 * @returns {{ ok: true, state: ShareState, dropped: number } | { ok: false, error: string }}
 */
export function decodeShare(hash, knownParamIds) {
  if (!hash.startsWith(SHARE_PREFIX)) return { ok: false, error: "공유 링크 형식이 아닙니다." };
  const body = hash.slice(SHARE_PREFIX.length);
  if (body.length === 0 || body.length > MAX_ENCODED_LENGTH) return { ok: false, error: "공유 링크의 길이가 올바르지 않습니다." };
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(body)));
  } catch {
    return { ok: false, error: "공유 링크를 읽을 수 없습니다(손상되었거나 일부만 복사되었을 수 있음)." };
  }
  if (!data || typeof data !== "object" || data.v !== SHARE_VERSION) return { ok: false, error: "지원하지 않는 공유 링크 버전입니다." };
  if (!data.p || typeof data.p !== "object" || Array.isArray(data.p)) return { ok: false, error: "공유 링크에 입력값이 없습니다." };

  /** @type {Record<string, number>} */
  const p = {};
  let dropped = 0;
  for (const [id, v] of Object.entries(data.p)) {
    if (knownParamIds.includes(id) && isNum(v)) p[id] = /** @type {number} */ (v);
    else dropped++;
  }
  /** @type {ShareState} */
  const state = { p };
  if (data.u !== undefined) {
    if (!Array.isArray(data.u) || data.u.length !== 12 || !data.u.every((x) => isNum(x) && x >= 0)) return { ok: false, error: "공유 링크의 월별 사용량이 올바르지 않습니다." };
    state.u = data.u;
  }
  if (data.t !== undefined) {
    const t = data.t;
    if (!t || typeof t.id !== "string" || !Number.isInteger(t.tier) || t.tier < 0 || t.tier > MAX_TIER || !isNum(t.c) || t.c < 0 || !isNum(t.f) || t.f < 0) {
      return { ok: false, error: "공유 링크의 요금제 정보가 올바르지 않습니다." };
    }
    state.t = { id: t.id, tier: t.tier, c: t.c, f: t.f };
  }
  if (data.m !== undefined) {
    if (!isNum(data.m) || data.m <= 0 || data.m > MAX_CURVE_KWP) return { ok: false, error: "공유 링크의 탐색 범위가 올바르지 않습니다." };
    state.m = data.m;
  }
  return { ok: true, state, dropped };
}
