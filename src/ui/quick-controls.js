// 빠른 조정: 개요 화면에서 설치 용량과 방향 보정을 슬라이더로 바로 바꾼다. "입력" 화면의 같은 칸과 서로 맞춰진다.
// 정확한 값은 "입력" 화면의 숫자 칸에서 넣고, 여기서는 훑어보며 조정하는 용도다.
import { el, fmt } from "./dom.js";

/** 슬라이더 항목: 가정 레지스트리의 키, 이름, 범위. 방향 보정 범위(0.8~1.0)는 입력 패널과 같다(spec 5.1) */
const SLIDERS = [
  { id: "capacity_kwp", label: "설치 용량", unit: "kWp", min: 0.5, max: 15, step: 0.1, digits: 1 },
  { id: "orientation_factor", label: "방향 보정 (35° 남향 대비)", unit: "배", min: 0.8, max: 1.0, step: 0.01, digits: 2 },
];

/**
 * @param {HTMLElement} container
 * @param {import("./input-panel.js").InputController} controller
 * @param {(tabName: string) => void} goToTab  "입력" 구역으로 가는 링크용
 * @returns {{ sync(values: Record<string, number | null>): void }}
 */
export function createQuickControls(container, controller, goToTab) {
  /** @type {Record<string, { input: HTMLInputElement, out: HTMLElement }>} */
  const rows = {};
  const body = el("div", { class: "quick-body" });

  for (const s of SLIDERS) {
    const input = /** @type {HTMLInputElement} */ (el("input", { id: `quick-${s.id}`, type: "range", min: String(s.min), max: String(s.max), step: String(s.step) }));
    const out = el("output", { for: input.id, class: "quick-value" });
    const head = el("div", { class: "quick-head" });
    head.append(el("label", { for: input.id }, s.label), out);
    const scale = el("div", { class: "quick-scale" });
    scale.append(el("span", {}, `${fmt(s.min, s.digits)}`), el("span", {}, `${fmt(s.max, s.digits)} ${s.unit}`));
    const row = el("div", { class: "quick-row" });
    row.append(head, input, scale);
    body.append(row);
    rows[s.id] = { input, out };
    input.addEventListener("input", () => {
      const v = input.valueAsNumber;
      out.textContent = `${fmt(v, s.digits)} ${s.unit}`;
      controller.setValues({ [s.id]: v });
    });
  }

  const more = el("button", { type: "button", class: "link-button" }, "모든 입력값 보기 →");
  more.addEventListener("click", () => goToTab("inputs"));
  container.replaceChildren(el("h2", {}, "빠른 조정"), body, more);

  return {
    /** 입력칸 값이 바뀌었을 때 슬라이더 위치와 숫자를 맞춘다(슬라이더를 끄는 중이면 손대지 않음) */
    sync(values) {
      for (const s of SLIDERS) {
        const v = values[s.id];
        const { input, out } = rows[s.id];
        if (typeof v === "number" && Number.isFinite(v)) {
          if (document.activeElement !== input) input.value = String(v);
          out.textContent = `${fmt(v, s.digits)} ${s.unit}`;
        } else {
          out.textContent = "값 확인 필요";
        }
      }
    },
  };
}
