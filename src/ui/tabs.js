// 화면 구역 전환(탭): 왼쪽(좁은 화면에서는 위쪽) 막대의 버튼으로 개요·입력·월별·용량 곡선·가정/검증을 바꿔 본다.
// 숨겨진 구역에 있던 그래프는 다시 보일 때 크기를 다시 잡도록 resize 신호를 보낸다.
// 마지막으로 본 구역은 이 탭에서만(sessionStorage) 기억하고, 주소(#s=...)는 건드리지 않는다.

const STORAGE_KEY = "sim.tab";

/** @param {string} id */
function safeGet(id) {
  try {
    return sessionStorage.getItem(id);
  } catch {
    return null;
  }
}

/** @param {string} id @param {string} value */
function safeSet(id, value) {
  try {
    sessionStorage.setItem(id, value);
  } catch {
    /* 저장이 막힌 환경에서는 기억만 못 한다 */
  }
}

/**
 * @param {HTMLElement} nav  버튼(role=tab)을 담은 요소
 * @returns {{ show(name: string): void }}
 */
export function initTabs(nav) {
  const buttons = /** @type {HTMLButtonElement[]} */ ([...nav.querySelectorAll("[data-tab]")]);
  const names = buttons.map((b) => /** @type {string} */ (b.dataset.tab));

  function show(/** @type {string} */ name, /** @type {boolean} */ focus = false) {
    if (!names.includes(name)) name = names[0];
    for (const b of buttons) {
      const on = b.dataset.tab === name;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
      // 좁은 화면의 가로 막대에서 선택한 구역이 잘려 보이지 않게 가운데로 밀어 준다
      if (on && typeof b.scrollIntoView === "function") b.scrollIntoView({ inline: "center", block: "nearest" });
      const panel = document.getElementById(`tab-${b.dataset.tab}`);
      if (panel) panel.hidden = !on;
    }
    safeSet(STORAGE_KEY, name);
    // 숨겨져 있던 그래프가 보이게 되었으니 크기를 바로 다시 잡는다. (화면이 가려진 상태에서는 requestAnimationFrame이 멈추므로
    // 기다리지 않고 지금 계산한다.) 보이는 구역의 그래프만 의미가 있고, 숨겨진 것은 크기 0이라 그대로 두어도 된다.
    const Chart = /** @type {any} */ (window).Chart;
    if (Chart && Chart.instances) for (const chart of Object.values(Chart.instances)) /** @type {any} */ (chart).resize();
    window.dispatchEvent(new Event("resize"));
  }

  buttons.forEach((b) => b.addEventListener("click", () => show(/** @type {string} */ (b.dataset.tab))));
  // 키보드: 좌우·상하 화살표로 이동, Home/End로 처음·끝
  nav.addEventListener("keydown", (e) => {
    const i = buttons.findIndex((b) => b.getAttribute("aria-selected") === "true");
    const key = /** @type {KeyboardEvent} */ (e).key;
    let next = -1;
    if (key === "ArrowRight" || key === "ArrowDown") next = (i + 1) % buttons.length;
    else if (key === "ArrowLeft" || key === "ArrowUp") next = (i - 1 + buttons.length) % buttons.length;
    else if (key === "Home") next = 0;
    else if (key === "End") next = buttons.length - 1;
    if (next >= 0) {
      e.preventDefault();
      show(/** @type {string} */ (buttons[next].dataset.tab), true);
    }
  });

  show(safeGet(STORAGE_KEY) ?? names[0]);
  return { show };
}
