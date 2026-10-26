// 요금제 선택: 한전 요금표에서 "자가소비로 아끼는 전기 1kWh의 단가"를 뽑아 전기요금 입력칸에 채운다.
// 사용자가 요금 칸을 직접 고치거나 "기본값으로 되돌리기"를 누르면 "직접 입력"으로 돌아간다.
import { STATUS_LABELS } from "../core/assumptions.js";
import { describePrice, effectivePriceKrwPerKwh } from "../core/tariff.js";
import { el, fmt } from "./dom.js";

const PRICE_ID = "electricity_price_krw_per_kwh";
const MANUAL = "manual";

/**
 * @param {HTMLElement} container
 * @param {any} tariffData  data/tariffs.json
 * @param {import("./input-panel.js").InputController} controller
 * @returns {{ getState(): { id: string, tier: number, c: number, f: number } | null, setState(s: { id: string, tier: number, c: number, f: number }): boolean }}
 */
export function renderTariffSelector(container, tariffData, controller) {
  /** @type {any[]} */
  const tariffs = tariffData.tariffs;

  const select = /** @type {HTMLSelectElement} */ (el("select", { id: "tariff-select" }));
  select.append(el("option", { value: MANUAL }, "직접 입력(요금 칸에 값을 직접 씀)"));
  for (const t of tariffs) select.append(el("option", { value: t.id }, t.label));

  const tierSelect = /** @type {HTMLSelectElement} */ (el("select", { id: "tariff-tier" }));
  const tierRow = el("div", { class: "field" });
  tierRow.append(el("label", { for: "tariff-tier" }, "단계(주택용)"), tierSelect);

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
  form.append(selectRow, tierRow, ...adderRows);
  container.replaceChildren(el("h2", {}, "요금제 선택"), form, readout);

  function currentAdders() {
    return {
      climateKrwPerKwh: adderInputs.climateKrwPerKwh.valueAsNumber,
      fuelAdjustmentKrwPerKwh: adderInputs.fuelAdjustmentKrwPerKwh.valueAsNumber,
      vatRate: tariffData.adders.vatRate.value,
      fundRate: tariffData.adders.fundRate.value,
    };
  }

  function refresh() {
    const tariff = tariffs.find((t) => t.id === select.value);
    const manual = !tariff;
    tierRow.hidden = manual || tariff.kind !== "tiered";
    adderRows.forEach((r) => (r.hidden = manual));
    if (manual) {
      readout.textContent = "요금 칸의 값을 직접 정합니다(기본값은 임의 가정).";
      return;
    }
    if (tariff.kind === "tiered" && tierSelect.options.length !== tariff.tiers.length) {
      tierSelect.replaceChildren(...tariff.tiers.map((x, i) => el("option", { value: String(i) }, `${x.label} (${fmt(x.energyKrwPerKwh, 1)}원/kWh)`)));
      tierSelect.value = "1";
    }
    const adders = currentAdders();
    if (!Number.isFinite(adders.climateKrwPerKwh) || !Number.isFinite(adders.fuelAdjustmentKrwPerKwh)) {
      readout.textContent = "기후환경요금·연료비조정요금 칸에 숫자를 넣어 주세요.";
      return;
    }
    const tierIndex = tariff.kind === "tiered" ? Number(tierSelect.value) : 0;
    controller.setValue(PRICE_ID, effectivePriceKrwPerKwh(tariff, adders, tierIndex), {
      status: "reference",
      source: describePrice(tariff, adders, tierIndex),
    });
    readout.textContent = describePrice(tariff, adders, tierIndex);
  }

  select.addEventListener("change", () => {
    if (select.value === MANUAL) controller.clearNote(PRICE_ID);
    refresh();
  });
  tierSelect.addEventListener("change", refresh);
  Object.values(adderInputs).forEach((i) => i.addEventListener("input", refresh));

  controller.onUserEdit((id) => {
    if (id !== PRICE_ID || select.value === MANUAL) return;
    select.value = MANUAL;
    refresh();
  });
  controller.onReset(() => {
    select.value = MANUAL;
    for (const key of Object.keys(adderInputs)) adderInputs[key].value = String(tariffData.adders[key].value);
    tierSelect.replaceChildren();
    refresh();
  });

  refresh();

  return {
    /** 요금제를 골랐으면 그 상태(공유 링크용), 직접 입력이면 null */
    getState() {
      if (select.value === MANUAL) return null;
      return {
        id: select.value,
        tier: Number(tierSelect.value) || 0,
        c: adderInputs.climateKrwPerKwh.valueAsNumber,
        f: adderInputs.fuelAdjustmentKrwPerKwh.valueAsNumber,
      };
    },
    /** 요금제 상태를 되살린다. 모르는 요금제 id면 아무것도 바꾸지 않고 false */
    setState(s) {
      const tariff = tariffs.find((t) => t.id === s.id);
      if (!tariff) return false;
      select.value = s.id;
      refresh(); // 단계 목록을 먼저 만든다
      if (tariff.kind === "tiered" && s.tier < tierSelect.options.length) tierSelect.value = String(s.tier);
      adderInputs.climateKrwPerKwh.value = String(s.c);
      adderInputs.fuelAdjustmentKrwPerKwh.value = String(s.f);
      refresh();
      return true;
    },
  };
}
