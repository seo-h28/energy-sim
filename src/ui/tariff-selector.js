// 요금제 선택: 한전 요금표로 전기요금을 정한다. 두 가지 계산 방식이 있다.
//  - 월별 요금표(기본): 달마다 사용량으로 누진·계절 요금을 계산한다(billing.js). 태양광의 절감 = 요금(사용량) − 요금(사용량 − 자가소비).
//  - 한 단가: 요금표에서 "자가소비로 아끼는 전기 1kWh의 단가" 하나를 뽑아 전기요금 입력칸에 채운다(주택용은 단계를 고름).
// 사용자가 요금 칸을 직접 고치거나 "기본값으로 되돌리기"를 누르면 "직접 입력"으로 돌아간다(이때는 한 단가).
import { STATUS_LABELS } from "../core/assumptions.js";
import { describePrice, effectivePriceKrwPerKwh } from "../core/tariff.js";
import { buildMonthlyBilling, describeBilling } from "../core/billing.js";
import { el, fmt } from "./dom.js";

const PRICE_ID = "electricity_price_krw_per_kwh";
const MANUAL = "manual";
const METHOD_BILL = "bill";
const METHOD_SINGLE = "single";

/**
 * @typedef {{ id: string, tier: number, c: number, f: number, b: 0 | 1, i: 0 | 1 }} TariffState
 */

/**
 * @param {HTMLElement} container
 * @param {any} tariffData  data/tariffs.json
 * @param {import("./input-panel.js").InputController} controller
 * @returns {{ getState(): TariffState | null, setState(s: { id: string, tier: number, c: number, f: number, b?: 0 | 1, i?: 0 | 1 } | null): boolean, getBilling(): import("../core/billing.js").MonthBilling[] | null, onChange(fn: () => void): void }}
 */
export function renderTariffSelector(container, tariffData, controller) {
  /** @type {any[]} */
  const tariffs = tariffData.tariffs;
  /** @type {(() => void)[]} */
  const handlers = [];
  let ready = false;

  const select = /** @type {HTMLSelectElement} */ (el("select", { id: "tariff-select" }));
  select.append(el("option", { value: MANUAL }, "직접 입력(요금 칸에 값을 직접 씀)"));
  for (const t of tariffs) select.append(el("option", { value: t.id }, t.label));

  const methodSelect = /** @type {HTMLSelectElement} */ (el("select", { id: "tariff-method" }));
  methodSelect.append(el("option", { value: METHOD_BILL }, "월별 요금표로 계산 (누진·계절 반영)"), el("option", { value: METHOD_SINGLE }, "한 단가로 계산 (아래 단계의 단가)"));
  const methodRow = el("div", { class: "field" });
  methodRow.append(el("label", { for: "tariff-method" }, "계산 방식"), methodSelect);

  const tierSelect = /** @type {HTMLSelectElement} */ (el("select", { id: "tariff-tier" }));
  const tierRow = el("div", { class: "field" });
  tierRow.append(el("label", { for: "tariff-tier" }, "단계(주택용)"), tierSelect);

  const basicInput = /** @type {HTMLInputElement} */ (el("input", { id: "tariff-basic", type: "checkbox" }));
  basicInput.checked = true;
  const basicRow = el("div", { class: "field" });
  basicRow.append(el("label", { for: "tariff-basic" }, "주택용 기본요금(단계별) 포함"), basicInput);

  const adderInputs = {};
  const adderRows = [];
  for (const key of ["climateKrwPerKwh", "fuelAdjustmentKrwPerKwh"]) {
    const a = tariffData.adders[key];
    const input = /** @type {HTMLInputElement} */ (el("input", { id: `adder-${key}`, type: "number", step: "any", min: "0" }));
    input.value = String(a.value);
    const row = el("div", { class: "field" });
    row.append(
      el("label", { for: input.id }, a.label),
      input,
      el("span", { class: "unit" }, a.unit),
      el("span", { class: `badge badge-${a.status}`, title: a.source }, STATUS_LABELS[a.status]),
    );
    adderInputs[key] = input;
    adderRows.push(row);
  }

  const readout = el("p", { class: "card-note" });
  const form = el("div", { class: "input-grid" });
  const selectRow = el("div", { class: "field" });
  selectRow.append(el("label", { for: "tariff-select" }, "요금제"), select);
  form.append(selectRow, methodRow, tierRow, basicRow, ...adderRows);
  container.replaceChildren(el("h2", {}, "요금제 선택"), form, readout);

  function currentAdders() {
    return {
      climateKrwPerKwh: adderInputs.climateKrwPerKwh.valueAsNumber,
      fuelAdjustmentKrwPerKwh: adderInputs.fuelAdjustmentKrwPerKwh.valueAsNumber,
      vatRate: tariffData.adders.vatRate.value,
      fundRate: tariffData.adders.fundRate.value,
    };
  }

  const addersValid = () => {
    const a = currentAdders();
    return Number.isFinite(a.climateKrwPerKwh) && Number.isFinite(a.fuelAdjustmentKrwPerKwh);
  };

  function notify() {
    if (ready) for (const fn of handlers) fn();
  }

  function refresh() {
    const tariff = tariffs.find((t) => t.id === select.value);
    const manual = !tariff;
    const bill = !manual && methodSelect.value === METHOD_BILL;
    methodRow.hidden = manual;
    tierRow.hidden = manual || tariff.kind !== "tiered" || bill;
    basicRow.hidden = !bill || tariff.kind !== "tiered";
    adderRows.forEach((r) => (r.hidden = manual));
    if (manual) {
      readout.textContent = "요금 칸의 값을 직접 정합니다(기본값은 임의 가정). 한 단가로 계산합니다.";
      notify();
      return;
    }
    if (tariff.kind === "tiered" && tierSelect.options.length !== tariff.tiers.length) {
      tierSelect.replaceChildren(...tariff.tiers.map((x, i) => el("option", { value: String(i) }, `${x.label} (${fmt(x.energyKrwPerKwh, 1)}원/kWh)`)));
      tierSelect.value = "1";
    }
    const adders = currentAdders();
    if (!addersValid()) {
      readout.textContent = "기후환경요금·연료비조정요금 칸에 숫자를 넣어 주세요.";
      notify();
      return;
    }
    const tierIndex = tariff.kind === "tiered" ? Number(tierSelect.value) : 0;
    const single = describePrice(tariff, adders, tierIndex);
    const billText = describeBilling(tariff, { includeBasic: basicInput.checked });
    const extra = `기후환경요금 ${fmt(adders.climateKrwPerKwh, 1)}원 + 연료비조정요금 ${fmt(adders.fuelAdjustmentKrwPerKwh, 1)}원을 단가에 더하고 부가세 10%·기반기금 3.2%(× ${Number((1 + adders.vatRate + adders.fundRate).toFixed(4))})를 곱합니다. 한전 요금표 2024-07-01 시행 값(현재 시행 여부 미확인).`;
    controller.setValue(PRICE_ID, effectivePriceKrwPerKwh(tariff, adders, tierIndex), {
      status: "reference",
      source: bill ? `월별 요금표로 계산 중이라 이 칸은 계산에 쓰이지 않습니다(참고용 한 단가). ${single}` : single,
    });
    readout.textContent = bill ? `${billText} ${extra}` : single;
    notify();
  }

  select.addEventListener("change", () => {
    if (select.value === MANUAL) controller.clearNote(PRICE_ID);
    refresh();
  });
  methodSelect.addEventListener("change", refresh);
  basicInput.addEventListener("change", refresh);
  tierSelect.addEventListener("change", refresh);
  Object.values(adderInputs).forEach((i) => i.addEventListener("input", refresh));

  controller.onUserEdit((id) => {
    if (id !== PRICE_ID || select.value === MANUAL) return;
    select.value = MANUAL;
    refresh();
  });
  controller.onReset(() => {
    select.value = MANUAL;
    methodSelect.value = METHOD_BILL;
    basicInput.checked = true;
    for (const key of Object.keys(adderInputs)) adderInputs[key].value = String(tariffData.adders[key].value);
    tierSelect.replaceChildren();
    refresh();
  });

  refresh();
  ready = true;

  return {
    /** 요금제를 골랐으면 그 상태(공유 링크용), 직접 입력이면 null */
    getState() {
      if (select.value === MANUAL) return null;
      return {
        id: select.value,
        tier: Number(tierSelect.value) || 0,
        c: adderInputs.climateKrwPerKwh.valueAsNumber,
        f: adderInputs.fuelAdjustmentKrwPerKwh.valueAsNumber,
        b: methodSelect.value === METHOD_BILL ? 1 : 0,
        i: basicInput.checked ? 1 : 0,
      };
    },
    /** 요금제 상태를 되살린다. null이면 직접 입력으로 돌린다. 모르는 요금제 id면 아무것도 바꾸지 않고 false. b가 없는 옛 링크는 한 단가 방식 */
    setState(s) {
      if (s === null) {
        select.value = MANUAL;
        controller.clearNote(PRICE_ID);
        refresh();
        return true;
      }
      const tariff = tariffs.find((t) => t.id === s.id);
      if (!tariff) return false;
      select.value = s.id;
      methodSelect.value = s.b === 1 ? METHOD_BILL : METHOD_SINGLE;
      basicInput.checked = s.i !== 0;
      refresh(); // 단계 목록을 먼저 만든다
      if (tariff.kind === "tiered" && s.tier < tierSelect.options.length) tierSelect.value = String(s.tier);
      adderInputs.climateKrwPerKwh.value = String(s.c);
      adderInputs.fuelAdjustmentKrwPerKwh.value = String(s.f);
      refresh();
      return true;
    },
    /** 월별 요금표 계산을 쓰고 있으면 12개월 요금표, 아니면 null(한 단가) */
    getBilling() {
      const tariff = tariffs.find((t) => t.id === select.value);
      if (!tariff || methodSelect.value !== METHOD_BILL || !addersValid()) return null;
      return buildMonthlyBilling(tariff, currentAdders(), { includeBasic: basicInput.checked });
    },
    /** 계산 방식·요금제 설정이 바뀔 때 부를 함수 등록 */
    onChange(fn) {
      handlers.push(fn);
    },
  };
}
