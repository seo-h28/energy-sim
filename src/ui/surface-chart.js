// 3D 그래프: 설치 용량 × 경사각에 따른 25년 NPV를 입체 곡면으로 보여 준다(계산: src/core/surface.js).
// 외부 라이브러리 없이 캔버스에 직접 그린다. 마우스(또는 손가락)로 끌면 돌아가고, 버튼으로 처음 각도로 되돌린다.
// 높이 = NPV, 색 = NPV(0 아래는 붉은 계열, 위는 청록~파랑). 흰 점 = 지금 입력, 금색 마름모 = NPV가 가장 큰 점.
import { linspace, npvSurface } from "../core/surface.js";
import { el, fmt } from "./dom.js";

const won = (/** @type {number} */ n) => `${fmt(n)}원`;
const CAP_STEPS = 20;
const TILTS = linspace(0, 90, 19);

/** @param {number} t 0~1 */
function posColor(t) {
  // 0 → 청록(52,211,153), 1 → 파랑(56,189,248)
  const r = Math.round(52 + (56 - 52) * t);
  const g = Math.round(211 + (189 - 211) * t);
  const b = Math.round(153 + (248 - 153) * t);
  return [r, g, b];
}

/**
 * @param {HTMLElement} container
 * @returns {{ update(args: { values: Record<string, number | null>, usage: number[], toInput: Parameters<typeof npvSurface>[2], currentCapacity: number, currentTilt: number }): void, hide(): void }}
 */
export function createSurfaceChart(container) {
  const canvas = /** @type {HTMLCanvasElement} */ (el("canvas", { role: "img", "aria-label": "설치 용량과 경사각에 따른 NPV 3D 곡면" }));
  canvas.style.width = "100%";
  canvas.style.height = "460px";
  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";
  const summary = el("p", { class: "card-note", role: "status" });
  const reset = /** @type {HTMLButtonElement} */ (el("button", { type: "button" }, "처음 각도로"));
  const box = el("div", { class: "chart-box" });
  box.style.height = "auto";
  box.append(canvas);
  container.replaceChildren(
    el("h2", {}, "3D 그래프: 용량과 경사각을 함께 바꾸면"),
    el("p", { class: "card-note" }, "가로는 설치 용량, 세로(앞뒤)는 경사각, 높이와 색은 25년 NPV입니다. 마우스로 끌어 돌려 보세요. 나머지 가정은 입력 그대로이고 낮시간 비중은 기준값(하한과 상한의 가운데)입니다."),
    box,
    el("div", { class: "design-save-row" }),
    summary,
    el("ul", { class: "curve-bullets" }, ""),
  );
  container.querySelector(".design-save-row")?.append(reset);
  const bullets = /** @type {HTMLElement} */ (container.querySelector(".curve-bullets"));

  /** @type {any} */
  let data = null;
  /** @type {{ cap: number, tilt: number } | null} */
  let current = null;
  const DEFAULT_VIEW = { yaw: -0.75, pitch: 0.62 };
  let view = { ...DEFAULT_VIEW };

  function draw() {
    if (!data) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 600;
    const H = canvas.clientHeight || 460;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const caps = data.capacities;
    const tilts = data.tilts;
    const grid = data.npv;
    const flat = grid.flat();
    const vmin = Math.min(...flat);
    const vmax = Math.max(...flat);
    const span = Math.max(Math.abs(vmin), Math.abs(vmax), 1);
    const cx = (/** @type {number} */ c) => ((c - caps[0]) / (caps[caps.length - 1] - caps[0] || 1)) * 2 - 1;
    const ty = (/** @type {number} */ t) => ((t - tilts[0]) / (tilts[tilts.length - 1] - tilts[0] || 1)) * 2 - 1;
    const vz = (/** @type {number} */ v) => (v / span) * 0.9;

    const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    const scale = Math.min(W, H * 1.4) * 0.3;
    /** 3D → 화면 (x: 용량, y: 경사각, z: 높이). 깊이 d는 클수록 멀리 */
    const proj = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
      const x1 = x * cy - y * sy;
      const y1 = x * sy + y * cy;
      const y2 = y1 * cp - z * sp;
      const z2 = y1 * sp + z * cp;
      return { sx: W / 2 + x1 * scale, sy: H * 0.55 + (-z2) * scale + 0, d: y2 };
    };

    // 바닥 상자(축 표시)
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(148,163,184,0.45)";
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const zb = vz(Math.min(vmin, 0));
    ctx.beginPath();
    corners.forEach(([x, y], i) => {
      const p = proj(x, y, zb);
      if (i === 0) ctx.moveTo(p.sx, p.sy);
      else ctx.lineTo(p.sx, p.sy);
    });
    ctx.closePath();
    ctx.stroke();
    // 0 NPV 기준 면 테두리(손익 경계)
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    corners.forEach(([x, y], i) => {
      const p = proj(x, y, 0);
      if (i === 0) ctx.moveTo(p.sx, p.sy);
      else ctx.lineTo(p.sx, p.sy);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // 사각 조각을 먼 것부터 그린다
    /** @type {{ pts: {sx:number, sy:number}[], d: number, v: number }[]} */
    const quads = [];
    for (let i = 0; i < caps.length - 1; i++) {
      for (let j = 0; j < tilts.length - 1; j++) {
        const ids = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        const ps = ids.map(([a, b]) => proj(cx(caps[a]), ty(tilts[b]), vz(grid[a][b])));
        const v = (grid[i][j] + grid[i + 1][j] + grid[i + 1][j + 1] + grid[i][j + 1]) / 4;
        quads.push({ pts: ps, d: ps.reduce((s, p) => s + p.d, 0) / 4, v });
      }
    }
    quads.sort((a, b) => b.d - a.d);
    for (const q of quads) {
      let fill;
      if (q.v >= 0) {
        const [r, g, b] = posColor(Math.min(1, q.v / (vmax || 1)));
        fill = `rgb(${r},${g},${b})`;
      } else {
        const k = Math.min(1, -q.v / (-vmin || 1));
        fill = `rgb(${Math.round(160 + 80 * k)},${Math.round(70 - 30 * k)},${Math.round(80 - 30 * k)})`;
      }
      ctx.fillStyle = fill;
      ctx.strokeStyle = "rgba(11,18,32,0.55)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      q.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 표시: 현재 입력(흰 점), 최댓값(금색 마름모)
    const marker = (/** @type {number} */ capKwp, /** @type {number} */ tiltDeg, /** @type {number} */ v, /** @type {string} */ color, /** @type {boolean} */ diamond) => {
      const p = proj(cx(Math.min(Math.max(capKwp, caps[0]), caps[caps.length - 1])), ty(Math.min(Math.max(tiltDeg, tilts[0]), tilts[tilts.length - 1])), vz(v));
      ctx.fillStyle = color;
      ctx.strokeStyle = "#0b1220";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (diamond) {
        ctx.moveTo(p.sx, p.sy - 9);
        ctx.lineTo(p.sx + 9, p.sy);
        ctx.lineTo(p.sx, p.sy + 9);
        ctx.lineTo(p.sx - 9, p.sy);
        ctx.closePath();
      } else ctx.arc(p.sx, p.sy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    marker(data.best.capacityKwp, data.best.tiltDeg, data.best.npv, "#fbbf24", true);
    if (current) {
      // 현재 입력의 NPV는 가까운 격자 값으로 근사하지 않고, 가장 가까운 격자점의 값을 쓴다(표시 위치만)
      const ci = caps.reduce((bi, c, i) => (Math.abs(c - current.cap) < Math.abs(caps[bi] - current.cap) ? i : bi), 0);
      const tj = tilts.reduce((bj, t, j) => (Math.abs(t - current.tilt) < Math.abs(tilts[bj] - current.tilt) ? j : bj), 0);
      marker(caps[ci], tilts[tj], grid[ci][tj], "#ffffff", false);
    }

    // 축 이름: 바닥 상자 각 변의 가운데에서 바깥쪽으로 조금 띄워 적는다(겹치지 않게)
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "13px sans-serif";
    const c0 = proj(0, 0, zb);
    const lab = (/** @type {string} */ t, /** @type {number} */ x, /** @type {number} */ y) => {
      const p = proj(x, y, zb);
      let dx = p.sx - c0.sx;
      let dy = p.sy - c0.sy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      ctx.textAlign = dx < -0.3 ? "right" : dx > 0.3 ? "left" : "center";
      ctx.fillText(t, p.sx + dx * 10, p.sy + dy * 16);
    };
    lab(`용량 ${fmt(caps[0], 2)} kWp`, -1, 0);
    lab(`용량 ${fmt(caps[caps.length - 1], 1)} kWp`, 1, 0);
    lab(`경사각 ${fmt(tilts[0])}°`, 0, -1);
    lab(`경사각 ${fmt(tilts[tilts.length - 1])}°`, 0, 1);
    ctx.textAlign = "left";
    const z0 = proj(1, 1, 0);
    ctx.fillText("NPV 0 (점선 높이)", z0.sx + 8, z0.sy);
  }

  // 끌어서 돌리기
  /** @type {{ x: number, y: number } | null} */
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    view.yaw += (e.clientX - drag.x) * 0.008;
    view.pitch = Math.min(1.45, Math.max(0.1, view.pitch + (e.clientY - drag.y) * 0.006));
    drag = { x: e.clientX, y: e.clientY };
    draw();
  });
  const end = () => {
    drag = null;
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  reset.addEventListener("click", () => {
    view = { ...DEFAULT_VIEW };
    draw();
  });
  window.addEventListener("resize", draw);

  return {
    update(args) {
      const capMax = Math.max(5, Math.ceil(args.currentCapacity * 2));
      const caps = linspace(capMax / CAP_STEPS, capMax, CAP_STEPS);
      const r = npvSurface(args.values, args.usage, args.toInput, caps, TILTS);
      if ("error" in r) {
        container.hidden = true;
        return;
      }
      container.hidden = false;
      data = r;
      current = { cap: args.currentCapacity, tilt: args.currentTilt };
      summary.textContent = `NPV가 가장 큰 곳: 용량 ${fmt(r.best.capacityKwp, 2)} kWp, 경사각 ${fmt(r.best.tiltDeg)}°, NPV ${won(r.best.npv)}. (탐색 범위: 용량 ${fmt(caps[0], 2)}~${fmt(capMax, 1)} kWp ${CAP_STEPS}칸 × 경사각 0~90° ${TILTS.length}칸 = ${CAP_STEPS * TILTS.length}점)`;
      canvas.setAttribute("aria-label", `설치 용량과 경사각에 따른 NPV 3D 곡면. ${summary.textContent}`);
      bullets.replaceChildren(
        el("li", {}, "흰 점은 지금 입력(가장 가까운 격자점), 금색 마름모는 NPV가 가장 큰 점입니다. 점선 사각형은 NPV가 0인 높이입니다."),
        el("li", {}, "붉은 조각은 NPV가 0보다 작은(설치비를 못 되찾는) 조합입니다. 용량이 너무 크면 남는 전기만 늘어 NPV가 오히려 줄어드는 모양이 보입니다."),
        el("li", {}, "경사각 방향 변화는 PVGIS 계산값 표(부산, 5° 간격)를 기준으로 한 계산이며, 방향 보정과 모든 가정은 입력 그대로입니다."),
      );
      draw();
    },
    hide() {
      container.hidden = true;
    },
  };
}
