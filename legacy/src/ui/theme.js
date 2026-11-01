// 색의 한 곳 관리: 그래프(Chart.js 캔버스)는 CSS 변수를 직접 못 쓰므로, 시작할 때 styles.css의 --c-* 변수를 읽어서 쓴다.
// 이렇게 하면 색을 바꿀 때 styles.css만 고치면 화면과 그래프가 함께 바뀐다.

/**
 * @typedef {Object} Theme
 * @property {string} primary    주 강조색(번트 오렌지, 돈·현금흐름)
 * @property {string} secondary  보조 강조색(골드, 발전량)
 * @property {string} teal       에너지를 직접 쓰는 몫(청록, 자가소비·자급)
 * @property {string} neutral    "나머지"를 나타내는 따뜻한 회색
 * @property {string} dark       진한 글자·0선 색
 * @property {string} brown      점선 등 보조 선 색(진한 황갈색)
 * @property {string} grid       그래프 격자 색
 * @property {string} text       그래프 글자 색
 * @property {string} panel      그래프 바탕 색
 */

/** @returns {Theme} */
export function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const get = (/** @type {string} */ name, /** @type {string} */ fallback) => cs.getPropertyValue(name).trim() || fallback;
  return {
    primary: get("--c-primary", "#d9660b"),
    secondary: get("--c-secondary", "#f2b01e"),
    teal: get("--c-teal", "#0f766e"),
    neutral: get("--c-neutral", "#b5afa3"),
    dark: get("--c-dark", "#2a2723"),
    brown: get("--c-brown", "#8b5e1a"),
    grid: get("--c-grid", "#e1dccf"),
    text: get("--c-chart-text", "#58524a"),
    panel: get("--c-panel", "#ffffff"),
  };
}

/**
 * #rrggbb 색에 투명도를 붙여 rgba(...)로 만든다(그라데이션 채우기용).
 * @param {string} hex
 * @param {number} alpha  0~1
 * @returns {string}
 */
export function withAlpha(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
