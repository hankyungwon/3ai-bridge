/**
 * content.js — 각 사이트 페이지 안에서 실제로 "타이핑하고 전송"하는 부분
 * 선택자는 이 파일에 적지 않고 selectors.js 에서 가져다 씁니다.
 */

(() => {
  // 같은 탭에 두 번 주입되어도 문제없게 표시를 남깁니다.
  if (globalThis.__3대장브리지_적재됨) return;
  globalThis.__3대장브리지_적재됨 = true;

  const 잠깐 = (밀리초) => new Promise((r) => setTimeout(r, 밀리초));

  /** 후보 선택자를 위에서부터 시도해 처음 찾은 요소를 반환합니다. */
  function 요소찾기(후보들) {
    for (const 선택자 of 후보들) {
      const 요소 = document.querySelector(선택자);
      if (요소 && 요소.offsetParent !== null) return 요소;
    }
    // 화면에 안 보이는 요소라도 있으면 그거라도 씁니다.
    for (const 선택자 of 후보들) {
      const 요소 = document.querySelector(선택자);
      if (요소) return 요소;
    }
    return null;
  }

  /** 요소가 나타날 때까지 최대 timeout 밀리초 동안 기다립니다. */
  async function 요소대기(후보들, 제한 = 8000) {
    const 끝 = Date.now() + 제한;
    while (Date.now() < 끝) {
      const 요소 = 요소찾기(후보들);
      if (요소) return 요소;
      await 잠깐(250);
    }
    return null;
  }

  /**
   * 입력란에 글자를 넣습니다.
   * 사이트들이 React/Angular 를 쓰기 때문에 값만 바꾸면 인식하지 못합니다.
   * 그래서 실제 타이핑과 같은 방식(execCommand insertText)을 사용합니다.
   */
  async function 글자넣기(입력란, 본문) {
    입력란.focus();
    입력란.click();
    await 잠깐(50);

    if (입력란.tagName === "TEXTAREA" || 입력란.tagName === "INPUT") {
      // 네이티브 setter 를 써야 React 가 변경을 감지합니다.
      const setter = Object.getOwnPropertyDescriptor(
        입력란.tagName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype,
        "value"
      ).set;
      setter.call(입력란, 본문);
      입력란.dispatchEvent(new Event("input", { bubbles: true }));
      입력란.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      // contenteditable (Claude, ChatGPT, Gemini 대부분)
      const 기존선택 = window.getSelection();
      const 범위 = document.createRange();
      범위.selectNodeContents(입력란);
      기존선택.removeAllRanges();
      기존선택.addRange(범위);
      // 기존 내용을 지우고 새 내용을 "입력"합니다.
      document.execCommand("delete", false, null);
      const 성공 = document.execCommand("insertText", false, 본문);
      if (!성공) {
        // execCommand 가 막힌 경우의 대비책
        입력란.textContent = 본문;
      }
      입력란.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    await 잠깐(150);
    // 실제로 글자가 들어갔는지 확인
    const 현재 = (입력란.value ?? 입력란.innerText ?? "").trim();
    return 현재.length > 0;
  }

  /** 전송 버튼을 누릅니다. 못 찾으면 Enter 키로 대신합니다. */
  async function 전송하기(설정, 입력란) {
    // 버튼이 활성화될 때까지 잠깐 기다립니다.
    for (let i = 0; i < 12; i++) {
      const 버튼 = 요소찾기(설정.전송버튼);
      if (버튼 && !버튼.disabled && 버튼.getAttribute("aria-disabled") !== "true") {
        버튼.click();
        return true;
      }
      await 잠깐(250);
    }
    // 대비책: Enter 키 입력
    입력란.focus();
    for (const 종류 of ["keydown", "keypress", "keyup"]) {
      입력란.dispatchEvent(
        new KeyboardEvent(종류, {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        })
      );
    }
    return true;
  }

  /**
   * 모델 자동 선택 (베스트 에포트).
   * 실패해도 절대 전송을 막지 않고, 실패했다는 사실만 알려줍니다.
   */
  async function 모델선택시도(설정, 희망모델) {
    if (!희망모델) return { 시도: false };
    try {
      const 버튼 = 요소찾기(설정.모델버튼);
      if (!버튼) return { 시도: true, 성공: false };
      버튼.click();
      await 잠깐(600);
      const 항목들 = [];
      for (const 선택자 of 설정.모델항목) {
        항목들.push(...document.querySelectorAll(선택자));
      }
      const 찾음 = 항목들.find((el) =>
        (el.innerText || "").toLowerCase().includes(희망모델.toLowerCase())
      );
      if (찾음) {
        찾음.click();
        await 잠깐(400);
        return { 시도: true, 성공: true };
      }
      // 목록을 닫아 원래 화면으로 되돌립니다.
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      return { 시도: true, 성공: false };
    } catch (e) {
      return { 시도: true, 성공: false };
    }
  }

  chrome.runtime.onMessage.addListener((메시지, _발신, 응답) => {
    if (메시지.종류 !== "질문전송") return;

    (async () => {
      const 설정 = BRIDGE_SELECTORS[메시지.사이트];
      if (!설정) {
        응답({ 성공: false, 사유: "알 수 없는 사이트" });
        return;
      }

      const 모델결과 = await 모델선택시도(설정, 메시지.희망모델);

      const 입력란 = await 요소대기(설정.입력란);
      if (!입력란) {
        응답({
          성공: false,
          사유: "입력란을 찾지 못함 (selectors.js 갱신 필요)",
          모델: 모델결과,
        });
        return;
      }

      const 넣기성공 = await 글자넣기(입력란, 메시지.본문);
      if (!넣기성공) {
        응답({
          성공: false,
          사유: "입력란에 글자를 넣지 못함 (selectors.js 갱신 필요)",
          모델: 모델결과,
        });
        return;
      }

      await 전송하기(설정, 입력란);
      응답({ 성공: true, 모델: 모델결과 });
    })();

    return true; // 비동기 응답 사용
  });
})();
