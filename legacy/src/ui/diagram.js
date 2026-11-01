// 시스템 개념도(SVG): 태양 → 옥상 패널 → 인버터 → 계량기 → (한전 계통 / 건물 사용).
// 외부 이미지·라이브러리 없이 코드로 그린다. 한 번 만들고, 입력이 바뀌면 숫자와 패널 칸 수·화살표 굵기만 바꾼다.
// 숫자는 결과 카드와 같은 1년차 계산값(core/flow.js)이며, 패널 칸 수는 용량에 비례한 "그림 눈금"이다(실제 패널 장수 아님).
import { KWP_PER_SLOT, MAX_SLOTS, panelsOn } from "../core/flow.js";
import { el, fmt, svgEl } from "./dom.js";

const COLS = 6;
const ROWS = 2;

/** 도형 하나: 상자 + 제목 + 보조 글자 */
function box(x, y, w, h, title) {
  const g = svgEl("g");
  g.append(svgEl("rect", { x, y, width: w, height: h, rx: 12, class: "dg-box" }));
  const titleText = svgEl("text", { x: x + w / 2, y: y + 32, class: "dg-title", "text-anchor": "middle" }, title);
  const subText = svgEl("text", { x: x + w / 2, y: y + 58, class: "dg-sub", "text-anchor": "middle" });
  g.append(titleText, subText);
  return { g, subText };
}

/**
 * @param {HTMLElement} container
 * @returns {{ update(input: { capacityKwp: number }, totals: { genKwh: number, selfKwh: number, exportKwh: number }, firstYearSavingKrw: number): void, hide(): void }}
 */
export function createSystemDiagram(container) {
  const svg = svgEl("svg", { viewBox: "0 0 960 340", role: "img", "aria-labelledby": "dg-title dg-desc", class: "dg-svg" });
  const titleEl = svgEl("title", { id: "dg-title" }, "태양광 시스템 개념도");
  const descEl = svgEl("desc", { id: "dg-desc" });

  // 화살표 머리
  const defs = svgEl("defs");
  for (const [id, cls] of [["dg-arrow-main", "dg-head-main"], ["dg-arrow-export", "dg-head-export"]]) {
    // markerUnits를 userSpaceOnUse로 두어 선이 굵어져도 화살표 머리 크기는 일정하게 한다
    const marker = svgEl("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 14, markerHeight: 14, markerUnits: "userSpaceOnUse", orient: "auto" });
    marker.append(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 z", class: cls }));
    defs.append(marker);
  }

  // 태양과 빛줄기
  const sun = svgEl("g", { class: "dg-sun-group" });
  sun.append(svgEl("circle", { cx: 80, cy: 70, r: 24, class: "dg-sun" }));
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    sun.append(svgEl("line", { x1: 80 + Math.cos(a) * 34, y1: 70 + Math.sin(a) * 34, x2: 80 + Math.cos(a) * 46, y2: 70 + Math.sin(a) * 46, class: "dg-ray" }));
  }
  const beams = svgEl("g", { class: "dg-beams" });
  for (const [x2, y2] of [[140, 190], [200, 180], [260, 172]]) beams.append(svgEl("line", { x1: 104, y1: 90, x2, y2, class: "dg-beam" }));
  sun.append(svgEl("text", { x: 80, y: 128, class: "dg-sub", "text-anchor": "middle" }, "태양"));

  // 옥상: 평행사변형 위에 패널 칸을 깐다 (좌표 변환으로 비스듬한 면처럼 보이게 함)
  const house = svgEl("g");
  house.append(svgEl("rect", { x: 50, y: 230, width: 220, height: 80, rx: 6, class: "dg-box" }));
  const roofText = svgEl("text", { x: 160, y: 276, class: "dg-title", "text-anchor": "middle" }, "옥상");
  const roofSub = svgEl("text", { x: 160, y: 300, class: "dg-sub", "text-anchor": "middle" });
  house.append(svgEl("polygon", { points: "50,230 270,230 320,180 100,180", class: "dg-roof" }));
  const grid = svgEl("g", { transform: "matrix(1 0 1 -1 50 230)" });
  /** @type {SVGElement[]} */
  const slots = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const r = svgEl("rect", { x: 2.3 + col * (220 / COLS), y: 2.5 + row * (50 / ROWS), width: 32, height: 20, rx: 2, class: "dg-slot" });
    slots.push(r);
    grid.append(r);
  }
  house.append(grid, roofText, roofSub);

  // 인버터 · 계량기 · 도착점
  const inverter = box(370, 150, 150, 80, "인버터");
  const meter = box(570, 150, 100, 80, "계량기");
  meter.subText.textContent = "";
  const gridBox = box(770, 40, 170, 80, "한전 계통(잉여)");
  const useBox = box(770, 230, 170, 80, "건물 사용(자가소비)");

  // 화살표: 직선 2개 + 갈래길 2개(굵기 = 비율)
  const flows = svgEl("g");
  flows.append(
    svgEl("line", { x1: 300, y1: 206, x2: 366, y2: 196, class: "dg-flow dg-flow-main", "stroke-width": 4, "marker-end": "url(#dg-arrow-main)" }),
    svgEl("line", { x1: 522, y1: 190, x2: 566, y2: 190, class: "dg-flow dg-flow-main", "stroke-width": 4, "marker-end": "url(#dg-arrow-main)" }),
  );
  const pathExport = svgEl("path", { d: "M 672 178 H 710 V 80 H 764", class: "dg-flow dg-flow-export", "marker-end": "url(#dg-arrow-export)" });
  const pathSelf = svgEl("path", { d: "M 672 202 H 710 V 270 H 764", class: "dg-flow dg-flow-main", "marker-end": "url(#dg-arrow-main)" });
  flows.append(pathExport, pathSelf);

  svg.append(titleEl, descEl, defs, sun, beams, house, flows, inverter.g, meter.g, gridBox.g, useBox.g);

  const savingLine = el("p", { class: "dg-caption" });
  const note = el(
    "p",
    { class: "card-note" },
    `개념도입니다. 패널 칸 수는 용량에 비례한 그림 눈금(1칸 = ${KWP_PER_SLOT} kWp, 최대 ${MAX_SLOTS}칸)이며 실제 패널 장수가 아닙니다. 숫자는 결과 카드와 같은 1년차 계산값(기준 낮시간 비중)이고, 자가소비는 월별 계산 결과입니다.`,
  );
  const wrap = el("div", { class: "diagram-box" });
  wrap.append(svg);
  container.replaceChildren(el("h2", {}, "시스템 개념도"), wrap, savingLine, note);

  return {
    update(input, totals, firstYearSavingKrw) {
      const on = panelsOn(input.capacityKwp);
      slots.forEach((r, i) => r.classList.toggle("on", i < on));
      const { genKwh, selfKwh, exportKwh } = totals;
      const selfShare = genKwh > 0 ? selfKwh / genKwh : 0;
      const selfPct = selfShare * 100;
      const exportPct = genKwh > 0 ? 100 - selfPct : 0;
      beams.classList.toggle("off", !(genKwh > 0));

      roofSub.textContent = `설치 용량 ${fmt(input.capacityKwp, 2)} kWp`;
      inverter.subText.textContent = `연 발전 ${fmt(genKwh)} kWh`;
      gridBox.subText.textContent = `${fmt(exportKwh)} kWh (${fmt(exportPct)}%)`;
      useBox.subText.textContent = `${fmt(selfKwh)} kWh (${fmt(selfPct)}%)`;

      // 화살표 굵기: 비율이 클수록 굵게. 0이면 얇은 점선으로 "흐름 없음"을 보인다
      for (const [path, share] of [[pathSelf, selfShare], [pathExport, genKwh > 0 ? 1 - selfShare : 0]]) {
        path.setAttribute("stroke-width", String(2 + 10 * share));
        path.classList.toggle("none", share <= 0);
      }

      savingLine.textContent = `1년차 연 절감 ${fmt(firstYearSavingKrw)}원 (자가소비로 아끼는 전기요금 + 잉여 판매 − 연 유지비)`;
      descEl.textContent =
        `설치 용량 ${fmt(input.capacityKwp, 2)} kWp의 연 발전량 ${fmt(genKwh)} kWh 중 ` +
        `자가소비 ${fmt(selfKwh)} kWh(${fmt(selfPct)}%), 한전 계통으로 보내는 잉여 ${fmt(exportKwh)} kWh(${fmt(exportPct)}%).`;
      container.hidden = false;
    },
    hide() {
      container.hidden = true;
    },
  };
}
