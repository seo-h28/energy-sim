// 우주 비교 사고실험 화면(spec 5.3, 8차 C안). 위쪽에 "SIMULATION · 사고실험 · 입력값은 가정"을 항상 보여 준다.
// 하는 일: ① 지상(부산)과 정지궤도 1 m²가 1년에 받는 입사 에너지 비교, ② 지상과 같은 발전 단가가 되려면 송전 효율별로
// 설비 비용이 얼마 이하여야 하는지(목표치) 곡선. 우주 설비의 비용·효율·실현 가능성은 예측하지 않는다. 계산은 src/core/space.js.
import { readTheme } from "./theme.js";
import { STATUS_LABELS } from "../core/assumptions.js";
import { SPACE_CONSTANTS, GEO_ECLIPSE_MAX_LOSS, allowedCost, allowedCostCurve, solarFluxAtAu, spaceAnnualIncident } from "../core/space.js";
import { el, fmt } from "./dom.js";

const T = readTheme();
const COLORS = { line: T.primary, marker: T.dark, grid: T.grid, text: T.text, panel: T.panel };

const won = (/** @type {number} */ n) => `${fmt(n)}원`;
const num = (/** @type {number} */ n, d = 0) => fmt(n, d);

/** 상태 배지 글자와 클래스(가정 패널과 같은 모양) */
function badge(/** @type {"sourced" | "reference" | "assumed" | "user"} */ status) {
  return el("span", { class: `badge badge-${status}` }, STATUS_LABELS[status]);
}

/**
 * @typedef {Object} SpaceArgs
 * @property {number | null} lcoeKrwPerKwh   지상 설계의 LCOE(계산값). 계산할 수 없으면 null
 * @property {number} priceKrwPerKwh          현재 입력 전기요금 단가(비교용)
 * @property {number | null} groundPoaKwhM2  지상 경사면 연 입사(PVGIS H(i)_y). 없으면 null
 * @property {number} tiltDeg
 * @property {number} degradationRate
 * @property {number} discountRate
 * @property {number} years
 */

/**
 * @param {HTMLElement} container
 * @returns {{ update(args: SpaceArgs): void, hide(): void }}
 */
export function createSpacePanel(container) {
  const Chart = /** @type {any} */ (window).Chart;
  if (!Chart) throw new Error("Chart.js를 불러오지 못했습니다(vendor/chart.umd.js 확인)");

  /** @type {SpaceArgs | null} */
  let last = null;

  // ── 입력: 패널 효율, 일조율(둘 다 임의 가정), 송전 효율(곡선 위의 읽는 지점) ──
  const effInput = /** @type {HTMLInputElement} */ (el("input", { id: "space-eff", type: "number", min: "0.05", max: "1", step: "0.01", value: "0.2" }));
  const sunInput = /** @type {HTMLInputElement} */ (el("input", { id: "space-sun", type: "number", min: "0.5", max: "1", step: "0.001", value: "1" }));
  const etaInput = /** @type {HTMLInputElement} */ (el("input", { id: "space-eta", type: "range", min: "0", max: "100", step: "1", value: "50" }));
  const etaOut = el("output", { for: "space-eta", class: "quick-value" });
  const controls = el("div", { class: "space-controls" });
  const mk = (/** @type {string} */ label, /** @type {HTMLElement} */ input, /** @type {HTMLElement} */ status, /** @type {string} */ hint) => {
    const box = el("div", { class: "field" });
    box.append(el("label", { for: input.id }, label), status, input, el("span", { class: "unit" }, hint));
    return box;
  };
  controls.append(
    mk("패널 효율 (0~1)", effInput, badge("assumed"), "임의 가정"),
    mk("일조율 (0.5~1)", sunInput, badge("assumed"), "임의 가정, 1은 식 무시"),
  );
  const etaHead = el("div", { class: "quick-head" });
  etaHead.append(el("label", { for: "space-eta" }, "송전 효율 (곡선에서 읽을 지점)"), etaOut);
  const etaBox = el("div", { class: "quick-row" });
  etaBox.append(etaHead, etaInput);

  const banner = el("div", { class: "space-banner", role: "note" });
  banner.append(el("strong", {}, "SIMULATION · 사고실험 · 입력값은 가정"), el("span", { class: "space-badge" }, "Thought Experiment: Space Solar Power"));
  const intro = el("p", { class: "card-note" }, "같은 패널 1 m²가 대기와 밤이 없는 정지궤도에서 받는 에너지와 부산 지상에서 받는 에너지를 비교하고, 우주 태양광이 지상과 같은 발전 단가가 되려면 설비 비용이 얼마 이하여야 하는지(목표치)만 계산합니다. 우주 설비의 비용·효율·실현 가능성은 예측하지 않습니다.");
  const message = el("p", { class: "card-note" });
  const tableWrap = el("div", { class: "table-wrap" });
  const readout = el("p", { class: "space-readout" });
  const canvas = el("canvas", { role: "img", "aria-label": "송전 효율별 허용 설비 비용(목표치) 곡선" });
  const box = el("div", { class: "chart-box" });
  box.append(canvas);
  const constWrap = el("div", { class: "table-wrap" });
  const formulas = el("details", { class: "disclosure" });
  formulas.append(
    el("summary", {}, "계산식"),
    ...[
      "태양 복사 플럭스 S = L ÷ (4π r²)  (L: 태양 광도, r: 태양까지 거리 ≈ 1 au)",
      "우주 1 m²의 연 입사 에너지 = S × 8760 h × 일조율 ÷ 1000   [kWh/m²/년]",
      "지상 1 m²의 연 입사 에너지 = PVGIS 경사면 일사 H(i)_y (현재 경사각, 표의 칸 사이는 직선 보간)",
      "연 도착량 E_d(η) = S × 패널 효율 × 8760 h × 일조율 × 송전 효율 η ÷ 1000   [kWh/m²/년, 1년차]",
      "허용 설비 비용 C_max(η) = LCOE_지상 × Σ_{t=1..N} E_d × (1 − 효율저하)^(t−1) ÷ (1 + r)^t   [원/m², 우주 쪽 유지비는 0으로 단순화]",
      "LCOE_지상 = (순 투자비 + Σ 유지비 ÷ (1+r)^t) ÷ Σ 발전량(t) ÷ (1+r)^t  (이 계산기의 현재 설계)",
    ].map((t) => el("p", { class: "formula-line" }, t)),
  );
  const limits = el("ul", { class: "curve-bullets" });
  limits.append(
    ...[
      "우주 설비의 제작·발사·송전 비용과 송전 효율은 대규모로 만들어진 적이 없어 모르는 값입니다. 그래서 예측하지 않고, 지상과 같은 단가가 되기 위한 조건(목표치)만 계산합니다. 곡선 아래의 비용으로 만들 수 있어야 한다는 뜻이지 그렇게 만들 수 있다는 뜻이 아닙니다.",
      "정지궤도(GEO)로 한정했습니다. 저궤도(ISS 등)는 궤도마다 지구 그림자에 들어가 24시간 발전 조건에 해당하지 않습니다.",
      "렉테나(지상 수신 안테나) 부지 면적, 면적당 질량(kg당 허용 비용), 발사 횟수는 넣지 않았습니다.",
      "지상 쪽 기준 단가(LCOE)는 이 계산기에 입력한 가정(설치비, 효율저하, 할인율 등)에 따라 달라지고, 그 값 대부분은 임의 가정입니다.",
      "이 모드는 지상 태양광과 비교하기 위한 이론적 사고실험입니다. 우주 태양광의 비용이나 효율을 예측하지 않으며, '지상과 같은 단가가 되려면 필요한 조건(목표치)'만 계산합니다.",
    ].map((t) => el("li", {}, t)),
  );
  container.replaceChildren(el("h2", {}, "우주 비교: 대기와 밤이 없다면"), banner, intro, message, tableWrap, el("h3", { class: "sub-heading" }, "지상과 같은 단가가 되려면: 허용 설비 비용(목표치)"), controls, etaBox, readout, box, el("h3", { class: "sub-heading" }, "쓴 값과 출처 상태"), constWrap, formulas, el("h3", { class: "sub-heading" }, "하지 않는 것과 한계"), limits);

  const chart = new Chart(canvas, {
    data: {
      datasets: [
        { type: "line", label: "허용 설비 비용 (원/m²)", data: [], parsing: false, borderColor: COLORS.line, backgroundColor: COLORS.line, borderWidth: 3, pointRadius: 0, tension: 0 },
        { type: "scatter", label: "읽는 지점", data: [], parsing: false, backgroundColor: COLORS.marker, borderColor: COLORS.panel, borderWidth: 2, pointStyle: "rectRot", pointRadius: 8 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { type: "linear", min: 0, max: 100, title: { display: true, text: "송전 효율 (%)", color: COLORS.text }, grid: { color: COLORS.grid }, ticks: { color: COLORS.text } },
        y: { beginAtZero: true, title: { display: true, text: "허용 설비 비용 (원/m²)", color: COLORS.text }, grid: { color: COLORS.grid }, ticks: { color: COLORS.text, callback: (/** @type {any} */ v) => fmt(Number(v)) } },
      },
      plugins: {
        legend: { labels: { color: COLORS.text, usePointStyle: true } },
        tooltip: { backgroundColor: COLORS.panel, borderColor: COLORS.grid, borderWidth: 1, titleColor: COLORS.text, bodyColor: COLORS.text, callbacks: { label: (/** @type {any} */ c) => `송전 효율 ${num(c.parsed.x)}% → ${won(c.parsed.y)}/m²` } },
      },
    },
  });

  function readInputs() {
    const eff = effInput.valueAsNumber;
    const sun = sunInput.valueAsNumber;
    return { eff, sun, eta: etaInput.valueAsNumber / 100 };
  }

  function render() {
    if (!last) return;
    const a = last;
    const { eff, sun, eta } = readInputs();
    etaOut.textContent = `${num(eta * 100)}%`;
    const flux = solarFluxAtAu();
    const okInputs = eff > 0 && eff <= 1 && sun > 0 && sun <= 1;
    const spaceInc = okInputs ? spaceAnnualIncident(flux, sun) : NaN;

    // 비교표 (spec 5.3 D)
    const table = el("table", { class: "season-table space-table" });
    const head = el("tr");
    for (const h of ["항목", `지상 (부산, 경사 ${num(a.tiltDeg)}°)`, "우주 (정지궤도 가정)"]) head.append(el("th", {}, h));
    table.append(head);
    const row = (/** @type {string} */ name, /** @type {string} */ ground, /** @type {string} */ space) => {
      const tr = el("tr");
      tr.append(el("th", { scope: "row" }, name), el("td", {}, ground), el("td", {}, space));
      table.append(tr);
    };
    row("1 m²가 받는 연 입사 에너지", a.groundPoaKwhM2 === null ? "-" : `${num(a.groundPoaKwhM2)} kWh/m²`, okInputs ? `${num(spaceInc)} kWh/m²` : "입력 확인 필요");
    row("하루 평균", a.groundPoaKwhM2 === null ? "-" : `${num(a.groundPoaKwhM2 / 365, 2)} kWh/m²`, okInputs ? `${num(spaceInc / 365, 2)} kWh/m²` : "-");
    row("지상 대비", "1배", okInputs && a.groundPoaKwhM2 ? `${num(spaceInc / a.groundPoaKwhM2, 2)}배` : "-");
    row("사용 지점까지의 손실", "없음(현장 소비)", "× 송전 효율 η (아래 곡선의 가로축)");
    row("비용", a.lcoeKrwPerKwh === null ? "계산할 수 없음" : `설계 LCOE ${num(a.lcoeKrwPerKwh, 1)}원/kWh (입력 전기요금 ${num(a.priceKrwPerKwh)}원/kWh)`, "예측하지 않음 (목표치만 계산)");
    tableWrap.replaceChildren(table);
    message.textContent = a.groundPoaKwhM2 === null ? "지상 경사면 입사 자료를 찾지 못했습니다(경사각 확인)." : "입사 에너지는 같은 면적(1 m²)이 받는 빛의 양이며 패널 효율을 곱하기 전의 값입니다. 우주 쪽은 일조율 1이면 약 6.5배입니다(지상은 대기·구름·밤, 우주는 식만 있음).";

    // 곡선과 읽는 지점
    if (a.lcoeKrwPerKwh === null || !okInputs) {
      readout.textContent = a.lcoeKrwPerKwh === null ? "지상 설계의 단가(LCOE)를 계산할 수 없어 목표치를 보여 줄 수 없습니다(설치 용량 0 등)." : "패널 효율은 0 초과 1 이하, 일조율은 0 초과 1 이하여야 합니다.";
      chart.data.datasets[0].data = [];
      chart.data.datasets[1].data = [];
      chart.update();
      box.hidden = true;
    } else {
      box.hidden = false;
      const target = { lcoeKrwPerKwh: a.lcoeKrwPerKwh, fluxWm2: flux, panelEfficiency: eff, sunlightFraction: sun, degradationRate: a.degradationRate, discountRate: a.discountRate, years: a.years };
      const curve = allowedCostCurve(target, 20);
      const at = allowedCost(target, eta);
      chart.data.datasets[0].data = curve.map((p) => ({ x: p.etaTx * 100, y: p.maxCostKrwPerM2 }));
      chart.data.datasets[1].data = [{ x: eta * 100, y: at.maxCostKrwPerM2 }];
      chart.update();
      readout.textContent = `송전 효율 ${num(eta * 100)}%, 패널 효율 ${num(eff * 100)}%, 일조율 ${fmt(sun, 3)}이면 1 m²가 1년에 도착시키는 전기는 ${num(at.deliveredKwhPerM2Year)} kWh입니다. 지상 설계의 단가(${num(a.lcoeKrwPerKwh, 1)}원/kWh)와 같아지려면 설비 비용(제작·발사·설치 합)이 1 m²당 ${won(at.maxCostKrwPerM2)} 이하여야 합니다.`;
      canvas.setAttribute("aria-label", `송전 효율별 허용 설비 비용 곡선. ${readout.textContent}`);
    }

    // 쓴 값과 출처 상태
    const ct = el("table", { class: "season-table space-table" });
    const ch = el("tr");
    for (const h of ["값", "현재 값", "상태", "출처·설명"]) ch.append(el("th", {}, h));
    ct.append(ch);
    const crow = (/** @type {string} */ name, /** @type {string} */ value, /** @type {"sourced" | "reference" | "assumed" | "user"} */ status, /** @type {string} */ note) => {
      const tr = el("tr");
      const st = el("td");
      st.append(badge(status));
      tr.append(el("th", { scope: "row" }, name), el("td", {}, value), st, el("td", { class: "space-note" }, note));
      ct.append(tr);
    };
    crow("태양 광도 L", `${SPACE_CONSTANTS.solarLuminosityW.toExponential(3)} W`, "reference", "IAU 2015 결의 B3의 공칭값(2차 출처로 확인, docs/sources.md)");
    crow("천문단위 au", `${num(SPACE_CONSTANTS.astronomicalUnitM)} m`, "reference", "IAU 2012 결의 B2가 정의한 정확한 값(2차 출처로 확인)");
    crow("태양 복사 플럭스 S", `${fmt(flux, 1)} W/m²`, "reference", "L ÷ (4π r²)로 계산. 대기권 밖 태양상수(IAU 공칭 1361, 측정 1360.8±0.5, Kopp & Lean 2011)와 일치. 지상 값이 아님");
    crow("정지궤도 거리", "≈ 1 au", "reference", "고도 35,786 km(반지름 42,164 km)는 태양까지 거리 1 au에 비해 무시할 수 있어 같은 거리로 둠");
    crow("지상 연 입사 에너지", a.groundPoaKwhM2 === null ? "-" : `${num(a.groundPoaKwhM2)} kWh/m²`, "sourced", "PVGIS-ERA5 부산(35.18N 129.07E), 정남향 경사면 H(i)_y, 2005~2023 평균");
    crow("일조율", fmt(sun, 3), "assumed", `1은 지구 그림자(식)를 무시한 단순화. 식은 춘분·추분 무렵 하루 최대 72분(NOAA), 각 45~48일 정도라 최대 손실은 약 ${fmt(GEO_ECLIPSE_MAX_LOSS * 100, 1)}%(계산값)`);
    crow("패널 효율", `${fmt(eff * 100, 1)}%`, "assumed", "출처를 확인하지 못한 임의 가정");
    crow("송전 효율 η", "곡선의 가로축(0~100%)", "assumed", "알려진 값이 없어 한 값으로 정하지 않고 전 범위를 보여 줌");
    crow("지상 기준 단가 LCOE", a.lcoeKrwPerKwh === null ? "-" : `${num(a.lcoeKrwPerKwh, 1)}원/kWh`, "assumed", "이 계산기의 현재 설계에서 계산(입력 가정이 임의 가정이면 이 값도 그에 의존)");
    crow("우주 쪽 유지비", "0원 (단순화)", "assumed", "실제로는 0이 아니라 허용 비용이 더 낮아짐");
    constWrap.replaceChildren(ct);
    container.hidden = false;
  }

  for (const input of [effInput, sunInput]) input.addEventListener("change", render);
  etaInput.addEventListener("input", render);

  return {
    update(args) {
      last = args;
      render();
    },
    hide() {
      container.hidden = true;
    },
  };
}
