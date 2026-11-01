// 에너지 균형 카드: 자급률·자가소비율 반원 게이지 2개 + 알약형 막대 2개(발전량이 쓰이는 곳, 사용량을 채우는 곳).
// 모두 1년차 계산값(결과 카드와 같은 기준 낮시간 비중)이며, 없는 정보(배터리, 가전별 소비 등)는 그리지 않는다.
import { el, fmt, svgEl } from "./dom.js";

/**
 * 반원 게이지. 값은 0~1(범위 밖은 0~1로 잘라서 그린다). 값이 없으면 빈 게이지.
 * @param {string} label
 * @param {number | null} value
 * @param {string} caption  게이지 아래 설명
 */
function gauge(label, value, caption) {
  const pct = value === null || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(1, value)) * 100;
  const svg = svgEl("svg", { viewBox: "0 0 200 112", class: "gauge-svg", role: "img", "aria-label": `${label} ${value === null ? "계산 불가" : fmt(pct, 1) + "%"}` });
  const d = "M 20 100 A 80 80 0 0 1 180 100";
  svg.append(
    svgEl("path", { d, pathLength: 100, class: "gauge-track" }),
    svgEl("path", { d, pathLength: 100, class: "gauge-fill", "stroke-dasharray": `${pct} 100` }),
  );
  // 눈금: 0, 25, 50, 75, 100% 위치에 짧은 선, 끝 점: 값 위치에 작은 원(반원 위의 각도로 계산)
  for (let k = 0; k <= 4; k++) {
    const a = Math.PI * (1 - k / 4);
    svg.append(svgEl("line", { x1: 100 + Math.cos(a) * 69, y1: 100 - Math.sin(a) * 69, x2: 100 + Math.cos(a) * 62, y2: 100 - Math.sin(a) * 62, class: "gauge-tick" }));
  }
  const angle = Math.PI * (1 - pct / 100);
  svg.append(svgEl("circle", { cx: 100 + Math.cos(angle) * 80, cy: 100 - Math.sin(angle) * 80, r: 5.5, class: "gauge-dot" }));
  svg.append(svgEl("text", { x: 20, y: 112, "text-anchor": "middle", class: "gauge-scale" }, "0"), svgEl("text", { x: 180, y: 112, "text-anchor": "middle", class: "gauge-scale" }, "100%"));
  const text = svgEl("text", { x: 100, y: 88, "text-anchor": "middle", class: "gauge-number" });
  text.append(svgEl("tspan", {}, value === null ? "-" : fmt(pct, 1)), svgEl("tspan", { class: "gauge-unit", dx: 2 }, value === null ? "" : "%"));
  svg.append(text);
  const box = el("div", { class: "gauge" });
  box.append(svg, el("p", { class: "gauge-label" }, label), el("p", { class: "gauge-caption" }, caption));
  return box;
}

/**
 * 알약형 막대: 조각들의 비율을 둥근 막대로, 아래에 각 조각의 이름·값·비율을 적는다.
 * @param {string} title
 * @param {{ name: string, kwh: number, cls: string }[]} parts
 */
function pillBar(title, parts) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.kwh), 0);
  const box = el("div", { class: "pill-block" });
  box.append(el("p", { class: "pill-title" }, title));
  const bar = el("div", { class: "pill-bar", role: "img", "aria-label": `${title}: ` + parts.map((p) => `${p.name} ${fmt(p.kwh)} kWh`).join(", ") });
  const legend = el("ul", { class: "pill-legend" });
  for (const p of parts) {
    const share = total > 0 ? Math.max(0, p.kwh) / total : 0;
    if (share > 0) {
      const seg = el("span", { class: `pill-seg ${p.cls}` });
      seg.style.flexGrow = String(share);
      bar.append(seg);
    }
    const li = el("li", {});
    li.append(el("span", { class: `pill-dot ${p.cls}` }), el("span", {}, `${p.name} `), el("strong", {}, `${fmt(p.kwh)} kWh`), el("span", { class: "pill-pct" }, total > 0 ? ` (${fmt(share * 100, 1)}%)` : ""));
    legend.append(li);
  }
  if (total <= 0) bar.append(el("span", { class: "pill-seg seg-empty" }));
  box.append(bar, legend);
  return box;
}

/**
 * @param {HTMLElement} container
 * @param {{ genKwh: number, selfKwh: number, exportKwh: number, usageKwh: number }} t  1년차 합계 [kWh]
 */
export function renderBalance(container, t) {
  const selfSufficiency = t.usageKwh > 0 ? t.selfKwh / t.usageKwh : null;
  const selfConsumption = t.genKwh > 0 ? t.selfKwh / t.genKwh : null;
  const grid = Math.max(0, t.usageKwh - t.selfKwh);

  const gauges = el("div", { class: "gauge-grid" });
  gauges.append(
    gauge("자급률", selfSufficiency, "쓰는 전기 중 태양광이 채우는 몫"),
    gauge("자가소비율", selfConsumption, "발전한 전기 중 내가 쓰는 몫"),
  );
  const bars = el("div", { class: "pill-col" });
  bars.append(
    pillBar("발전한 전기는 어디로", [
      { name: "자가소비", kwh: t.selfKwh, cls: "seg-primary" },
      { name: "잉여(한전으로)", kwh: t.exportKwh, cls: "seg-secondary" },
    ]),
    pillBar("쓰는 전기는 어디서", [
      { name: "태양광(자가소비)", kwh: t.selfKwh, cls: "seg-primary" },
      { name: "한전 전기", kwh: grid, cls: "seg-neutral" },
    ]),
  );
  const head = el("div", { class: "section-head" });
  head.append(el("h2", {}, "에너지 균형"), el("span", { class: "section-sub" }, `1년차 · 연 발전 ${fmt(t.genKwh)} kWh, 연 사용 ${fmt(t.usageKwh)} kWh`));
  const body = el("div", { class: "balance-body" });
  body.append(gauges, bars);
  container.replaceChildren(head, body);
  container.hidden = false;
}
