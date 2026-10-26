// 화면 요소 만들기 도우미. textContent만 쓰므로 넣은 글자가 HTML로 해석되지 않는다.

/**
 * @param {string} tag
 * @param {Record<string, string>} [attrs]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, text = "") {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * SVG 요소 만들기(HTML의 el()과 같은 방식, textContent만 사용).
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @param {string} [text]
 * @returns {SVGElement}
 */
export function svgEl(tag, attrs = {}, text = "") {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text) node.textContent = text;
  return node;
}

/** 천 단위 구분 + 소수 자리 제한(표시용. 계산에는 쓰지 않는다) */
export function fmt(n, maxFractionDigits = 0) {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: maxFractionDigits });
}
