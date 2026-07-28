/**
 * content.js — 각 사이트 페이지 안에서 실제로 "타이핑하고 전송"하는 부분
 * 선택자는 이 파일에 적지 않고 selectors.js 에서 가져다 씁니다.
 */

(() => {
  // 같은 탭에 두 번 주입되어도 문제없게 표시를 남깁니다.
  if (globalThis.__3대장브리지_적재됨) return;
  globalThis.__3대장브리지_적재됨 = true;

  const 잠깐 = (밀리초) => new Promise((r) => setTimeout(r, 밀리초));

  // [진단 전용] diag.js 가 아직 없는 탭에서도 절대 오류가 나지 않게 하는 안전판
  const 진단기록 = (정보, 글) => {
    try {
      if (globalThis.진단기록) globalThis.진단기록(정보, 글);
    } catch (e) {
      /* 무시 */
    }
  };

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

  /** [진단 전용] 입력란 원문을 다듬지 않고 그대로 읽습니다. */
  function 진단원문읽기(요소) {
    if (!요소) return "";
    return 요소.value ?? 요소.innerText ?? 요소.textContent ?? "";
  }

  /**
   * [진단 전용] 전송 뒤 내 말풍선(사용자 메시지)의 글자를 읽습니다.
   * 제미나이는 긴 질문을 접어서 보여 줄 수 있어, 접힘이 보이면 펼쳐 본 뒤 읽습니다.
   * 전송 흐름과 완전히 분리된 자리에서만 호출합니다(await 하지 않음).
   */
  async function 진단말풍선캡처(설정, 사이트키, 꼬리표) {
    try {
      await 잠깐(2500);
      let 펼침 = "펼치기 안 함";
      const 말풍선 = 요소찾기(설정.사용자말풍선 || []);
      if (!말풍선) {
        진단기록({ ...꼬리표, stage: "D", note: "unreadable(말풍선 없음)" }, "");
        return;
      }
      // 접혀 있으면 펼쳐 봅니다 (진단 전용 · 실패해도 그대로 진행)
      for (const 선택자 of 설정.펼치기버튼 || []) {
        const 버튼 = 말풍선.querySelector(선택자) ||
          (말풍선.parentElement && 말풍선.parentElement.querySelector(선택자));
        if (버튼) {
          try {
            버튼.click();
            펼침 = "펼치기 시도함";
            await 잠깐(600);
          } catch (e) {
            /* 무시 */
          }
          break;
        }
      }
      const 다시 = 요소찾기(설정.사용자말풍선 || []) || 말풍선;
      const 글 = 다시.textContent ?? "";
      진단기록(
        { ...꼬리표, stage: "D", note: `textContent 읽음 · ${펼침}` },
        글
      );
    } catch (e) {
      진단기록({ ...꼬리표, stage: "D", note: "unreadable(예외)" }, "");
    }
  }

  /** 입력란(어떤 종류든)에 현재 들어 있는 글자를 읽습니다. */
  function 입력란글자(요소) {
    if (!요소) return "";
    return (요소.value ?? 요소.innerText ?? "").trim();
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

  /* ─────────────── 답변 수집 (답변 모으기용) ─────────────── */

  function 최신답변가져오기(설정) {
    for (const 선택자 of 설정.답변블록 || []) {
      const 블록들 = document.querySelectorAll(선택자);
      if (블록들.length) {
        const 마지막 = 블록들[블록들.length - 1];
        const 글 = (마지막.innerText || "").trim();
        if (글) return 글.slice(0, 30000); // 지나치게 긴 답변은 앞부분만
      }
    }
    return null;
  }

  chrome.runtime.onMessage.addListener((메시지, _발신, 응답) => {
    if (메시지.종류 === "답변수집") {
      const 설정 = BRIDGE_SELECTORS[메시지.사이트];
      const 본문 = 설정 ? 최신답변가져오기(설정) : null;
      응답(
        본문
          ? { 성공: true, 본문 }
          : { 성공: false, 사유: "답변을 찾지 못함 (selectors.js 갱신 필요)" }
      );
      return; // 동기 응답
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

      // [진단 B] 주입 함수가 실제로 받은 문자열 — 주입 실행 직전, 동기 캡처
      const 꼬리표 = {
        sendId: 메시지.sendId,
        site: 메시지.사이트,
        position: 메시지.position,
      };
      진단기록({ ...꼬리표, stage: "B", note: "주입 직전 수신값" }, 메시지.본문 ?? "");

      const 넣기성공 = 메시지.본문
        ? await 글자넣기(요소찾기(설정.입력란) || 입력란, 메시지.본문)
        : true; // 첨부만 보내는 경우 글자 넣기는 생략
      if (!넣기성공) {
        응답({
          성공: false,
          사유: "입력란에 글자를 넣지 못함 (selectors.js 갱신 필요)",
          모델: 모델결과,
        });
        return;
      }

      // [진단 C] 주입 직후 입력란에서 다시 읽은 값 — 전송 트리거 직전, 동기 캡처
      진단기록(
        { ...꼬리표, stage: "C", note: "전송 직전 입력란 원문" },
        진단원문읽기(요소찾기(설정.입력란) || 입력란)
      );

      const 전송결과 = await 전송하기(
        설정,
        입력란,
        !!(메시지.첨부 && 메시지.첨부.length)
      );
      if (!전송결과.성공) {
        응답({ 성공: false, 사유: 전송결과.사유, 모델: 모델결과 });
        return;
      }
      if (!첨부결과.성공) {
        // 글은 갔지만 첨부는 못 붙은 경우 — 알려는 주되 성공으로 처리
        응답({ 성공: true, 모델: 모델결과, 첨부실패: true });
        return;
      }
      // 전송 성공 → 백그라운드에서 답변 완료를 지켜봅니다 (응답을 막지 않음)
      답변감시(설정, 메시지.사이트);
      // [진단 D] 전송 후 말풍선 캡처 — 기다리지 않고 떼어 냅니다.
      진단말풍선캡처(설정, 메시지.사이트, 꼬리표);
      응답({ 성공: true, 모델: 모델결과 });
    })();

    return true; // 비동기 응답 사용
  });
})();
