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
  async function 요소대기(후보들, 제한 = 12000) {
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
   *
   * ※ 이 함수는 "넣기"만 합니다. 제대로 다 들어갔는지 확인·재시도는
   *   아래 안전주입()이 맡습니다 (v1.18 주입 안전망).
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

  /** 입력란(어떤 종류든)에 현재 들어 있는 글자를 읽습니다. */
  function 입력란글자(요소) {
    if (!요소) return "";
    return (요소.value ?? 요소.innerText ?? "").trim();
  }

  /* ─────────────── 주입 안전망 (v1.18) ───────────────
   * 예전에 긴 마크다운을 제미나이 입력창(Quill)에 넣을 때 뒷부분이
   * 잘리는 일이 있었는데, 코드가 "글자가 하나라도 들어갔는지"만 보고
   * 성공으로 처리해 조용히 넘어갔습니다. 이제 원문과 입력창 내용의
   * 길이를 대조하고, 어긋나면 한 번 자동으로 다시 넣습니다.
   * 이 검사는 세 사이트 공통입니다(제미나이 전용 아님).
   */

  /** 입력란 내용을 다듬지 않고 그대로 읽습니다(길이 대조용). */
  function 입력란원문(요소) {
    if (!요소) return "";
    return 요소.value ?? 요소.innerText ?? "";
  }

  /**
   * 대조하기 전에 양쪽을 같은 모양으로 맞춥니다.
   *  - 줄바꿈 표기 통일 (\r\n, \r → \n)
   *  - 에디터가 넣는 줄바꿈 없는 공백(NBSP, U+00A0)을 보통 공백으로
   *  - 에디터가 문단 끝에 자동으로 붙이는 후행 공백·개행 제거
   */
  function 대조용정규화(글) {
    return (글 || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b\ufeff]/g, "") // 에디터가 심는 보이지 않는 표식 제거
      .replace(/[ \t\n]+$/, "");
  }

  /**
   * 원문과 입력창 내용을 대조합니다.
   * 원칙은 정확 일치입니다. 다만 contenteditable 에디터는 줄 끝에
   * 눈에 보이지 않는 한두 글자(문단 표식 등)를 더하거나 지우는 일이 있어,
   * 정규화 후에도 남는 ±2자 차이는 허용 오차로 둡니다.
   * (그 이상 차이가 나면 "잘림"으로 보고 재주입합니다)
   */
  const 허용오차 = 2;
  function 길이대조(원문, 입력내용) {
    const a = 대조용정규화(원문);
    const b = 대조용정규화(입력내용);
    const 차이 = Math.abs(a.length - b.length);
    return {
      일치: a === b || 차이 <= 허용오차,
      원문길이: a.length,
      입력길이: b.length,
    };
  }

  /** 입력란을 비웁니다(재주입 전 정리). */
  async function 입력란비우기(요소) {
    if (!요소) return;
    요소.focus();
    if (요소.tagName === "TEXTAREA" || 요소.tagName === "INPUT") {
      const setter = Object.getOwnPropertyDescriptor(
        요소.tagName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype,
        "value"
      ).set;
      setter.call(요소, "");
      요소.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      const 선택 = window.getSelection();
      const 범위 = document.createRange();
      범위.selectNodeContents(요소);
      선택.removeAllRanges();
      선택.addRange(범위);
      document.execCommand("delete", false, null);
      요소.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    await 잠깐(120);
  }

  /** 화면 오른쪽 위에 경고 배지를 잠깐 띄웁니다(주입 불완전 알림). */
  function 경고배지(글) {
    try {
      let 배지 = document.getElementById("__3대장_경고배지");
      if (!배지) {
        배지 = document.createElement("div");
        배지.id = "__3대장_경고배지";
        배지.style.cssText = [
          "position:fixed", "top:12px", "right:12px", "z-index:2147483647",
          "max-width:320px", "padding:10px 12px", "border-radius:8px",
          "background:#1c1f22", "color:#e6edf0", "font:13px/1.5 sans-serif",
          "border:1px solid #2dd4bf", "box-shadow:0 4px 16px rgba(0,0,0,.4)",
          "white-space:pre-wrap", "cursor:pointer",
        ].join(";");
        배지.addEventListener("click", () => 배지.remove());
        document.documentElement.appendChild(배지);
      }
      배지.textContent = "⚠ 3대장 카페\n" + 글 + "\n(눌러서 닫기)";
      clearTimeout(배지.__타이머);
      배지.__타이머 = setTimeout(() => 배지.remove(), 20000);
    } catch (e) {
      /* 페이지 사정으로 못 띄워도 전송은 계속합니다 */
    }
  }

  /**
   * 글자를 넣고 → 길이를 대조하고 → 어긋나면 1회 자동 재주입합니다.
   * 재주입도 실패하면 경고 배지를 띄우되 전송은 막지 않고,
   * "주입 불완전" 사실을 호출자에게 알려 이력에 남기게 합니다.
   */
  async function 안전주입(설정, 입력란, 본문) {
    let 요소 = 입력란;
    let 마지막대조 = null;

    for (let 회차 = 0; 회차 < 2; 회차++) {
      const 넣기됨 = await 글자넣기(요소, 본문);
      // 위 글자넣기() 안에서 이미 150ms 기다립니다 — 그 직후 대조합니다.
      요소 = 요소찾기(설정.입력란) || 요소;
      마지막대조 = 길이대조(본문, 입력란원문(요소));

      if (넣기됨 && 마지막대조.일치) {
        return { 성공: true, 대조: 마지막대조, 재주입: 회차 > 0 };
      }
      if (회차 === 0) {
        // 잘렸거나 아예 안 들어감 → 비우고 한 번 더
        await 입력란비우기(요소);
        요소 = 요소찾기(설정.입력란) || 요소;
      }
    }

    if (!마지막대조.입력길이) {
      return { 성공: false, 비어있음: true, 대조: 마지막대조 };
    }
    경고배지(
      `보낸 글이 입력창에 다 들어가지 않았습니다.\n원문 ${마지막대조.원문길이}자 / 입력 ${마지막대조.입력길이}자\n보내기 전에 내용을 확인하세요.`
    );
    return { 성공: false, 주입불완전: true, 대조: 마지막대조 };
  }

  /**
   * 파일·사진 첨부를 입력란에 넣습니다.
   * 사람이 Ctrl+V로 붙여넣은 것과 같은 "붙여넣기 이벤트"를 만들어 보냅니다.
   * (세 사이트 모두 클립보드 파일 붙여넣기를 지원)
   */
  async function 첨부붙이기(설정, 입력란, 첨부들) {
    if (!첨부들 || !첨부들.length) return { 성공: true };
    try {
      const dt = new DataTransfer();
      for (const f of 첨부들) {
        // 자료는 data: 주소(글자로 변환된 파일) — 다시 실제 파일로 복원
        const 응답 = await fetch(f.자료);
        const 블롭 = await 응답.blob();
        dt.items.add(new File([블롭], f.이름, { type: f.종류 || 블롭.type }));
      }

      // 사이트마다 첨부를 받는 통로가 다릅니다(selectors.js의 첨부방식 순서대로 시도).
      const 방식들 = 설정.첨부방식 || ["paste"];
      for (const 방식 of 방식들) {
        if (방식 === "input") {
          // 숨겨진 파일 업로드 칸에 직접 파일을 넣고 change 신호를 보냅니다.
          let 파일칸 = null;
          for (const 선택자 of 설정.파일입력 || []) {
            파일칸 = document.querySelector(선택자);
            if (파일칸) break;
          }
          if (!파일칸) continue; // 이 방식은 불가 → 다음 방식으로
          파일칸.files = dt.files;
          파일칸.dispatchEvent(new Event("input", { bubbles: true }));
          파일칸.dispatchEvent(new Event("change", { bubbles: true }));
          await 잠깐(1200);
          return { 성공: true, 방식 };
        }
        if (방식 === "drop") {
          입력란.focus();
          const 옵션 = { dataTransfer: dt, bubbles: true, cancelable: true };
          입력란.dispatchEvent(new DragEvent("dragenter", 옵션));
          입력란.dispatchEvent(new DragEvent("dragover", 옵션));
          입력란.dispatchEvent(new DragEvent("drop", 옵션));
          await 잠깐(1200);
          return { 성공: true, 방식 };
        }
        // 기본: 붙여넣기 이벤트
        // 파일이 여러 개일 때 한 번에 붙이면 첫 번째만 인식하는 사이트가
        // 있어(ChatGPT 등), 파일을 하나씩 차례로 붙여넣습니다.
        입력란.focus();
        const 파일들 = [...dt.files];
        for (const 파일 of 파일들) {
          const 하나 = new DataTransfer();
          하나.items.add(파일);
          const 지금입력란 = 요소찾기(설정.입력란) || 입력란;
          지금입력란.focus();
          지금입력란.dispatchEvent(
            new ClipboardEvent("paste", {
              clipboardData: 하나,
              bubbles: true,
              cancelable: true,
            })
          );
          // 앞 파일 업로드가 시작될 시간을 준 뒤 다음 파일을 붙입니다.
          await 잠깐(파일들.length > 1 ? 1500 : 1200);
        }
        return { 성공: true, 방식 };
      }
      return { 성공: false };
    } catch (e) {
      return { 성공: false };
    }
  }

  /**
   * 전송 버튼을 누릅니다. 못 찾으면 Enter 키로 대신합니다.
   * 누른 뒤 입력란이 실제로 비워졌는지 확인해서, "눌렀지만 전송은 안 된" 경우를
   * 성공으로 잘못 보고하지 않게 합니다. (세 사이트 모두 전송되면 입력란이 비워짐)
   */
  async function 전송하기(설정, 입력란, 첨부있음) {
    let 버튼눌림 = false;

    // 버튼이 활성화될 때까지 기다렸다가 누릅니다.
    // 첨부가 있으면 파일 업로드가 끝날 때까지 더 오래(최대 30초) 기다립니다.
    const 시도횟수 = 첨부있음 ? 120 : 12;
    for (let i = 0; i < 시도횟수; i++) {
      const 버튼 = 요소찾기(설정.전송버튼);
      if (버튼 && !버튼.disabled && 버튼.getAttribute("aria-disabled") !== "true") {
        버튼.click();
        버튼눌림 = true;
        break;
      }
      await 잠깐(250);
    }

    if (!버튼눌림) {
      // 대비책: Enter 키 입력 (세 사이트 모두 Enter로 전송 가능)
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
    }

    // 전송 확인: 최대 4초 동안 입력란이 비워지길 기다립니다.
    // (전송/모델 변경으로 입력란이 새로 그려질 수 있어 매번 다시 찾습니다)
    for (let i = 0; i < 16; i++) {
      const 지금입력란 = 요소찾기(설정.입력란) || 입력란;
      if (!입력란글자(지금입력란)) return { 성공: true };
      await 잠깐(250);
    }

    // 입력란에 글자가 그대로 남아 있으면 전송이 안 된 것으로 봅니다.
    return {
      성공: false,
      사유: 버튼눌림
        ? "전송 버튼을 눌렀지만 전송이 확인되지 않음"
        : "전송 버튼을 찾지 못함 (selectors.js 갱신 필요)",
    };
  }

  /* ───────────────── 모델 자동 선택 (베스트 에포트) ───────────────── */

  /** 비교하기 쉽게 문자열을 다듬습니다: 소문자 + 공백/하이픈/점 제거. */
  function 정규화(글자) {
    return (글자 || "")
      .toLowerCase()
      .replace(/[\s\-_.·]/g, "")
      .trim();
  }

  /**
   * 희망 모델명을 실제로 찾아볼 "후보 문구 목록"으로 넓힙니다.
   * 예) Claude + "Fable" → ["fable", "fable5"]
   * 별칭표(selectors.js의 모델별칭)를 이용해 표기 차이를 흡수합니다.
   */
  function 후보문구만들기(사이트키, 희망모델) {
    const 기본 = 정규화(희망모델);
    const 후보 = [기본];
    const 표 = (globalThis.모델별칭 || {})[사이트키] || {};
    for (const [열쇠, 값들] of Object.entries(표)) {
      const 열쇠정규 = 정규화(열쇠);
      // 설정값이 별칭표의 열쇠와 같거나, 열쇠가 설정값에 포함되면 그 별칭들을 추가
      if (열쇠정규 === 기본 || 기본.includes(열쇠정규) || 열쇠정규.includes(기본)) {
        for (const v of 값들) 후보.push(정규화(v));
      }
    }
    return [...new Set(후보.filter(Boolean))];
  }

  /** 실제 사람이 누르는 것과 최대한 비슷하게 클릭합니다. */
  function 진짜클릭(요소) {
    const 옵션 = { bubbles: true, cancelable: true, view: window };
    요소.scrollIntoView?.({ block: "center" });
    for (const 종류 of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const 이벤트 =
        종류.startsWith("pointer")
          ? new PointerEvent(종류, 옵션)
          : new MouseEvent(종류, 옵션);
      요소.dispatchEvent(이벤트);
    }
  }

  /** 마우스를 올린 것처럼 알려 하위 메뉴가 펼쳐지게 합니다. */
  function 마우스올리기(요소) {
    const 옵션 = { bubbles: true, cancelable: true, view: window };
    for (const 종류 of ["pointerover", "mouseover", "pointerenter", "mouseenter", "mousemove"]) {
      요소.dispatchEvent(
        종류.startsWith("pointer")
          ? new PointerEvent(종류, 옵션)
          : new MouseEvent(종류, 옵션)
      );
    }
  }

  /** 현재 화면에 떠 있는 메뉴 항목들을 모읍니다(중복 제거). */
  function 메뉴항목모으기(설정) {
    const 모음 = new Set();
    for (const 선택자 of 설정.모델항목) {
      for (const el of document.querySelectorAll(선택자)) {
        if (el.offsetParent !== null || el.getClientRects().length) 모음.add(el);
      }
    }
    return [...모음];
  }

  /** 메뉴 항목이 나타날 때까지 기다립니다. */
  async function 메뉴대기(설정, 제한 = 3000) {
    const 끝 = Date.now() + 제한;
    while (Date.now() < 끝) {
      const 항목들 = 메뉴항목모으기(설정);
      if (항목들.length) return 항목들;
      await 잠깐(150);
    }
    return [];
  }

  /**
   * 항목 목록에서 가장 잘 맞는 것을 고릅니다.
   * 점수: 완전일치 > 시작일치 > 포함. 비활성 항목은 제외합니다.
   */
  function 가장잘맞는항목(항목들, 후보문구들) {
    let 최고 = null;
    let 최고점 = 0;
    for (const el of 항목들) {
      if (el.getAttribute("aria-disabled") === "true" || el.disabled) continue;
      const 글 = 정규화(el.innerText || el.textContent);
      if (!글) continue;
      for (const 문구 of 후보문구들) {
        let 점수 = 0;
        if (글 === 문구) 점수 = 100;
        else if (글.startsWith(문구)) 점수 = 80;
        else if (글.includes(문구)) 점수 = 60;
        // 짧은 글일수록 정확한 항목일 확률이 높아 약간 가산합니다.
        if (점수) 점수 += Math.max(0, 20 - 글.length) / 10;
        if (점수 > 최고점) {
          최고점 = 점수;
          최고 = el;
        }
      }
    }
    return 최고;
  }

  /** 지금 선택돼 있는 모델 이름(버튼에 적힌 글자)을 읽습니다. */
  function 현재모델읽기(설정) {
    const 라벨 = 요소찾기(설정.모델라벨 || 설정.모델버튼 || []);
    return 라벨 ? 정규화(라벨.innerText || 라벨.textContent) : "";
  }

  /** 열려 있는 메뉴를 닫습니다. */
  async function 메뉴닫기() {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
    await 잠깐(200);
  }

  /**
   * 모델 자동 선택 (베스트 에포트).
   * 실패해도 절대 전송을 막지 않고, 실패했다는 사실만 알려줍니다.
   *
   * 성공률을 높이기 위해 다음을 합니다:
   *  1) 이미 원하는 모델이면 아무것도 하지 않고 성공 처리
   *  2) 별칭표로 표기 차이를 흡수 (예: "최상위" → pro/thinking …)
   *  3) 사람처럼 pointer/mouse 이벤트로 드롭다운을 엶
   *  4) 목록에 없으면 "더 보기 / 레거시" 하위 메뉴를 펼쳐 다시 찾음
   *  5) 고른 뒤 버튼 글자를 다시 읽어 실제로 바뀌었는지 확인
   *  6) 실패하면 한 번 더 시도하고, 그래도 안 되면 메뉴를 닫아 원상복구
   */
  async function 모델선택시도(사이트키, 설정, 희망모델) {
    if (!희망모델 || !희망모델.trim()) return { 시도: false };

    const 후보문구들 = 후보문구만들기(사이트키, 희망모델);

    // 1) 이미 원하는 모델이면 건드리지 않습니다 (가장 확실한 성공).
    const 처음모델 = 현재모델읽기(설정);
    if (처음모델 && 후보문구들.some((문구) => 처음모델.includes(문구))) {
      return { 시도: true, 성공: true, 사유: "이미 선택됨" };
    }

    for (let 회차 = 0; 회차 < 2; 회차++) {
      try {
        const 버튼 = 요소찾기(설정.모델버튼 || []);
        if (!버튼) return { 시도: true, 성공: false, 사유: "모델 버튼 없음" };

        진짜클릭(버튼);
        let 항목들 = await 메뉴대기(설정);
        if (!항목들.length) {
          await 메뉴닫기();
          continue;
        }

        let 목표 = 가장잘맞는항목(항목들, 후보문구들);

        // 4) 목록에 없으면 "더 보기 / 레거시" 계열 항목을 펼쳐 봅니다.
        if (!목표) {
          const 더보기 = 항목들.find((el) => {
            const 글 = (el.innerText || "").toLowerCase();
            return (설정.더보기문구 || []).some((문구) => 글.includes(문구.toLowerCase()));
          });
          if (더보기) {
            마우스올리기(더보기);
            await 잠깐(300);
            진짜클릭(더보기);
            await 잠깐(500);
            항목들 = 메뉴항목모으기(설정);
            목표 = 가장잘맞는항목(항목들, 후보문구들);
          }
        }

        if (!목표) {
          await 메뉴닫기();
          return { 시도: true, 성공: false, 사유: "목록에 해당 모델 없음" };
        }

        진짜클릭(목표);
        await 잠깐(600);

        // 5) 정말 바뀌었는지 버튼 글자로 확인합니다.
        for (let i = 0; i < 8; i++) {
          const 지금 = 현재모델읽기(설정);
          if (지금 && 후보문구들.some((문구) => 지금.includes(문구))) {
            return { 시도: true, 성공: true };
          }
          await 잠깐(250);
        }
        // 확인용 라벨이 아예 없는 사이트라면 클릭한 것으로 성공 처리합니다.
        if (!현재모델읽기(설정)) return { 시도: true, 성공: true, 사유: "확인 불가(클릭됨)" };

        await 메뉴닫기(); // 6) 다음 회차를 위해 정리
      } catch (e) {
        await 메뉴닫기();
      }
    }

    return { 시도: true, 성공: false, 사유: "선택 확인 실패" };
  }

  /* ─────────────── 바로가기 표식 감지 ───────────────
   * 바탕화면/Dock의 "카페열기" 바로가기는 주소 끝에 #3ai-cafe 를 붙여
   * 사이트를 엽니다. 그 표식을 발견하면 백그라운드에 카페를 열라고 알립니다.
   * (크롬이 꺼져 있든 켜져 있든 동작하며, 별도 권한이 필요 없습니다)
   */
  if (location.hash === "#3ai-cafe") {
    try {
      history.replaceState(null, "", location.pathname + location.search);
      chrome.runtime.sendMessage({ 종류: "카페열기" }).catch(() => {});
    } catch (e) {
      /* 무시 */
    }
  }

  /* ─────────────── 호버 포커스 (겹침 배치용) ───────────────
   * 이 창이 뒤에 가려져 있을 때(포커스 없음) 마우스를 올리고
   * 잠깐(0.4초) 머물면 백그라운드에 "나를 앞으로" 신호를 보냅니다.
   * 실제로 앞으로 가져올지는 백그라운드가 설정·배치 모드를 보고 결정합니다.
   */
  let 호버타이머 = null;
  document.addEventListener("mousemove", () => {
    if (document.hasFocus()) return; // 이미 앞에 있으면 아무것도 안 함
    if (호버타이머) return; // 대기 중이면 중복 예약 안 함
    호버타이머 = setTimeout(() => {
      호버타이머 = null;
      if (!document.hasFocus()) {
        try {
          chrome.runtime.sendMessage({ 종류: "호버포커스" }).catch(() => {});
        } catch (e) {
          /* 확장이 재시작된 직후 등 — 무시 */
        }
      }
    }, 400);
  });
  document.addEventListener("mouseleave", () => {
    if (호버타이머) {
      clearTimeout(호버타이머);
      호버타이머 = null;
    }
  });

  /* ─────────────── 답변 완료 감지 (베스트 에포트) ───────────────
   * 답변 생성 중에는 "중지" 버튼이 나타났다가 끝나면 사라집니다.
   * 그 등장→소멸을 지켜보고 명령창에 상태(생성중/완료)를 알립니다.
   * 감지에 실패해도 전송 자체에는 아무 영향이 없습니다.
   */
  let 감시토큰 = 0; // 새 질문이 오면 이전 감시를 무효화하는 표식

  function 상태알리기(사이트키, 상태) {
    try {
      chrome.runtime
        .sendMessage({ 종류: "답변상태", 사이트: 사이트키, 상태 })
        .catch(() => {});
    } catch (e) {
      /* 무시 */
    }
  }

  async function 답변감시(설정, 사이트키) {
    const 내토큰 = ++감시토큰;

    // 1단계: 중지 버튼이 나타날 때까지 (최대 20초)
    let 시작감지 = false;
    for (let i = 0; i < 80 && 내토큰 === 감시토큰; i++) {
      if (요소찾기(설정.생성중표시 || [])) {
        시작감지 = true;
        break;
      }
      await 잠깐(250);
    }
    if (내토큰 !== 감시토큰) return;
    if (!시작감지) {
      // 중지 버튼 구조를 못 찾는 사이트 — 상태를 모른다고 알립니다.
      상태알리기(사이트키, "모름");
      return;
    }
    상태알리기(사이트키, "생성중");

    // 2단계: 중지 버튼이 사라질 때까지 (최대 5분).
    // 잠깐 사라졌다 다시 나타나는 깜빡임을 걸러내기 위해
    // 1초간 연속으로 안 보여야 완료로 판정합니다.
    let 안보인횟수 = 0;
    for (let i = 0; i < 1200 && 내토큰 === 감시토큰; i++) {
      if (요소찾기(설정.생성중표시 || [])) {
        안보인횟수 = 0;
      } else {
        안보인횟수++;
        if (안보인횟수 >= 4) {
          상태알리기(사이트키, "완료");
          return;
        }
      }
      await 잠깐(250);
    }
  }

  /* ─────────────── 답변 수집 (답변 모으기용) ───────────────
   * v1.18부터 두 갈래로 수집합니다.
   *   A안(기본): 사이트 자체 "복사" 버튼을 눌러 클립보드를 읽습니다.
   *              사이트가 만든 원본 마크다운이라 표·코드블록이 그대로 살아 있습니다.
   *   B안(폴백): A안이 안 되거나 품질검사에 걸리면, 답변 HTML을
   *              Turndown(+GFM 플러그인)으로 마크다운으로 변환합니다.
   * 어느 쪽을 썼는지·왜 그랬는지는 진단 기록으로 남겨 이력 패널에서 봅니다.
   */

  /** 화면에 있는 마지막(최신) 답변 덩어리를 찾습니다. */
  function 최신답변컨테이너(설정) {
    for (const 선택자 of 설정.답변블록 || []) {
      const 블록들 = document.querySelectorAll(선택자);
      if (블록들.length) {
        const 마지막 = 블록들[블록들.length - 1];
        if ((마지막.innerText || "").trim()) return 마지막;
      }
    }
    return null;
  }

  /* ── B안: HTML → 마크다운 변환기 (Turndown + GFM) ── */
  let 변환기캐시 = null;
  function 변환기가져오기() {
    if (변환기캐시) return 변환기캐시;
    if (typeof TurndownService === "undefined") return null;
    const 변환기 = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      hr: "---",
      emDelimiter: "*",
    });
    // 표·취소선·작업목록 등 GFM 문법 지원
    if (globalThis.turndownPluginGfm && globalThis.turndownPluginGfm.gfm) {
      변환기.use(globalThis.turndownPluginGfm.gfm);
    }
    // 코드블록: 내용 안에 백틱이 있으면 그보다 긴 펜스를 씁니다(중첩 백틱 대응).
    변환기.addRule("펜스코드블록", {
      filter: (노드) => 노드.nodeName === "PRE",
      replacement: (_내용, 노드) => {
        const 코드 = (노드.textContent || "").replace(/\n+$/, "");
        const 최장백틱 = (코드.match(/`+/g) || []).reduce(
          (큰, 조각) => Math.max(큰, 조각.length),
          0
        );
        const 펜스 = "`".repeat(Math.max(3, 최장백틱 + 1));
        const 클래스 =
          (노드.className || "") +
          " " +
          ((노드.firstElementChild && 노드.firstElementChild.className) || "");
        const 맞음 = 클래스.match(/(?:language|lang)-(\S+)/);
        return `\n\n${펜스}${맞음 ? 맞음[1] : ""}\n${코드}\n${펜스}\n\n`;
      },
    });
    변환기캐시 = 변환기;
    return 변환기;
  }

  function B안수집(컨테이너) {
    const 변환기 = 변환기가져오기();
    if (!변환기) return { 글: (컨테이너.innerText || "").trim(), 변환실패: true };
    try {
      return { 글: 변환기.turndown(컨테이너.innerHTML || "").trim() };
    } catch (e) {
      return { 글: (컨테이너.innerText || "").trim(), 변환실패: true };
    }
  }

  /* ── A안: 사이트 자체 복사 버튼 + 클립보드 ── */

  /** 답변 덩어리 근처(위로 5단계 조상까지)에서 복사 버튼을 찾습니다. */
  function 복사버튼찾기(설정, 컨테이너) {
    const 후보들 = 설정.복사버튼 || [];
    if (!후보들.length) return null;
    let 범위 = 컨테이너;
    for (let i = 0; i < 6 && 범위; i++) {
      for (const 선택자 of 후보들) {
        const 찾음 = 범위.querySelectorAll(선택자);
        if (찾음.length) return 찾음[찾음.length - 1];
      }
      범위 = 범위.parentElement;
    }
    // 조상 안에 없으면 문서 전체에서 마지막(=최신 답변) 것을 씁니다.
    for (const 선택자 of 후보들) {
      const 찾음 = document.querySelectorAll(선택자);
      if (찾음.length) return 찾음[찾음.length - 1];
    }
    return null;
  }

  /**
   * 복사 버튼을 눌러 클립보드에서 답변을 읽습니다.
   * 사용자의 원래 클립보드 내용은 미리 백업했다가 되돌려 놓습니다.
   * (그림 등 글자가 아닌 내용은 되돌릴 수 없어 경고를 함께 돌려줍니다)
   */
  async function A안수집(설정, 컨테이너) {
    const 버튼 = 복사버튼찾기(설정, 컨테이너);
    if (!버튼) return { 사유: "복사 버튼을 찾지 못함" };

    let 백업 = null;
    let 백업됨 = false;
    try {
      백업 = await navigator.clipboard.readText();
      백업됨 = true;
    } catch (e) {
      // 클립보드를 못 읽는 상황(창이 뒤에 있어 포커스가 없는 등)
      백업됨 = false;
    }

    let 글 = "";
    let 사유 = null;
    try {
      진짜클릭(버튼);
      // 사이트가 클립보드에 쓸 시간을 줍니다(내용이 바뀔 때까지 최대 1.5초).
      for (let i = 0; i < 6; i++) {
        await 잠깐(250);
        const 지금 = await navigator.clipboard.readText();
        if (지금 && (!백업됨 || 지금 !== 백업)) {
          글 = 지금;
          break;
        }
        글 = 지금 || "";
      }
      if (!글) 사유 = "복사 버튼을 눌렀지만 클립보드가 비어 있음";
    } catch (e) {
      사유 = "클립보드를 읽지 못함 (창이 앞에 없거나 권한 거부)";
    }

    // 클립보드 복구
    let 클립보드경고 = null;
    if (글) {
      if (백업됨) {
        if (백업 !== 글) {
          try {
            await navigator.clipboard.writeText(백업);
          } catch (e) {
            클립보드경고 = "클립보드 내용이 바뀌었습니다 (원래 내용 복구 실패)";
          }
        }
      } else {
        클립보드경고 =
          "클립보드 내용이 바뀌었습니다 (원래 내용을 백업하지 못해 복구 불가)";
      }
    }

    return { 글: (글 || "").trim(), 사유, 클립보드경고 };
  }

  /* ── 자가 품질검사: A안 결과가 원본 마크다운인지 판정 ── */
  function 품질검사(글, pre있음, table있음) {
    if (!글 || !글.trim()) return { 통과: false, 사유: "수집 텍스트가 비어 있음" };
    if (pre있음 && !글.includes("```")) {
      return { 통과: false, 사유: "코드블록이 있는데 ``` 펜스가 없음" };
    }
    if (table있음 && !/^[ \t]*\|/m.test(글)) {
      return { 통과: false, 사유: "표가 있는데 | 로 시작하는 줄이 없음" };
    }
    return { 통과: true };
  }

  /** 진단 기록을 콘솔에 찍고 백그라운드(이력 패널)로 보냅니다. */
  function 진단남기기(기록) {
    try {
      console.log(
        `[3대장 수집] ${기록.사이트} · ${기록.방식}안 · ` +
          `pre=${기록.pre있음} table=${기록.table있음} · ` +
          `${기록.길이}자 · 품질검사 ${기록.품질통과 ? "통과" : "실패"}` +
          (기록.품질사유 ? ` (${기록.품질사유})` : "")
      );
      chrome.runtime.sendMessage({ 종류: "수집진단", 기록 }).catch(() => {});
    } catch (e) {
      /* 무시 */
    }
  }

  /** 최신 답변을 A안 → (실패 시) B안으로 수집합니다. */
  async function 답변수집실행(사이트키, 설정) {
    const 컨테이너 = 최신답변컨테이너(설정);
    if (!컨테이너) {
      return { 성공: false, 사유: "답변을 찾지 못함 (selectors.js 갱신 필요)" };
    }
    const pre있음 = !!컨테이너.querySelector("pre");
    const table있음 = !!컨테이너.querySelector("table");

    const A = await A안수집(설정, 컨테이너);
    let 방식 = "A";
    let 글 = A.글 || "";
    let 품질 = 글
      ? 품질검사(글, pre있음, table있음)
      : { 통과: false, 사유: A.사유 || "복사 버튼 수집 실패" };

    if (!품질.통과) {
      // B안 폴백 — 답변 HTML을 마크다운으로 변환
      방식 = "B";
      const B = B안수집(컨테이너);
      글 = B.글 || "";
      품질 = Object.assign(
        {},
        품질검사(글, pre있음, table있음),
        { A안사유: 품질.사유, 변환실패: B.변환실패 || false }
      );
    }

    const 기록 = {
      시각: Date.now(),
      사이트: 설정.이름 || 사이트키,
      방식,
      pre있음,
      table있음,
      길이: 글.length,
      품질통과: !!품질.통과,
      품질사유: 품질.사유 || 품질.A안사유 || "",
    };
    진단남기기(기록);

    if (!글) {
      return { 성공: false, 사유: "답변 본문을 읽지 못함", 진단: 기록 };
    }
    return {
      성공: true,
      본문: 글.slice(0, 60000), // 지나치게 긴 답변은 앞부분만
      진단: 기록,
      클립보드경고: A.클립보드경고 || null,
    };
  }

  chrome.runtime.onMessage.addListener((메시지, _발신, 응답) => {
    if (메시지.종류 === "답변수집") {
      const 설정 = BRIDGE_SELECTORS[메시지.사이트];
      if (!설정) {
        응답({ 성공: false, 사유: "알 수 없는 사이트" });
        return;
      }
      답변수집실행(메시지.사이트, 설정).then(응답, () =>
        응답({ 성공: false, 사유: "답변 수집 중 오류" })
      );
      return true; // 비동기 응답
    }

    if (메시지.종류 !== "질문전송") return;

    (async () => {
      const 설정 = BRIDGE_SELECTORS[메시지.사이트];
      if (!설정) {
        응답({ 성공: false, 사유: "알 수 없는 사이트" });
        return;
      }

      // 모델 선택은 반드시 질문을 넣기 "전"에 합니다.
      // (모델을 바꾸면 입력란이 새로 그려지는 사이트가 있기 때문)
      const 모델결과 = await 모델선택시도(메시지.사이트, 설정, 메시지.희망모델);

      const 입력란 = await 요소대기(설정.입력란);
      if (!입력란) {
        응답({
          성공: false,
          사유: "입력란을 찾지 못함 (selectors.js 갱신 필요)",
          모델: 모델결과,
        });
        return;
      }

      // 첨부(파일·사진)를 먼저 붙입니다 — 실패해도 글 전송은 계속합니다.
      const 첨부결과 = await 첨부붙이기(설정, 입력란, 메시지.첨부);

      // 글자 넣기 + 길이 대조 + 필요하면 1회 자동 재주입 (v1.18 주입 안전망)
      const 주입결과 = 메시지.본문
        ? await 안전주입(설정, 요소찾기(설정.입력란) || 입력란, 메시지.본문)
        : { 성공: true }; // 첨부만 보내는 경우 글자 넣기는 생략
      if (!주입결과.성공 && 주입결과.비어있음) {
        응답({
          성공: false,
          사유: "입력란에 글자를 넣지 못함 (selectors.js 갱신 필요)",
          모델: 모델결과,
        });
        return;
      }
      // 잘렸지만 글자는 들어간 경우 — 전송은 막지 않고 사실만 함께 알립니다.
      const 주입알림 = 주입결과.주입불완전
        ? {
            주입불완전: true,
            원문길이: 주입결과.대조.원문길이,
            입력길이: 주입결과.대조.입력길이,
          }
        : 주입결과.재주입
        ? { 재주입: true }
        : {};

      const 전송결과 = await 전송하기(
        설정,
        입력란,
        !!(메시지.첨부 && 메시지.첨부.length)
      );
      if (!전송결과.성공) {
        응답(
          Object.assign({ 성공: false, 사유: 전송결과.사유, 모델: 모델결과 }, 주입알림)
        );
        return;
      }
      if (!첨부결과.성공) {
        // 글은 갔지만 첨부는 못 붙은 경우 — 알려는 주되 성공으로 처리
        응답(
          Object.assign({ 성공: true, 모델: 모델결과, 첨부실패: true }, 주입알림)
        );
        return;
      }
      // 전송 성공 → 백그라운드에서 답변 완료를 지켜봅니다 (응답을 막지 않음)
      답변감시(설정, 메시지.사이트);
      응답(Object.assign({ 성공: true, 모델: 모델결과 }, 주입알림));
    })();

    return true; // 비동기 응답 사용
  });
})();
