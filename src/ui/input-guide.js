// 입력 화면 맨 위의 "4단계 안내": 무엇을 어디에 넣는지, 모르면 어떻게 하는지를 쉬운 말로 알린다.
// 단계 버튼을 누르면 해당 구역으로 스크롤하고 첫 입력칸에 초점을 준다. 계산에는 관여하지 않는다.
import { el } from "./dom.js";

/** @type {Array<{ title: string, body: string, target: string }>} */
const STEPS = [
  { title: "요금제 고르기", body: "내 전기 요금표를 고릅니다. 모르면 \"직접 입력\"(한 단가)으로 두세요.", target: "tariff-panel" },
  { title: "월별 사용량 넣기", body: "고지서의 12개월 사용량(kWh)을 넣습니다. 지금은 예시 값이라, 내 값으로 바꾸면 가장 정확해집니다.", target: "usage-panel" },
  { title: "설치 조건 정하기", body: "용량, 설치 가능 면적, 경사각, 방향을 정합니다. 슬라이더를 움직이면 개요의 결과가 바로 바뀝니다.", target: "in-capacity_kwp" },
  { title: "비용과 요금 가정", body: "설치비, 보조금, 요금 상승률 등을 넣습니다. 견적서가 있으면 그 값으로 바꾸세요.", target: "group-cost" },
];

/** @param {HTMLElement} container */
export function renderInputGuide(container) {
  const list = el("ol", { class: "guide-steps" });
  STEPS.forEach((s) => {
    const btn = el("button", { type: "button", class: "guide-step" });
    btn.append(el("strong", {}, s.title), el("span", {}, s.body));
    btn.addEventListener("click", () => {
      const t = document.getElementById(s.target);
      if (!t) return;
      t.scrollIntoView({ behavior: "smooth", block: "center" });
      if (t instanceof HTMLInputElement) t.focus({ preventScroll: true });
    });
    const li = el("li");
    li.append(btn);
    list.append(li);
  });
  container.replaceChildren(
    el("h2", {}, "입력은 4단계로 끝납니다"),
    list,
    el("p", { class: "card-note" }, "모르는 칸은 그대로 두어도 됩니다. 칸 옆의 [Assumed] 배지는 출처를 확인하지 못한 임의 가정이라는 뜻이고, 직접 고치면 [User]로 바뀝니다. 결과는 입력에 따라 바로 다시 계산됩니다."),
  );
}
