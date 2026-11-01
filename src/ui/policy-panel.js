// 지원 정책 화면: 지역·건물 유형·설치 형태를 고르면 받을 수 있는 태양광 지원 사업 후보를 보여 준다(src/core/policy.js, data/policies.json).
// 금액·자격은 공고 원문을 확인하지 못해 값을 넣지 않았다. 사용자가 공고에서 확인한 보조금을 입력하면 "보조금" 입력칸에 반영해 NPV·회수기간이 바로 바뀐다.
import { BUILDING_TYPES, INSTALL_KINDS, REGIONS, matchPolicies } from "../core/policy.js";
import { el } from "./dom.js";

/**
 * @param {HTMLElement} container
 * @param {{ meta: any, programs: import("../core/policy.js").Program[] }} data
 * @param {{ applySubsidy: (krw: number) => void }} deps
 */
export function createPolicyPanel(container, data, deps) {
  /** @param {string} id @param {string} label @param {readonly { id: string, label: string }[]} options */
  const select = (id, label, options) => {
    const s = /** @type {HTMLSelectElement} */ (el("select", { id }));
    for (const o of options) s.append(el("option", { value: o.id }, o.label));
    const field = el("div", { class: "field" });
    field.append(el("label", { for: id }, label), s);
    return { s, field };
  };
  const region = select("policy-region", "지역", REGIONS);
  const type = select("policy-type", "건물 유형", BUILDING_TYPES);
  const kind = select("policy-kind", "설치 형태", INSTALL_KINDS);
  const form = el("div", { class: "input-grid policy-form" });
  form.append(region.field, type.field, kind.field);

  const results = el("div", { class: "policy-results" });
  const subsidyInput = /** @type {HTMLInputElement} */ (el("input", { id: "policy-subsidy", type: "number", min: "0", step: "any", placeholder: "공고에서 확인한 금액(원)" }));
  const applyBtn = /** @type {HTMLButtonElement} */ (el("button", { type: "button", id: "policy-apply" }, "보조금 칸에 반영"));
  const msg = el("p", { class: "card-note", role: "status" });
  applyBtn.addEventListener("click", () => {
    const v = subsidyInput.valueAsNumber;
    if (!Number.isFinite(v) || v < 0) {
      msg.textContent = "0 이상의 숫자를 입력하세요.";
      return;
    }
    deps.applySubsidy(v);
    msg.textContent = `보조금 ${Math.round(v).toLocaleString("ko-KR")}원을 입력 탭의 보조금 칸에 반영했습니다. 개요 탭에서 결과를 확인하세요.`;
  });
  const saveRow = el("div", { class: "design-save-row" });
  saveRow.append(subsidyInput, applyBtn);
  const apply = el("div", { class: "policy-apply" });
  apply.append(
    el("h3", { class: "sub-heading" }, "공고에서 확인한 보조금을 계산에 넣어 보기"),
    el("p", { class: "card-note" }, "사업 공고 원문에서 내가 받을 수 있는 보조금 금액을 확인했다면 아래에 넣으세요. 입력 탭의 보조금 칸이 바뀌고 회수기간과 NPV가 다시 계산됩니다. 확인하기 전의 추측 금액은 넣지 마세요."),
    saveRow,
    msg,
  );

  /** @param {import("../core/policy.js").Program} p @param {string[]} notes */
  function card(p, notes) {
    const c = el("article", { class: "policy-card" });
    const head = el("div", { class: "policy-head" });
    head.append(el("h4", {}, p.name), el("span", { class: `badge badge-${p.form === "loan" ? "reference" : "sourced"}` }, p.form === "loan" ? "융자" : "보조금"), el("span", { class: "badge badge-user" }, p.level === "national" ? "전국" : "지자체"));
    c.append(head, el("p", { class: "card-note" }, p.agency), el("p", {}, p.summary));
    for (const n of notes) c.append(el("p", { class: "vis-warn" }, n));
    const facts = el("ul");
    for (const f of p.facts) facts.append(el("li", {}, f));
    const unverified = el("ul", { class: "policy-unverified" });
    unverified.append(el("li", {}, `지원 금액: ${p.amount.text}`), el("li", {}, `자격·대상: ${p.eligibility.text}`));
    c.append(el("h5", {}, "조사에서 확인한 내용"), facts, el("h5", {}, "아직 확인하지 못한 것(공고에서 확인)"), unverified);
    const links = el("p", { class: "policy-links" });
    for (const s of p.sources) {
      links.append(el("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, `${s.label} ↗`), document.createTextNode(" "));
    }
    c.append(links);
    return c;
  }

  function renderResults() {
    const r = matchPolicies({ region: region.s.value, buildingType: type.s.value, installKind: kind.s.value }, data);
    const list = el("div", { class: "policy-list" });
    for (const m of r.matches) list.append(card(m.program, m.kind === "partial" ? m.notes : []));
    const rest = el("details", { class: "disclosure" });
    rest.append(el("summary", {}, `선택과 맞지 않아 제외한 사업 ${r.others.length}개`));
    const ul = el("ul");
    for (const o of r.others) ul.append(el("li", {}, `${o.program.name}: ${o.reasons.join(", ")}`));
    rest.append(r.others.length ? ul : el("p", { class: "card-note" }, "제외한 사업이 없습니다."));
    results.replaceChildren(
      el("h3", { class: "sub-heading" }, `받을 수 있는 후보 사업 ${r.matches.length}개`),
      r.matches.length ? list : el("p", { class: "card-note" }, "선택한 조건에 맞는 후보를 이번 조사에서는 못 찾았습니다(지원이 없다는 뜻은 아닙니다). 지자체와 한국에너지공단에 문의해 보세요."),
      rest,
    );
  }

  for (const s of [region.s, type.s, kind.s]) s.addEventListener("change", renderResults);
  type.s.value = "apartment";
  container.replaceChildren(
    el("h2", {}, "지원 정책: 받을 수 있는 사업 찾기"),
    el("p", { class: "card-note" }, `태양광 설치에 쓸 수 있는 국가·부산 지원 사업의 후보를 보여 줍니다. 조사 기준일 ${data.meta.asOf}. 이 화면은 사업의 존재와 공식 링크만 알려 주며, 지원 금액과 자격 기준은 공고 원문을 확인하지 못해 비워 두었습니다. 사업은 해마다 공고가 바뀌고 선착순·예산 소진으로 마감될 수 있으니 신청 전에 반드시 공고 원문을 확인하세요.`),
    form,
    results,
    apply,
  );
  renderResults();
}
