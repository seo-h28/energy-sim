// 월별 사용량 입력 패널: 1~12월 전기 사용량(kWh)을 칸으로 보여주고, 바뀔 때마다 알려준다.
// 기본값은 임의 가정 예시이며, 고지서 값을 칸에 직접 쓰거나 12개를 한꺼번에 붙여 넣을 수 있다.
import { STATUS_LABELS } from "../core/assumptions.js";
import { parseUsageText } from "../core/monthly-data.js";
import { el, fmt } from "./dom.js";

/**
 * @param {HTMLElement} container
 * @param {{ usage: number[], meta: any }} example  사용량 예시 파일(되돌리기 기준)
 * @param {(usage: number[], isExample: boolean) => void} onChange
 * @returns {{ setUsage(values: number[]): void }}
 */
export function renderUsagePanel(container, example, onChange) {
  /** @type {number[]} */
  let usage = [...example.usage];
  let isExample = true;

  const badge = el("span", { class: "badge badge-assumed", title: example.meta.source }, "");
  const total = el("p", { class: "usage-total" });
  const message = el("p", { class: "usage-message", role: "status" });
  const grid = el("div", { class: "usage-grid" });
  /** @type {HTMLInputElement[]} */
  const inputs = [];

  function paint() {
    const status = isExample ? "assumed" : "user";
    badge.className = `badge badge-${status}`;
    badge.textContent = isExample ? `${STATUS_LABELS.assumed} 예시` : STATUS_LABELS.user;
    const sum = usage.reduce((a, b) => a + b, 0);
    total.textContent = Number.isFinite(sum) ? `연 합계 ${fmt(sum)} kWh (월 평균 ${fmt(sum / 12)} kWh)` : "연 합계: 비어 있는 칸이 있습니다";
  }

  for (let i = 0; i < 12; i++) {
    const input = /** @type {HTMLInputElement} */ (el("input", { id: `usage-${i + 1}`, type: "number", min: "0", step: "any" }));
    input.value = String(usage[i]);
    input.addEventListener("input", () => {
      usage[i] = input.valueAsNumber; // 칸이 비면 NaN -> 계산 쪽 검사가 한글 오류로 알려 준다
      isExample = false;
      message.textContent = "";
      paint();
      onChange([...usage], isExample);
    });
    inputs.push(input);
    const cell = el("div", { class: "usage-cell" });
    cell.append(el("label", { for: input.id }, `${i + 1}월`), input);
    grid.append(cell);
  }

  const paste = /** @type {HTMLTextAreaElement} */ (el("textarea", { id: "usage-paste", rows: "2", placeholder: "고지서 12개월 값을 한꺼번에 붙여 넣기 (예: 280 260 240 … 1월부터 12월 순서)" }));
  const apply = el("button", { type: "button" }, "붙여 넣은 값 적용");
  apply.addEventListener("click", () => {
    const r = parseUsageText(paste.value);
    if ("error" in r) {
      message.textContent = r.error;
      return;
    }
    usage = r.values;
    isExample = false;
    inputs.forEach((inp, i) => (inp.value = String(usage[i])));
    message.textContent = "적용했습니다.";
    paint();
    onChange([...usage], isExample);
  });
  const reset = el("button", { type: "button" }, "예시값으로 되돌리기");
  reset.addEventListener("click", () => {
    usage = [...example.usage];
    isExample = true;
    inputs.forEach((inp, i) => (inp.value = String(usage[i])));
    paste.value = "";
    message.textContent = "";
    paint();
    onChange([...usage], isExample);
  });

  const head = el("div", { class: "usage-head" });
  head.append(el("h2", {}, "월별 전기 사용량 (kWh)"), badge);
  const actions = el("div", { class: "usage-actions" });
  actions.append(apply, reset);
  container.replaceChildren(
    head,
    el("p", { class: "card-note" }, `${example.meta.label}. ${example.meta.source}`),
    grid,
    total,
    paste,
    actions,
    message,
  );
  paint();
  onChange([...usage], isExample);

  return {
    /** 공유 링크 복원용: 12개 값을 넣는다(예시와 같으면 예시 상태로) */
    setUsage(values) {
      usage = [...values];
      isExample = usage.every((v, i) => v === example.usage[i]);
      inputs.forEach((inp, i) => (inp.value = String(usage[i])));
      message.textContent = "";
      paint();
      onChange([...usage], isExample);
    },
  };
}
