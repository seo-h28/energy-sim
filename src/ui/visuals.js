// 쉬운 그림들(SVG·HTML, 외부 이미지 없음): 결과 한 줄 요약과 투자 회수 타임라인, 처음 보는 사람을 위한 용어 그림,
// 우주 비교의 실제 비율 궤도 그림·하루 햇빛 비교·에너지 흐름. 숫자는 계산기의 결과값을 그대로 옮기며(core/visual-data.js), 그림의 색·모양은 보조다.
import { dayCompare, energyFlow, orbitGeometry, paybackTimeline, plainSummary } from "../core/visual-data.js";
import { el, fmt, svgEl } from "./dom.js";

/** 번호 표시(원 안의 숫자) */
function marker(/** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ n) {
  const g = svgEl("g", { class: "vis-marker" });
  g.append(svgEl("circle", { cx, cy, r: 15 }), svgEl("text", { x: cx, y: cy + 6, "text-anchor": "middle" }, String(n)));
  return g;
}

// ── 개요: 결과 한 줄 요약 + 투자 회수 타임라인 ──

/**
 * @param {HTMLElement} container
 * @param {{ netInvestmentKrw: number, paybackYears: number | null, years: number, totalSavingKrw: number, firstYearSavingKrw: number }} r
 */
export function renderStory(container, r) {
  const s = plainSummary(r);
  const t = paybackTimeline(r);
  const bar = el("div", { class: "vis-tl-bar", role: "img", "aria-label": t.recovered ? `분석 기간 ${r.years}년 중 처음 ${fmt(r.paybackYears ?? 0, 1)}년은 설치비를 되찾는 구간, 그 뒤는 남는 구간` : `분석 기간 ${r.years}년 안에 설치비를 되찾지 못함` });
  const recover = el("div", { class: "vis-tl-recover" }, t.recovered ? "설치비를 되찾는 중" : "설치비를 되찾지 못함");
  recover.style.flexGrow = String(Math.max(t.recoverFraction, 0.0001));
  bar.append(recover);
  if (t.recovered && t.profitFraction > 0) {
    const profit = el("div", { class: "vis-tl-profit" }, "되찾은 뒤: 남는 구간");
    profit.style.flexGrow = String(t.profitFraction);
    bar.append(profit);
  }
  const wrap = el("div", { class: "vis-tl" });
  wrap.append(bar);
  if (t.recovered) {
    const pin = el("div", { class: "vis-tl-pin" }, `${fmt(r.paybackYears ?? 0, 1)}년`);
    pin.style.left = `${t.recoverFraction * 100}%`;
    wrap.append(pin);
  }
  const scale = el("div", { class: "vis-tl-scale" });
  scale.append(el("span", {}, "설치(0년)"), el("span", {}, `${r.years}년 후`));
  wrap.append(scale);
  container.replaceChildren(el("p", { class: "vis-headline" }, s.headline), el("p", { class: "vis-detail" }, s.detail), wrap);
  container.hidden = false;
}

// ── 처음 보는 사람을 위한 용어 그림 ──

/** 카드 하나: 제목 + 그림 + 설명 */
function card(/** @type {string} */ title, /** @type {SVGElement} */ svg, /** @type {string[]} */ lines) {
  const c = el("div", { class: "vis-card" });
  c.append(el("h3", { class: "vis-card-title" }, title), svg);
  for (const l of lines) c.append(el("p", { class: "vis-card-text" }, l));
  return c;
}

function cellsSvg() {
  // 태양전지 한 장 → 패널(여러 장을 붙인 판) → 설비(패널 여러 장 + 인버터 + 계량기)
  const svg = svgEl("svg", { viewBox: "0 0 360 150", class: "vis-svg", role: "img", "aria-label": "태양전지 한 조각, 그것을 붙인 패널, 패널과 인버터·계량기를 갖춘 설비" });
  svg.append(svgEl("rect", { x: 14, y: 50, width: 34, height: 34, rx: 3, class: "vis-cell" }));
  svg.append(svgEl("text", { x: 31, y: 112, "text-anchor": "middle", class: "vis-cap" }, "태양전지"));
  svg.append(svgEl("text", { x: 31, y: 130, "text-anchor": "middle", class: "vis-cap-sub" }, "빛을 전기로"));
  svg.append(svgEl("path", { d: "M 58 67 L 84 67", class: "vis-arrow" }), svgEl("path", { d: "M 80 62 L 88 67 L 80 72", class: "vis-arrow" }));
  const panel = svgEl("g");
  panel.append(svgEl("rect", { x: 96, y: 36, width: 92, height: 62, rx: 4, class: "vis-panel-frame" }));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) panel.append(svgEl("rect", { x: 101 + c * 17.2, y: 41 + r * 18.4, width: 14.4, height: 15.6, rx: 1.5, class: "vis-cell" }));
  svg.append(panel);
  svg.append(svgEl("text", { x: 142, y: 112, "text-anchor": "middle", class: "vis-cap" }, "패널"));
  svg.append(svgEl("text", { x: 142, y: 130, "text-anchor": "middle", class: "vis-cap-sub" }, "전지를 붙인 판"));
  svg.append(svgEl("path", { d: "M 196 67 L 222 67", class: "vis-arrow" }), svgEl("path", { d: "M 218 62 L 226 67 L 218 72", class: "vis-arrow" }));
  // 설비: 패널 2장 + 인버터 + 계량기
  const sys = svgEl("g");
  sys.append(svgEl("rect", { x: 234, y: 30, width: 46, height: 30, rx: 3, class: "vis-panel-frame" }), svgEl("rect", { x: 284, y: 30, width: 46, height: 30, rx: 3, class: "vis-panel-frame" }));
  sys.append(svgEl("path", { d: "M 257 60 L 257 76 L 262 76", class: "vis-line" }), svgEl("path", { d: "M 307 60 L 307 76 L 302 76", class: "vis-line" }));
  sys.append(svgEl("rect", { x: 244, y: 76, width: 42, height: 22, rx: 3, class: "vis-box" }), svgEl("text", { x: 265, y: 91, "text-anchor": "middle", class: "vis-mini" }, "인버터"));
  sys.append(svgEl("path", { d: "M 286 87 L 298 87", class: "vis-line" }));
  sys.append(svgEl("rect", { x: 298, y: 76, width: 36, height: 22, rx: 3, class: "vis-box" }), svgEl("text", { x: 316, y: 91, "text-anchor": "middle", class: "vis-mini" }, "계량기"));
  svg.append(sys);
  svg.append(svgEl("text", { x: 284, y: 112, "text-anchor": "middle", class: "vis-cap" }, "태양광 설비"));
  svg.append(svgEl("text", { x: 284, y: 130, "text-anchor": "middle", class: "vis-cap-sub" }, "패널+인버터+계량기"));
  return svg;
}

function waterSvg() {
  // kW = 수도꼭지에서 지금 나오는 물의 세기, kWh = 양동이에 모인 물의 양
  const svg = svgEl("svg", { viewBox: "0 0 360 150", class: "vis-svg", role: "img", "aria-label": "수도꼭지에서 나오는 물의 세기가 kW, 양동이에 모인 물의 양이 kWh" });
  svg.append(svgEl("path", { d: "M 40 30 L 120 30 L 120 46 L 68 46 L 68 56 L 52 56 L 52 46 L 40 46 Z", class: "vis-faucet" }));
  for (const [x, y] of [[60, 70], [60, 90], [60, 110]]) svg.append(svgEl("ellipse", { cx: x, cy: y, rx: 4, ry: 6, class: "vis-drop" }));
  svg.append(svgEl("text", { x: 60, y: 140, "text-anchor": "middle", class: "vis-cap" }, "kW"));
  svg.append(svgEl("text", { x: 84, y: 92, class: "vis-cap-sub" }, "지금 나오는"));
  svg.append(svgEl("text", { x: 84, y: 108, class: "vis-cap-sub" }, "세기(출력)"));
  svg.append(svgEl("path", { d: "M 214 52 L 226 126 L 316 126 L 328 52 Z", class: "vis-bucket" }));
  svg.append(svgEl("path", { d: "M 219 84 L 225 124 L 317 124 L 323 84 Z", class: "vis-water" }));
  svg.append(svgEl("text", { x: 271, y: 140, "text-anchor": "middle", class: "vis-cap" }, "kWh"));
  svg.append(svgEl("text", { x: 271, y: 30, "text-anchor": "middle", class: "vis-cap-sub" }, "모인 양(에너지)"));
  svg.append(svgEl("text", { x: 164, y: 28, "text-anchor": "middle", class: "vis-cap-sub" }, "시간이 쌓이면"));
  svg.append(svgEl("path", { d: "M 130 40 L 196 40", class: "vis-arrow" }), svgEl("path", { d: "M 190 35 L 198 40 L 190 45", class: "vis-arrow" }));
  return svg;
}

function kwpSvg() {
  // kWp = 가장 맑은 날 한낮에 낼 수 있는 최대 출력(= 패널의 크기)
  const svg = svgEl("svg", { viewBox: "0 0 360 150", class: "vis-svg", role: "img", "aria-label": "맑은 날 한낮의 햇빛을 받는 패널, 낼 수 있는 최대 출력이 kWp" });
  svg.append(svgEl("circle", { cx: 70, cy: 44, r: 20, class: "vis-sun" }));
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    svg.append(svgEl("line", { x1: 70 + Math.cos(a) * 28, y1: 44 + Math.sin(a) * 28, x2: 70 + Math.cos(a) * 38, y2: 44 + Math.sin(a) * 38, class: "vis-ray" }));
  }
  svg.append(svgEl("path", { d: "M 96 62 L 176 96", class: "vis-beam" }), svgEl("path", { d: "M 90 74 L 168 108", class: "vis-beam" }));
  svg.append(svgEl("polygon", { points: "150,118 238,118 262,86 174,86", class: "vis-panel-frame" }));
  for (let c = 1; c < 4; c++) svg.append(svgEl("line", { x1: 150 + c * 22 + 0, y1: 118, x2: 174 + c * 22, y2: 86, class: "vis-line" }));
  svg.append(svgEl("line", { x1: 162, y1: 102, x2: 250, y2: 102, class: "vis-line" }));
  svg.append(svgEl("text", { x: 290, y: 78, "text-anchor": "middle", class: "vis-cap" }, "최대"));
  svg.append(svgEl("text", { x: 290, y: 98, "text-anchor": "middle", class: "vis-cap" }, "출력"));
  svg.append(svgEl("text", { x: 180, y: 140, "text-anchor": "middle", class: "vis-cap-sub" }, "맑은 날 한낮, 가장 잘 나올 때"));
  return svg;
}

/**
 * @param {HTMLElement} container
 * @param {{ yieldKwhPerKwp: number }} d
 */
export function renderGlossary(container, d) {
  const grid = el("div", { class: "vis-grid" });
  grid.append(
    card("태양전지 → 패널 → 설비", cellsSvg(), ["태양전지는 빛을 전기로 바꾸는 작은 조각입니다. 여러 개를 붙이면 패널, 패널과 전기를 다루는 장치를 합치면 태양광 설비입니다."]),
    card("kW와 kWh는 달라요", waterSvg(), ["kW는 지금 이 순간 나오는 전기의 세기(수도꼭지), kWh는 시간 동안 모인 전기의 양(양동이)입니다. 전기요금은 kWh로 매겨집니다."]),
    card("kWp는 패널의 크기", kwpSvg(), [`kWp는 맑은 날 한낮에 낼 수 있는 최대 출력으로, 패널이 클수록 큽니다. 예: 이 앱의 기본 1 kWp 설비는 부산에서 1년에 약 ${fmt(d.yieldKwhPerKwp)} kWh를 만듭니다(PVGIS 값).`]),
  );
  container.replaceChildren(el("h2", {}, "처음이라면: 용어를 그림으로"), grid);
}

// ── 우주 비교: 실제 비율 궤도 그림 ──

/** @param {HTMLElement} container */
export function renderOrbit(container) {
  const W = 680;
  const H = 410;
  const cx = 340;
  const cy = 205;
  const g = orbitGeometry(150);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "vis-svg vis-orbit", role: "img", "aria-labelledby": "orbit-title orbit-desc" });
  svg.append(svgEl("title", { id: "orbit-title" }, "지구와 정지궤도의 실제 비율 그림"), svgEl("desc", { id: "orbit-desc" }, `지구 반지름을 1로 보면 정지궤도 반지름은 약 ${fmt(g.orbitOverEarth, 2)}배입니다. 왼쪽의 태양빛이 오른쪽으로 비추고, 지구 뒤쪽에 그림자가 생깁니다.`));
  // 태양과 빛줄기(태양은 실제로는 훨씬 멀어서 줄여 그림)
  svg.append(svgEl("text", { x: 44, y: cy + 62, "text-anchor": "middle", class: "vis-cap" }, "태양"));
  svg.append(svgEl("circle", { cx: 44, cy, r: 24, class: "vis-sun" }));
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    svg.append(svgEl("line", { x1: 44 + Math.cos(a) * 32, y1: cy + Math.sin(a) * 32, x2: 44 + Math.cos(a) * 44, y2: cy + Math.sin(a) * 44, class: "vis-ray" }));
  }
  const beams = [-1.6, -1, -0.45, 0, 0.45, 1, 1.6].map((k) => cy + k * g.orbitPx * 0.62);
  for (const y of beams) {
    const blocked = Math.abs(y - cy) < g.earthPx;
    svg.append(svgEl("line", { x1: 92, y1: y, x2: blocked ? cx - g.earthPx - 3 : W - 24, y2: y, class: "vis-beam" }));
  }
  // 지구 그림자(원통)와 궤도
  svg.append(svgEl("rect", { x: cx, y: cy - g.earthPx, width: W - 24 - cx, height: g.earthPx * 2, class: "vis-shadow" }));
  svg.append(svgEl("circle", { cx, cy, r: g.orbitPx, class: "vis-orbit-line" }));
  // 지구(실제 비율): 낮 쪽(왼쪽 절반) 밝게, 밤 쪽 어둡게
  svg.append(svgEl("circle", { cx, cy, r: g.earthPx, class: "vis-earth" }));
  svg.append(svgEl("path", { d: `M ${cx} ${cy - g.earthPx} A ${g.earthPx} ${g.earthPx} 0 0 1 ${cx} ${cy + g.earthPx} Z`, class: "vis-night" }));
  svg.append(svgEl("text", { x: cx, y: cy + g.earthPx + 22, "text-anchor": "middle", class: "vis-cap" }, "지구"));
  // 지상 패널(지구 표면, 태양 쪽)
  svg.append(svgEl("rect", { x: cx - g.earthPx - 12, y: cy - 5, width: 12, height: 10, rx: 1.5, class: "vis-sat-panel" }));
  // 위성 3개: 햇빛 속 2개, 그림자 속 1개
  /** @param {number} x @param {number} y @param {boolean} lit */
  const sat = (x, y, lit) => {
    const s = svgEl("g", { class: lit ? "vis-sat" : "vis-sat vis-sat-dark" });
    s.append(svgEl("rect", { x: x - 22, y: y - 5, width: 15, height: 10, rx: 1.5, class: "vis-sat-panel" }), svgEl("rect", { x: x - 6, y: y - 6, width: 12, height: 12, rx: 2, class: "vis-sat-body" }), svgEl("rect", { x: x + 7, y: y - 5, width: 15, height: 10, rx: 1.5, class: "vis-sat-panel" }));
    return s;
  };
  svg.append(sat(cx, cy - g.orbitPx, true), sat(cx - g.orbitPx, cy, true), sat(cx + g.orbitPx, cy, false), sat(cx, cy + g.orbitPx, true));
  // 번호 표시
  svg.append(marker(cx - g.earthPx - 34, cy - 30, 1), marker(cx, cy - g.orbitPx - 34, 2), marker(cx + g.orbitPx + 4, cy - 34, 3), marker(cx + 70, cy + 86, 4));
  svg.append(svgEl("line", { x1: cx, y1: cy, x2: cx + g.orbitPx * Math.cos(Math.PI / 5), y2: cy + g.orbitPx * Math.sin(Math.PI / 5), class: "vis-measure" }));
  const legend = el("ol", { class: "vis-legend" });
  legend.append(
    el("li", {}, "지상 패널(부산): 밤에는 발전하지 못하고, 낮에도 대기와 구름이 햇빛을 줄입니다."),
    el("li", {}, `정지궤도 패널: 지구 적도 위 약 ${fmt(g.altitudeKm)} km 높이(지구 반지름의 약 ${fmt(g.altitudeOverEarth, 1)}배)에서 거의 계속 햇빛을 받습니다.`),
    el("li", {}, "지구 그림자(식): 춘분·추분 무렵 하루 최대 72분 동안 패널이 그림자 속에 들어갑니다(NOAA)."),
    el("li", {}, `이 그림은 지구와 궤도의 실제 비율입니다(궤도 반지름 ${fmt(g.orbitOverEarth, 2)}배). 태양은 실제로는 훨씬 멀어서 줄여 그렸습니다.`),
  );
  container.replaceChildren(el("h3", { class: "sub-heading" }, "그림으로 보는 지상과 정지궤도"), svg, legend);
}

// ── 우주 비교: 하루 햇빛 비교 · 에너지 흐름 ──

/**
 * @param {HTMLElement} container
 * @param {{ groundKwhM2Year: number | null, spaceKwhM2Year: number }} d
 */
export function renderDayCompare(container, d) {
  if (d.groundKwhM2Year === null) {
    container.replaceChildren();
    return;
  }
  const c = dayCompare(d.groundKwhM2Year, d.spaceKwhM2Year);
  const row = (/** @type {string} */ label, /** @type {number} */ value, /** @type {number} */ fraction, /** @type {string} */ cls) => {
    const r = el("div", { class: "vis-bar-row" });
    const bar = el("div", { class: `vis-bar ${cls}` });
    bar.style.width = `${Math.max(2, fraction * 100)}%`;
    const text = el("span", { class: "vis-bar-text" }, `${fmt(value, 2)} kWh`);
    const track = el("div", { class: "vis-track" });
    track.append(bar);
    r.append(el("span", { class: "vis-bar-label" }, label), track, text);
    return r;
  };
  const wrap = el("div", { class: "vis-bars" });
  wrap.append(row("지상(부산)", c.groundPerDay, c.groundPerDay / c.spacePerDay, "vis-bar-ground"), row("정지궤도", c.spacePerDay, 1, "vis-bar-space"));
  container.replaceChildren(el("h3", { class: "sub-heading" }, "하루에 1 m²가 받는 햇빛 에너지"), wrap, el("p", { class: "vis-note" }, `정지궤도가 지상보다 약 ${fmt(c.ratio, 1)}배 많습니다. 이것은 패널 효율을 곱하기 전의 햇빛 양입니다.`));
}

/**
 * @param {HTMLElement} container
 * @param {{ incidentKwhM2Year: number, panelEfficiency: number, etaTx: number }} p
 */
export function renderEnergyFlow(container, p) {
  const steps = energyFlow(p);
  const wrap = el("div", { class: "vis-flow" });
  steps.forEach((s, i) => {
    const row = el("div", { class: "vis-flow-row" });
    const bar = el("div", { class: `vis-flow-bar vis-flow-${i}` });
    bar.style.width = `${Math.max(1.5, s.fraction * 100)}%`;
    const track = el("div", { class: "vis-track" });
    track.append(bar);
    row.append(el("span", { class: "vis-flow-label" }, s.label), track, el("span", { class: "vis-flow-value" }, `${fmt(s.kwh)} kWh/년 (${fmt(s.fraction * 100, 1)}%)`));
    wrap.append(row);
  });
  container.replaceChildren(el("h3", { class: "sub-heading" }, "1 m² 패널의 에너지는 어디로 줄어드나"), wrap, el("p", { class: "vis-note" }, "햇빛 → 전기(패널 효율) → 송전(송전 효율)을 거치며 줄어듭니다. 패널 효율과 송전 효율은 임의 가정이며, 아래 슬라이더로 바꿔 볼 수 있습니다."));
}
