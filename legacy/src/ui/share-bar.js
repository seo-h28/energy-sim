// 공유 링크 바: 지금 설계가 들어 있는 주소를 보여주고 복사 버튼을 준다. 주소 자체가 설계를 담고 있어(core/share.js) 서버가 필요 없다.
import { el } from "./dom.js";

/**
 * @param {HTMLElement} container
 * @returns {{ refresh(): void, setMessage(text: string): void }}
 */
export function renderShareBar(container) {
  const input = /** @type {HTMLInputElement} */ (el("input", { id: "share-url", type: "text", readonly: "", "aria-label": "공유 링크" }));
  const button = el("button", { type: "button" }, "공유 링크 복사");
  const message = el("span", { class: "share-message", role: "status" });
  const label = el("label", { for: "share-url" }, "이 설계의 링크");
  container.replaceChildren(label, input, button, message);

  function refresh() {
    input.value = location.href;
  }

  button.addEventListener("click", async () => {
    refresh();
    try {
      await navigator.clipboard.writeText(input.value);
      message.textContent = "링크를 복사했습니다. 이 링크를 열면 같은 입력값으로 시작합니다.";
    } catch {
      // 클립보드 권한이 없을 때: 글자를 선택해 두고 직접 복사하게 한다
      input.select();
      const ok = document.execCommand?.("copy");
      message.textContent = ok ? "링크를 복사했습니다." : "자동 복사에 실패했습니다. 선택된 링크를 직접 복사해 주세요(Ctrl+C).";
    }
  });
  input.addEventListener("focus", () => input.select());

  refresh();
  return {
    refresh,
    setMessage(text) {
      message.textContent = text;
    },
  };
}
