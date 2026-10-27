// 앱 시작점: 데이터를 불러와 입력 패널·월별 사용량·결과·그래프·가정 목록을 화면에 띄우고, 입력이 바뀔 때마다 다시 계산한다.
import { loadAssumptions } from "../core/assumptions.js";
import { PARAM_TO_INPUT } from "../core/params.js";
import { summarizeRange, seasonSummary } from "../core/seasonal.js";
import { loadMonthlyUsage, loadTiltTable } from "../core/monthly-data.js";
import { tiltProfile, poaAtTilt, BASE_TILT_DEG } from "../core/tilt.js";
import { buildEngineInput } from "../core/build-input.js";
import { flowTotals } from "../core/flow.js";
import { renderAssumptionsPanel } from "./assumptions-panel.js";
import { renderInputPanel } from "./input-panel.js";
import { loadTariffs } from "../core/tariff.js";
import { renderTariffSelector } from "./tariff-selector.js";
import { renderShareBar } from "./share-bar.js";
import { encodeShare, decodeShare, SHARE_PREFIX } from "../core/share.js";
import { renderUsagePanel } from "./usage-panel.js";
import { renderResultCards, renderRangeBoxes, renderResultPlaceholder } from "./result-cards.js";
import { initTabs } from "./tabs.js";
import { createQuickControls } from "./quick-controls.js";
import { renderBalance } from "./balance.js";
import { createCashflowChart } from "./chart.js";
import { createMonthlyChart } from "./monthly-chart.js";
import { createCapacityCurve } from "./capacity-curve.js";
import { createSensitivityPanel } from "./sensitivity-chart.js";
import { createSpacePanel } from "./space-panel.js";
import { createDesignPanel } from "./design-compare.js";
import { renderStory, renderGlossary } from "./visuals.js";
import { lcoeKrwPerKwh } from "../core/seasonal.js";
import { createSystemDiagram } from "./diagram.js";
import { SOURCE_GAP, ASOS_OVER_NASA } from "../core/uncertainty.js";
import { el, fmt } from "./dom.js";

const status = document.getElementById("status");

/** 개발용 시간 측정: 주소에 ?perf가 있을 때만 구간별 걸린 시간(ms)을 window.__perf에 모은다. 없으면 그냥 실행한다. */
const PERF = new URLSearchParams(location.search).has("perf");
if (PERF) /** @type {any} */ (window).__perf = {};
function timed(label, fn) {
  if (!PERF) return fn();
  const t0 = performance.now();
  const out = fn();
  const bag = /** @type {any} */ (window).__perf;
  (bag[label] ||= []).push(performance.now() - t0);
  return out;
}
const inputPanel = document.getElementById("input-panel");
const resultPanel = document.getElementById("result-panel");
const rangePanel = document.getElementById("range-panel");
const balancePanel = document.getElementById("balance-panel");
const storyPanel = document.getElementById("story-panel");
const errorBox = document.getElementById("errors");
const panel = document.getElementById("assumptions-panel");

/** 오류 문구에 영어 키가 붙어 나오는 항목들. 키 앞부분을 떼면 본문에 항목 이름이 이미 들어 있다 */
const ERROR_KEYS = new Set([...Object.values(PARAM_TO_INPUT), "analysisYears", "monthlyUsageKwh", "monthlyRatios", "dayShare", "dayShareLow", "dayShareHigh"]);

function friendlyErrors(errors) {
  return errors.map((msg) => {
    const key = msg.split(":")[0];
    const text = ERROR_KEYS.has(key) ? msg.slice(key.length + 1).trim() : msg;
    return text.replace("받은 값 NaN", "칸이 비어 있거나 숫자가 아님");
  });
}

/** 기본값 그대로이면서 출처를 확인하지 못한(assumed) 입력 개수 + 월별 사용량이 예시 그대로면 1 */
function countAssumed(values, data, usageIsExample) {
  const params = Object.keys(PARAM_TO_INPUT).filter((id) => {
    const p = data.params[id];
    return p && p.status === "assumed" && Object.is(values[id], p.value);
  }).length;
  return params + (usageIsExample ? 1 : 0);
}

/** 푸터: 데이터 불확실성과 한계. 숫자는 core/uncertainty.js의 값을 그대로 쓴다(문구와 계산이 어긋나지 않게) */
function renderFooter() {
  const footer = document.getElementById("site-footer");
  footer.replaceChildren(
    el(
      "p",
      {},
      `※ 본 시뮬레이터는 기상청 ASOS 실측값(부산 ${SOURCE_GAP.year}년 수평면 ${fmt(SOURCE_GAP.asosKwhM2)} kWh/m²)과 NASA POWER 위성 추정치(같은 해 ${fmt(SOURCE_GAP.nasaKwhM2)} kWh/m²) 사이에 약 ${fmt(ASOS_OVER_NASA * 100)}%의 데이터 소스 격차(ASOS가 높음)가 있음을 인식하며, 발전량을 NASA 수준으로 낮춘 경우를 '데이터 불확실성 범위'로 결과 카드 아래에 함께 계산해 보여 줍니다. 어느 쪽 값이 맞는지는 아직 확인하지 못했습니다.`,
    ),
    el("p", {}, "※ 요금·설치비·보조금은 시점과 조건에 따라 달라지며 기본값은 참고용입니다. 이 결과는 가정에 따른 계산이며 실제 설치 결정에는 전문가 견적과 현장 조사가 필요합니다."),
  );
}

try {
  renderFooter();
  const [data, tariffData, usageExample, tiltData] = await Promise.all([loadAssumptions(), loadTariffs(), loadMonthlyUsage(), loadTiltTable()]);
  // 경사각이 범위 밖이어서 표를 못 쓸 때 대신 두는 월 비율(이때는 입력 오류 문구가 따로 나온다)
  const fallbackRatios = /** @type {number[]} */ (tiltProfile(tiltData.table, BASE_TILT_DEG)?.ratios);

  const cashChart = createCashflowChart(document.getElementById("chart-panel"));
  const monthlyChart = createMonthlyChart(document.getElementById("monthly-panel"));
  const curve = createCapacityCurve(document.getElementById("curve-panel"));
  const sens = createSensitivityPanel(document.getElementById("sensitivity-panel"), () => recompute());
  const space = createSpacePanel(document.getElementById("space-panel"));
  renderGlossary(document.getElementById("glossary-panel"), { yieldKwhPerKwp: data.params.yield_kwh_per_kwp.value });
  /** @type {ReturnType<typeof createDesignPanel> | null} */
  let designPanel = null;
  const diagram = createSystemDiagram(document.getElementById("diagram-panel"));

  // 화면 상태: 입력칸 값, 값 설명(요금제 등), 월별 사용량
  const state = { values: /** @type {Record<string, number | null>} */ ({}), notes: {}, usage: [...usageExample.usage], usageIsExample: true };

  // 시작 때의 주소 조각을 먼저 저장한다. 첫 계산이 주소를 지워 버리기 전에 읽어야 공유 링크를 되살릴 수 있다
  const initialHash = location.hash;
  const shareBar = renderShareBar(document.getElementById("share-bar"));
  /** @type {ReturnType<typeof renderUsagePanel> | null} */
  let usagePanel = null;
  /** @type {ReturnType<typeof renderTariffSelector> | null} */
  let tariffSel = null;
  /** @type {ReturnType<typeof createQuickControls> | null} */
  let quick = null;
  let applying = true; // 시작 설정과 공유 링크를 되살리는 동안은 주소를 바꾸지 않는다

  /** 지금 화면을 링크용 상태로: 기본값과 다른 값만 담는다 */
  function buildShareState() {
    /** @type {Record<string, number>} */
    const p = {};
    for (const id of Object.keys(PARAM_TO_INPUT)) {
      const v = state.values[id];
      if (typeof v === "number" && Number.isFinite(v) && !Object.is(v, data.params[id].value)) p[id] = v;
    }
    const tariff = tariffSel?.getState() ?? null;
    if (tariff) delete p.electricity_price_krw_per_kwh; // 요금제로 계산된 값은 요금제 선택으로 다시 만든다
    /** @type {import("../core/share.js").ShareState} */
    const s = { p };
    if (!state.usageIsExample && state.usage.every(Number.isFinite)) s.u = [...state.usage];
    if (tariff && Number.isFinite(tariff.c) && Number.isFinite(tariff.f)) s.t = tariff;
    const m = curve.getMax();
    if (m !== null) s.m = m;
    return s;
  }

  function syncUrl() {
    if (applying) return;
    const enc = encodeShare(buildShareState());
    try {
      history.replaceState(null, "", location.pathname + location.search + enc);
    } catch {
      /* 주소를 바꿀 수 없는 환경(일부 미리보기)에서는 링크 복사만 못 쓴다 */
    }
    shareBar.refresh();
  }

  // 그래프(누적·월별·용량 곡선)는 한 번 갱신에 약 50 ms가 들어(측정: ?perf) 글자를 칠 때마다 다시 그리면 답답하다.
  // 숫자 카드·가정 표는 바로 갱신하고, 그래프는 입력이 잠시 멈췄을 때(HEAVY_DELAY_MS) 마지막 값으로 한 번만 갱신한다.
  const HEAVY_DELAY_MS = 120;
  /** @type {null | (() => void)} */
  let heavyJob = null;
  let heavyTimer = 0;
  function scheduleHeavy(job) {
    heavyJob = job;
    clearTimeout(heavyTimer);
    heavyTimer = setTimeout(flushHeavy, HEAVY_DELAY_MS);
  }
  function flushHeavy() {
    clearTimeout(heavyTimer);
    const job = heavyJob;
    heavyJob = null;
    if (job) job();
  }
  function cancelHeavy() {
    clearTimeout(heavyTimer);
    heavyJob = null;
  }

  function recompute() {
    // 경사각에 맞는 월별 발전 비율·연 발전량 보정(PVGIS 표)을 적용한 엔진 입력과 입력 검사(민감도 분석과 같은 변환)
    // 월별 요금표(누진·계절) 방식이면 12개월 요금표를 엔진에 넘긴다. 아니면 단일 단가
    const billing = tariffSel?.getBilling() ?? null;
    const { input, dayShareLow, dayShareHigh, errors } = buildEngineInput(state.values, state.usage, tiltData.table, fallbackRatios, billing);
    // 같은 오류가 두 번 나오지 않게(낮시간 비중은 두 검사 모두 보지만 한 번만 보여준다)
    const unique = [...new Set(friendlyErrors(errors))];
    errorBox.replaceChildren(...unique.map((msg) => el("li", {}, msg)));
    timed("가정 패널", () => renderAssumptionsPanel(panel, data, state.values, state.notes));
    quick?.sync(state.values);
    if (errors.length) {
      renderResultPlaceholder(resultPanel);
      rangePanel.replaceChildren();
      balancePanel.hidden = true;
      storyPanel.hidden = true;
      cancelHeavy();
      cashChart.hide();
      monthlyChart.hide();
      curve.hide();
      sens.hide();
      space.hide();
      designPanel?.refresh();
      diagram.hide();
      syncUrl();
      return;
    }
    const { dayShare: _unused, ...withoutShare } = input;
    const range = timed("계산(범위)", () => summarizeRange(withoutShare, dayShareLow, dayShareHigh));
    const base = range.base;
    timed("쉬운 요약", () => renderStory(storyPanel, { netInvestmentKrw: base.netInvestmentKrw, paybackYears: base.paybackYears, years: input.analysisYears, totalSavingKrw: base.totalSavingKrw, firstYearSavingKrw: base.firstYearSavingKrw }));
    timed("결과 카드", () => renderResultCards(resultPanel, input, range, countAssumed(state.values, data, state.usageIsExample)));
    timed("범위 표", () => renderRangeBoxes(rangePanel, input, range));
    timed("에너지 균형", () => renderBalance(balancePanel, { ...flowTotals(base.year1), usageKwh: state.usage.reduce((a, b) => a + b, 0) }));
    timed("개념도", () => diagram.update(input, flowTotals(base.year1), base.firstYearSavingKrw));
    scheduleHeavy(() => {
      timed("누적 그래프", () =>
        cashChart.update(base.flows, base.paybackYears, {
          lowFlows: range.low.flows,
          highFlows: range.high.flows,
          lowLabel: `낮 비중 하한 (${fmt(range.dayShares.low * 100)}%)`,
          highLabel: `낮 비중 상한 (${fmt(range.dayShares.high * 100)}%)`,
        }),
      );
      timed("월별 그래프", () => monthlyChart.update({ year1: base.year1, usage: state.usage, seasons: seasonSummary(base.year1, state.usage), dayShare: range.dayShares.base }));
      timed("용량 곡선", () => curve.update({ input: withoutShare, dayShareLow, dayShareHigh, currentCapacity: input.capacityKwp }));
      timed("우주 비교", () =>
        space.update({
          lcoeKrwPerKwh: lcoeKrwPerKwh(withoutShare),
          priceKrwPerKwh: input.electricityPriceKrwPerKwh,
          billing: billing !== null,
          groundPoaKwhM2: poaAtTilt(tiltData.table, /** @type {number} */ (state.values.tilt_deg)),
          tiltDeg: /** @type {number} */ (state.values.tilt_deg),
          degradationRate: input.degradationRate,
          discountRate: input.discountRate,
          years: input.analysisYears,
        }),
      );
      timed("설계안 비교", () => designPanel?.refresh());
      timed("민감도", () => sens.update({ values: billing ? { ...state.values, tariff_scale: 1 } : state.values, usage: state.usage, toInput: (v, u) => buildEngineInput(v, u, tiltData.table, fallbackRatios, billing) }));
    });
    timed("주소 갱신", () => syncUrl());
  }

  const controller = renderInputPanel(inputPanel, data, (values, notes) => {
    state.values = values;
    state.notes = notes;
    recompute();
  });
  usagePanel = renderUsagePanel(document.getElementById("usage-panel"), usageExample, (usage, isExample) => {
    state.usage = usage;
    state.usageIsExample = isExample;
    recompute();
  });
  tariffSel = renderTariffSelector(document.getElementById("tariff-panel"), tariffData, controller);
  tariffSel.onChange(() => recompute());
  // 설계안 비교: 현재 입력을 설계안으로 읽고(getCurrent), 저장한 설계안을 입력에 되돌려 넣는다(apply)
  designPanel = createDesignPanel(document.getElementById("design-panel"), {
    ctx: { tiltTable: tiltData.table, fallbackRatios, tariffData },
    getCurrent: () => ({ name: "현재 입력", values: { ...state.values }, usage: [...state.usage], tariff: tariffSel ? tariffSel.getState() : null }),
    apply: (d) => {
      /** @type {Record<string, number>} */
      const map = {};
      for (const id of Object.keys(PARAM_TO_INPUT)) if (typeof d.values[id] === "number") map[id] = d.values[id];
      controller.setValues(map);
      usagePanel?.setUsage(d.usage);
      tariffSel?.setState(d.tariff);
      tabs.show("overview");
    },
  }); // 계산 방식(누진·계절 요금표 / 한 단가)이나 기본요금 포함을 바꾸면 다시 계산
  const tabs = initTabs(document.getElementById("sidebar"));
  quick = createQuickControls(document.getElementById("quick-panel"), controller, (name) => tabs.show(name));
  quick.sync(state.values);

  // 용량 곡선의 탐색 최대 용량을 바꿔도 링크에 반영한다(이 칸은 계산 전체를 다시 하지 않아 따로 연결)
  document.getElementById("curve-max").addEventListener("input", syncUrl);

  // 공유 링크(#s=...)로 열었으면 그 설계를 되살린다
  if (initialHash.startsWith(SHARE_PREFIX)) {
    const r = decodeShare(initialHash, Object.keys(PARAM_TO_INPUT));
    if (!r.ok) {
      applying = false;
      shareBar.setMessage(`${r.error} 기본 화면으로 열었습니다.`);
      syncUrl();
    } else {
      const notes = [];
      controller.setValues(r.state.p);
      if (r.state.u) usagePanel.setUsage(r.state.u);
      if (r.state.t && !tariffSel.setState(r.state.t)) notes.push("알 수 없는 요금제는 건너뛰었습니다.");
      if (r.state.m !== undefined) curve.setMax(r.state.m);
      if (r.dropped > 0) notes.push(`읽을 수 없는 값 ${r.dropped}개는 건너뛰었습니다.`);
      applying = false;
      syncUrl();
      shareBar.setMessage(["공유 링크에서 설계를 불러왔습니다.", ...notes].join(" "));
    }
  } else {
    applying = false;
    syncUrl();
  }
  // 같은 탭에서 다른 공유 링크로 주소만 바꾸면 화면이 어긋나므로 다시 불러온다(우리가 주소를 바꿀 때는 이 이벤트가 생기지 않음)
  window.addEventListener("hashchange", () => location.reload());
  flushHeavy(); // 처음 화면은 기다리지 않고 바로 그린다
  status.textContent = "";
} catch (err) {
  status.textContent = "오류: " + err.message;
  console.error(err);
}
