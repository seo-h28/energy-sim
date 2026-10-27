// @ts-check
import { validateTiltTable } from "./tilt.js";

// 월별 데이터 파일 불러오기·검사: 월별 발전 비율(data/monthly_yield_부산.json)과 월별 사용량 예시(data/monthly_usage_example.json).

/**
 * 월별 발전 표 검사. 문제가 없으면 빈 배열.
 * @param {any} data
 * @returns {string[]}
 */
export function validateMonthlyYield(data) {
  const errors = [];
  const months = data?.months;
  if (!Array.isArray(months) || months.length !== 12) return ["months가 12개 항목이 아님"];
  months.forEach((m, i) => {
    if (m.month !== i + 1) errors.push(`${i + 1}번째 항목의 month가 ${m.month}`);
    if (!(m.ratio > 0)) errors.push(`${i + 1}월 ratio가 0보다 크지 않음`);
  });
  const sum = months.reduce((s, m) => s + m.ratio, 0);
  if (Math.abs(sum - 1) > 1e-6) errors.push(`ratio 합이 1이 아님: ${sum}`);
  if (!(data.meta?.annualKwhPerKwp > 0)) errors.push("meta.annualKwhPerKwp가 없음");
  return errors;
}

/**
 * 월별 사용량 파일 검사. 문제가 없으면 빈 배열.
 * @param {any} data
 * @returns {string[]}
 */
export function validateMonthlyUsage(data) {
  const u = data?.monthlyUsageKwh;
  if (!Array.isArray(u) || u.length !== 12 || !u.every((v) => Number.isFinite(v) && v >= 0)) return ["monthlyUsageKwh는 0 이상 숫자 12개여야 함"];
  if (!data.meta?.source || !data.meta?.status) return ["meta.source, meta.status가 없음"];
  return [];
}

/** @param {string} url */
async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 불러오기 실패 (HTTP ${res.status})`);
  return res.json();
}

/**
 * 경사각별 월별 발전량 표(PVGIS, data/monthly_yield_tilt_부산.json).
 * @param {string} [url]
 * @returns {Promise<{ table: import("./tilt.js").TiltTable, meta: any }>}
 */
export async function loadTiltTable(url = "data/monthly_yield_tilt_부산.json") {
  const data = await loadJson(url);
  const errors = validateTiltTable(data);
  if (errors.length) throw new Error("monthly_yield_tilt 형식 오류:\n" + errors.join("\n"));
  return { table: { tilts: data.tilts, annualKwhPerKwp: data.annualKwhPerKwp, months: data.months, poaKwhM2: data.poaKwhM2 }, meta: data.meta };
}

/**
 * 연도별 일사 합계(ASOS 부산, data/annual_insolation_부산.json).
 * @param {string} [url]
 * @returns {Promise<{ years: import("./year-replay.js").YearRow[], meta: any }>}
 */
export async function loadAnnualInsolation(url = "data/annual_insolation_부산.json") {
  const data = await loadJson(url);
  if (!Array.isArray(data?.years) || data.years.some((/** @type {any} */ y) => !Number.isFinite(y.year) || !Number.isFinite(y.ghiKwhM2) || typeof y.used !== "boolean")) throw new Error("annual_insolation 형식 오류");
  return { years: data.years, meta: data.meta };
}

/**
 * @param {string} [url]
 * @returns {Promise<{ usage: number[], meta: any }>}
 */
export async function loadMonthlyUsage(url = "data/monthly_usage_example.json") {
  const data = await loadJson(url);
  const errors = validateMonthlyUsage(data);
  if (errors.length) throw new Error("monthly_usage 형식 오류:\n" + errors.join("\n"));
  return { usage: data.monthlyUsageKwh, meta: data.meta };
}

/**
 * 붙여 넣은 글에서 월별 사용량 12개를 뽑는다(1월부터 12월 순서).
 * - 공백·줄바꿈·세미콜론으로 나눈 항목이 정확히 12개이면 항목 안의 쉼표는 천 단위 구분으로 보고 지운다("1,234" → 1234).
 * - 공백 없이 쉼표로만 이어진 한 덩어리("280,260,…")는 쉼표로 나눈다.
 * - 그 밖에(쉼표와 공백이 섞였는데 12개가 아님 등)는 잘못 읽을 위험이 있어 오류로 돌려준다.
 * @param {string} text
 * @returns {{ values: number[] } | { error: string }}
 */
export function parseUsageText(text) {
  const tokens = text.split(/[\s;]+/).filter(Boolean);
  /** @type {string[]} */
  let parts;
  if (tokens.length === 12) parts = tokens.map((t) => t.replace(/,/g, ""));
  else if (tokens.length === 1 && tokens[0].includes(",")) parts = tokens[0].split(",").filter(Boolean);
  else if (tokens.some((t) => t.includes(",")))
    return { error: `쉼표와 공백이 섞여 있고 항목이 12개가 아니라서 읽을 수 없습니다(공백으로 나눈 항목 ${tokens.length}개). 숫자 12개를 공백이나 쉼표 중 하나로만 구분해 주세요.` };
  else parts = tokens;
  if (parts.length !== 12) return { error: `숫자가 정확히 12개 필요합니다(받은 개수 ${parts.length}).` };
  const nums = parts.map(Number);
  if (!nums.every((v) => Number.isFinite(v) && v >= 0)) return { error: "0 이상의 숫자만 쓸 수 있습니다(문자나 음수가 섞여 있음)." };
  return { values: nums };
}
