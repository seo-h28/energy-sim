// 가정 공개 패널: 모든 파라미터를 값·단위·상태 배지·출처와 함께 표로 보여주고,
// 계산식과 알려진 단순화를 함께 공개한다. 입력칸의 현재 값을 따라 바뀐다.
import { STATUS_LABELS } from "../core/assumptions.js";

/** innerHTML에 넣기 전에 특수문자를 바꾼다(사용자 입력이 섞여도 안전하도록) */
function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** 계산식(spec 5.1, 5.6). 화면 설명용 글이며 계산은 src/core/*.js가 한다 */
const FORMULAS = [
  "연 발전량(y년차) = 용량 × 연간 발전시간 × 방향 보정 × (1 − 추가 손실) × (1 − 효율저하)^(y−1)",
  "월 발전량[m] = 연 발전량(y) × 월 발전 비율[m]  (월 비율은 부산 월별 표, 합 1)",
  "낮에 쓰는 전기[m] = 월 사용량[m] × 낮시간 사용 비중   (하한·상한 두 값으로 각각 계산)",
  "자가소비[m] = min(월 발전량[m], 낮에 쓰는 전기[m]),  잉여[m] = 월 발전량[m] − 자가소비[m]",
  "월 절감[m] = 자가소비[m] × 전기요금(y) + 잉여[m] × 판매단가,  전기요금(y) = 단가 × (1 + 요금 상승률)^(y−1)",
  "연 절감(y년차) = Σ월 절감[m] − 연 유지비",
  "순 투자비 = 용량 × kWp당 설치비 − 보조금",
  "현금흐름: 투자는 t=0 (−순 투자비), 연 절감은 각 해 말 t=1..N",
  "회수기간 = 누적 현금흐름이 처음 0 이상이 되는 시점 (그 해 안에서는 직선 보간)",
  "NPV = Σ (t년 말 현금흐름 ÷ (1 + 할인율)^t), t = 0..N",
];

/** 이 도구가 하지 않는 것·단순화한 것(사실을 숨기지 않기 위해 항상 보여준다) */
const LIMITATIONS = [
  "월 단위 계산입니다. 낮 발전·저녁 사용의 시간대 차이는 월 합계로는 완전히 반영되지 않는 근사이며, 낮시간 사용 비중은 하한~상한 범위로 계산합니다(비중 값 자체는 임의 가정).",
  "월별 사용량은 해마다 같다고 가정하고, 기본 사용량은 출처 없는 임의 가정 예시입니다(고지서 값으로 바꿀 수 있습니다).",
  "월별 발전 분포는 2024년 1개 연도 ASOS 일사를 환산한 참고값이고(연 총량만 PVGIS 확인값), 연도별 편차는 반영하지 않습니다.",
  "요금 상승률은 전기요금에만 적용하고, 잉여 판매단가와 연 유지비는 해마다 같다고 둡니다.",
  "전기요금은 단일 단가입니다. 요금제를 고르면 한전 요금표(2024-07-01 시행 값)에서 단가 하나를 뽑으며, 월 사용량에 따라 단계가 바뀌는 누진 계산과 계절별 변화는 반영하지 않습니다. 기본요금은 태양광을 달아도 줄지 않는다고 보고 뺐습니다(가정). 기후환경요금·연료비조정요금은 요금표 예시 값이라 현재 값과 다를 수 있습니다.",
  "방향 보정은 슬라이더로 정하는 값이며 경사각·방위에서 계산한 값이 아닙니다(기준은 35° 남향). 0.8~1.0 범위는 한 계산기 페이지의 설명(±20% 수준)을 근거로 한 참고 범위입니다.",
  "입력칸에 막아 둔 허용 범위는 잘못된 입력을 거르기 위한 임시 범위이며 출처가 있는 한도가 아닙니다.",
  "비용은 설치비·보조금·연 유지비 한 값으로만 반영합니다. 인버터 교체 같은 비정기 비용은 넣지 않았습니다.",
  "이 결과는 입력한 가정에 따른 계산이며, 실제 설치 결과의 예측이나 설치 결정의 근거가 아닙니다. 실제 결정에는 전문가 견적이 필요합니다.",
];

/**
 * @param {HTMLElement} container
 * @param {import("../core/assumptions.js").Assumptions} data  기본값과 출처
 * @param {Record<string, number | null>} [values]  입력칸의 현재 값(없으면 기본값을 그대로 보여줌)
 * @param {Record<string, {status: import("../core/assumptions.js").Status, source: string}>} [notes]  요금제 선택처럼 상태·출처가 따로 있는 값
 */
export function renderAssumptionsPanel(container, data, values, notes = {}) {
  const entries = Object.entries(data.params);
  const changedCount = entries.filter(([id, p]) => values && id in values && !Object.is(values[id], p.value)).length;

  const rows = entries.map(([id, p]) => {
    const hasCurrent = values && id in values;
    const current = hasCurrent ? values[id] : p.value;
    const changed = hasCurrent && !Object.is(current, p.value);
    const shown = current === null ? "미정" : Number.isNaN(current) ? "비어 있음" : current.toLocaleString("ko-KR");
    const note = notes[id];
    const status = note ? note.status : changed ? "user" : p.status;
    const source = note
      ? `${note.source} (기본값 ${p.value === null ? "미정" : p.value.toLocaleString("ko-KR")}에서 바꿈)`
      : changed
        ? `사용자가 바꾼 값입니다(기본값 ${p.value === null ? "미정" : p.value.toLocaleString("ko-KR")}). 기본값의 출처: ${p.source}`
        : p.source;
    return `<tr>
      <td>${esc(p.label)}<br><code>${esc(id)}</code></td>
      <td class="num">${esc(shown)}</td>
      <td>${esc(p.unit)}</td>
      <td><span class="badge badge-${esc(status)}">${esc(STATUS_LABELS[status])}</span></td>
      <td>${esc(source)}</td>
    </tr>`;
  });

  // 다시 그릴 때 사용자가 접어 둔 항목을 기억한다(처음에는 둘 다 펼침)
  const wasClosed = [...container.querySelectorAll("details.disclosure")].map((d) => !d.open);

  container.innerHTML = `
    <h2>가정 공개 (${rows.length}개${changedCount ? `, 바꾼 값 ${changedCount}개` : ""})</h2>
    <details class="disclosure" open>
      <summary>계산식</summary>
      <ul>${FORMULAS.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    </details>
    <details class="disclosure" open>
      <summary>알려진 단순화와 한계</summary>
      <ul>${LIMITATIONS.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    </details>
    <div class="table-wrap">
      <table class="assumptions">
        <thead><tr><th>항목</th><th>현재 값</th><th>단위</th><th>상태</th><th>출처·설명</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>`;

  container.querySelectorAll("details.disclosure").forEach((d, i) => {
    if (wasClosed[i]) d.open = false;
  });
}
