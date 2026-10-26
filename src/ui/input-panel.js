// 입력 패널: 재무 계산에 쓰는 가정을 입력칸으로 보여주고, 바뀔 때마다 현재 값 목록을 알려준다.
// 화면 요소는 createElement + textContent로만 만든다(사용자 입력이 HTML로 해석될 일이 없게).
import { STATUS_LABELS } from "../core/assumptions.js";
import { PARAM_TO_INPUT } from "../core/params.js";
import { el } from "./dom.js";

/** 슬라이더로 보여줄 항목과 범위. 방향 보정은 0.8~1.0으로 제한(spec 5.1) */
const SLIDERS = {
  orientation_factor: { min: 0.8, max: 1.0, step: 0.01 },
};

/** 숫자 입력칸의 허용 범위. 0~1 비율 항목은 상한 1 */
const RATIO_IDS = new Set(["loss_rate", "degradation_rate", "day_share_low", "day_share_high"]);

/**
 * 값에 붙는 설명. 요금제 선택처럼 "사용자가 직접 친 값은 아니지만 기본값과 다른" 값의 상태·출처를 알려준다.
 * @typedef {{ status: import("../core/assumptions.js").Status, source: string }} Note
 */

/**
 * @typedef {Object} InputController
 * @property {(id: string, value: number, note?: Note) => void} setValue  코드에서 값을 넣는다(요금제 선택 등)
 * @property {(id: string) => void} clearNote  설명을 지우고 사용자 입력 상태로 돌린다
 * @property {(fn: (id: string) => void) => void} onUserEdit  사용자가 칸을 직접 고치면 호출될 함수 등록
 * @property {(fn: () => void) => void} onReset  기본값으로 되돌리면 호출될 함수 등록
 * @property {(map: Record<string, number>) => void} setValues  여러 값을 한꺼번에 넣는다(공유 링크 복원용, 계산은 한 번만)
 */

/**
 * @param {HTMLElement} container
 * @param {import("../core/assumptions.js").Assumptions} data  기본값(되돌리기 기준)
 * @param {(values: Record<string, number | null>, notes: Record<string, Note>) => void} onChange  값이 바뀔 때마다 호출
 * @returns {InputController}
 */
export function renderInputPanel(container, data, onChange) {
  /** @type {Record<string, number | null>} */
  const values = {};
  /** @type {Record<string, Note>} */
  const notes = {};
  /** @type {Record<string, {input: HTMLInputElement, badge: HTMLElement, readout: HTMLElement | null}>} */
  const fields = {};
  /** @type {Array<(id: string) => void>} */
  const editListeners = [];
  /** @type {Array<() => void>} */
  const resetListeners = [];

  const emit = () => onChange({ ...values }, { ...notes });

  /** 배지를 현재 상태(설명이 있으면 그 상태, 없으면 사용자 입력 또는 기본 상태)로 맞춘다 */
  function paintBadge(id, status) {
    const badge = fields[id].badge;
    badge.className = `badge badge-${status}`;
    badge.textContent = STATUS_LABELS[status];
    badge.title = notes[id]?.source ?? "";
  }

  const heading = el("h2", {}, "입력");
  const form = el("form", { class: "input-grid", autocomplete: "off" });
  form.addEventListener("submit", (e) => e.preventDefault());

  for (const id of Object.keys(PARAM_TO_INPUT)) {
    const p = data.params[id];
    if (!p) continue;
    values[id] = p.value;

    const slider = SLIDERS[/** @type {keyof typeof SLIDERS} */ (id)];
    const input = /** @type {HTMLInputElement} */ (
      el("input", {
        id: `in-${id}`,
        type: slider ? "range" : "number",
        ...(slider
          ? { min: String(slider.min), max: String(slider.max), step: String(slider.step) }
          : { min: "0", step: "any", ...(RATIO_IDS.has(id) ? { max: "1" } : {}) }),
      })
    );
    input.value = String(p.value ?? "");
    const readout = slider ? el("output", { for: input.id }, String(p.value)) : null;
    const badge = el("span", { class: `badge badge-${p.status}` }, STATUS_LABELS[p.status]);
    fields[id] = { input, badge, readout };

    input.addEventListener("input", () => {
      const v = input.valueAsNumber; // 칸이 비면 NaN -> 계산 쪽 입력 검사가 잡는다
      values[id] = v;
      delete notes[id];
      if (readout) readout.textContent = String(v);
      paintBadge(id, "user");
      editListeners.forEach((fn) => fn(id));
      emit();
    });

    const row = el("div", { class: "field" });
    const label = el("label", { for: input.id }, p.label);
    const unit = el("span", { class: "unit" }, p.unit);
    const control = el("div", { class: "control" });
    control.append(input, ...(readout ? [readout] : []));
    row.append(label, control, unit, badge);
    form.append(row);
  }

  const reset = el("button", { type: "button" }, "기본값으로 되돌리기");
  reset.addEventListener("click", () => {
    for (const [id, f] of Object.entries(fields)) {
      const p = data.params[id];
      values[id] = p.value;
      delete notes[id];
      f.input.value = String(p.value ?? "");
      if (f.readout) f.readout.textContent = String(p.value);
      paintBadge(id, p.status);
    }
    resetListeners.forEach((fn) => fn());
    emit();
  });

  container.replaceChildren(heading, form, reset);
  emit();

  return {
    setValue(id, value, note) {
      const f = fields[id];
      if (!f) throw new Error(`알 수 없는 입력 항목: ${id}`);
      values[id] = value;
      f.input.value = String(value);
      if (f.readout) f.readout.textContent = String(value);
      if (note) notes[id] = note;
      else delete notes[id];
      paintBadge(id, note ? note.status : "user");
      emit();
    },
    clearNote(id) {
      if (!(id in notes)) return;
      delete notes[id];
      paintBadge(id, "user");
      emit();
    },
    setValues(map) {
      for (const [id, v] of Object.entries(map)) {
        const f = fields[id];
        if (!f) continue;
        values[id] = v;
        delete notes[id];
        f.input.value = String(v);
        if (f.readout) f.readout.textContent = String(v);
        paintBadge(id, Object.is(v, data.params[id].value) ? data.params[id].status : "user");
      }
      emit();
    },
    onUserEdit(fn) {
      editListeners.push(fn);
    },
    onReset(fn) {
      resetListeners.push(fn);
    },
  };
}
