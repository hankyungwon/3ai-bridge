/**
 * senddiag.js — [진단 전용] 전송 경로 계측기
 * ============================================================
 * ★ 관찰만 합니다. 전송 동작을 한 글자도 바꾸지 않습니다. ★
 *
 * 대원칙 (지시서 0항)
 *  - 로그는 메모리 배열에만 쌓습니다. 대기 루프·클릭 경로에서 storage 쓰기·await 없음
 *  - 해시는 동기 FNV-1a 32비트. crypto.subtle 은 비동기라 쓰지 않습니다
 *    (진단용 지표일 뿐, 동일성의 절대 증명이 아닙니다)
 *  - 모든 기록에 schemaVersion·카페 버전·sessionId·sendId·사이트를 붙입니다
 *  - 시각은 상대(performance.now)와 절대(Date.now) 둘 다 남깁니다
 *
 * 이 파일은 전송 함수의 반환 시점·성공 판정·잠금 해제에 관여하지 않습니다.
 * 계측기는 전송 함수가 끝난 뒤에도 잠시 혼자 살아 있다가 스스로 정리됩니다.
 */

(() => {
  if (globalThis.전송진단) return;

  const SCHEMA = 3;
  const 세션ID = (() => {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return "s-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
    }
  })();
  const 카페버전 = (() => {
    try {
      return chrome.runtime.getManifest().version;
    } catch (e) {
      return "unknown";
    }
  })();

  /* ─────────── 동기 해시 (FNV-1a 32비트) ───────────
   * 짧고 빠릅니다. 충돌이 없다는 보장이 없으므로 "같다/다르다"의 참고값입니다.
   */
  function 해시(글) {
    const s = String(글 ?? "");
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return "fnv" + h.toString(16).padStart(8, "0");
  }

  /** 노드 동일성 판정 — outerHTML 이 아니라 실제 객체로 봅니다. */
  const 노드번호표 = new WeakMap();
  let 다음노드번호 = 1;
  function 노드번호(el) {
    if (!el) return null;
    let n = 노드번호표.get(el);
    if (!n) {
      n = 다음노드번호++;
      노드번호표.set(el, n);
    }
    return n;
  }

  /** 요소의 겉모습을 재는 중량 기록 (레이아웃을 건드리므로 체크포인트에서만) */
  function 요소상세(el) {
    if (!el) return null;
    try {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        노드번호: 노드번호(el),
        rect: { w: Math.round(r.width), h: Math.round(r.height) },
        display: cs.display,
        visibility: cs.visibility,
        pointerEvents: cs.pointerEvents,
        // offsetParent 는 position:fixed 요소에서 null 이 되므로 판정에 쓰지 않고
        // 기록만 합니다 (지시서 2항).
        offsetParent있음: el.offsetParent !== null,
        ariaLabel: el.getAttribute("aria-label"),
        dataTestid: el.getAttribute("data-testid"),
        type: el.getAttribute("type"),
        role: el.getAttribute("role"),
        태그: el.tagName,
      };
    } catch (e) {
      return { 계측오류: String(e && e.message) };
    }
  }

  /** 두 요소의 촌수 — 컨테이너 관계를 참/거짓이 아니라 거리로 기록 */
  function 촌수(입력란, 버튼) {
    try {
      if (!입력란 || !버튼) return null;
      const 조상 = [];
      for (let e = 입력란; e; e = e.parentElement) 조상.push(e);
      let 공통 = null;
      let 버튼단계 = 0;
      for (let e = 버튼; e; e = e.parentElement) {
        const i = 조상.indexOf(e);
        if (i >= 0) {
          공통 = e;
          return {
            동일form:
              !!(입력란.closest("form") && 입력란.closest("form") === 버튼.closest("form")),
            공통조상태그: e.tagName,
            공통조상id: e.id || null,
            공통조상역할: e.getAttribute("role") || null,
            입력창에서단계: i,
            버튼에서단계: 버튼단계,
          };
        }
        버튼단계++;
      }
      return { 동일form: false, 공통조상태그: null, 비고: "공통 조상 없음" };
    } catch (e) {
      return { 계측오류: String(e && e.message) };
    }
  }

  /* ─────────── 저장: 단일 직렬 큐 (지시서 7항) ───────────
   * 여러 계측기가 동시에 끝나도 read-modify-write 가 겹치지 않게,
   * 저장 작성자를 하나로 두고 순서대로 처리합니다.
   */
  const 상한건수 = 100;
  const 상한바이트 = 2 * 1024 * 1024;
  let 저장줄 = Promise.resolve();

  function 저장예약(레코드) {
    저장줄 = 저장줄
      .then(() => 실제저장(레코드))
      .catch((e) => {
        try {
          console.warn("[3대장 진단] 저장 실패:", e && e.message);
        } catch (_) {}
      });
    return 저장줄;
  }

  async function 실제저장(레코드) {
    const { sendLog } = await chrome.storage.local.get("sendLog");
    let 목록 = Array.isArray(sendLog) ? sendLog : [];
    목록.push(레코드);
    if (목록.length > 상한건수) 목록 = 목록.slice(-상한건수);
    // 2MB 는 JSON 직렬화 후 실제 바이트 기준입니다.
    let 바이트 = new TextEncoder().encode(JSON.stringify(목록)).length;
    while (목록.length > 1 && 바이트 > 상한바이트) {
      목록.shift();
      바이트 = new TextEncoder().encode(JSON.stringify(목록)).length;
    }
    if (바이트 > 상한바이트) {
      // 한 건만 남았는데도 넘치면 축약해 넣습니다.
      const 축약 = {
        sendId: 레코드.sendId,
        site: 레코드.site,
        결과코드: 레코드.결과코드,
        축약됨: true,
        사유: "단일 레코드가 2MB 상한을 넘어 축약함",
      };
      목록 = [축약];
      try {
        console.warn("[3대장 진단] 로그가 너무 커서 축약 저장했습니다.");
      } catch (_) {}
    }
    await chrome.storage.local.set({ sendLog: 목록 });
  }

  /* ─────────── 계측기 ─────────── */

  let 현재계측기 = null; // 겹침 감지용

  function 시작(사이트, 본문) {
    const sendId = (() => {
      try {
        return crypto.randomUUID();
      } catch (e) {
        return "id-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
      }
    })();

    const 계측기 = {
      sendId,
      site: 사이트,
      끝남: false, // finalized — 두 번 저장 금지
      시작시각: performance.now(),
      레코드: {
        schemaVersion: SCHEMA,
        카페버전,
        sessionId: 세션ID,
        sendId,
        site: 사이트,
        시작절대시각: Date.now(),
        목표길이: 본문 ? String(본문).length : 0,
        목표해시: 본문 ? 해시(본문) : null, // 최초 1회만 계산
        회차들: [],
        중량기록: [],
        클릭전달: [],
        스냅샷: [],
        사용자개입: [],
        메모: [],
        결과코드: null,
      },
      정리들: [], // 리스너 해제 함수
      타이머들: [],
      스냅샷완료: false,
      terminal받음: false,
      클릭실행됨: false,
    };

    // 앞선 계측기가 아직 살아 있으면 그 사실을 남기고 조기 종료시킵니다.
    // (다음 전송 자체는 절대 막지 않습니다 — 지시서 1항)
    if (현재계측기 && !현재계측기.끝남) {
      현재계측기.레코드.메모.push({
        종류: "NEXT-SEND-OVERLAP",
        overlappedBySendId: sendId,
        상대시각: performance.now(),
        절대시각: Date.now(),
      });
      종료(현재계측기, "NEXT-SEND-OVERLAP");
    }
    현재계측기 = 계측기;

    사용자개입감시(계측기);
    return 계측기;
  }

  /** 대기 루프 매 회차 — 경량 기록만 (레이아웃 건드리지 않음) */
  function 회차기록(계측기, 정보) {
    if (!계측기 || 계측기.끝남) return;
    try {
      계측기.레코드.회차들.push({
        회차: 정보.회차,
        경과ms: Math.round(performance.now() - 계측기.시작시각),
        내용맞음: 정보.내용맞음,
        목표길이: 정보.목표길이,
        실제길이: 정보.실제길이,
        버튼발견: !!정보.버튼,
        선택자: 정보.선택자 || null,
        disabled: 정보.버튼 ? !!정보.버튼.disabled : null,
        ariaDisabled: 정보.버튼 ? 정보.버튼.getAttribute("aria-disabled") : null,
        노드번호: 노드번호(정보.버튼),
      });
    } catch (e) {
      /* 진단이 전송을 방해하지 않게 */
    }
  }

  /** 중량 체크포인트 — 첫 발견·노드 교체·상태 변화·클릭 직전·최종 실패에서만 */
  function 체크포인트(계측기, 이름, 정보) {
    if (!계측기 || 계측기.끝남) return;
    try {
      계측기.레코드.중량기록.push({
        이름,
        상대시각: Math.round(performance.now() - 계측기.시작시각),
        절대시각: Date.now(),
        선택자: 정보.선택자 || null,
        후보통계: 정보.후보통계 || null,
        버튼: 요소상세(정보.버튼),
        입력창: 요소상세(정보.입력란),
        관계: 촌수(정보.입력란, 정보.버튼),
        실제해시: 정보.실제글자 != null ? 해시(정보.실제글자) : null,
        실제길이: 정보.실제글자 != null ? 정보.실제글자.length : null,
        불일치: 정보.불일치 || null,
      });
    } catch (e) {
      /* 무시 */
    }
  }

  /**
   * 내용이 어긋났을 때 — 원문 조각 대신 "어디서부터 다른지"만 남깁니다.
   * 공백류를 구분할 수 있게 코드포인트로 기록합니다 (U+0020/U+00A0/U+200B 등).
   */
  function 불일치분석(목표, 실제) {
    try {
      const n = Math.min(목표.length, 실제.length);
      let i = 0;
      while (i < n && 목표[i] === 실제[i]) i++;
      const 코드 = (s, 시작) =>
        [...s.slice(Math.max(0, 시작 - 3), 시작 + 3)].map(
          (c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")
        );
      return {
        최초불일치위치: i,
        목표주변코드포인트: 코드(목표, i),
        실제주변코드포인트: 코드(실제, i),
        목표길이: 목표.length,
        실제길이: 실제.length,
        목표해시: 해시(목표),
        실제해시: 해시(실제),
      };
    } catch (e) {
      return { 계측오류: String(e && e.message) };
    }
  }

  /* ─────────── 클릭 전달 계측 (지시서 3항) ───────────
   * 읽기 전용입니다. preventDefault·stopPropagation 을 절대 호출하지 않습니다.
   */
  function 클릭전달감시(계측기, 버튼, 입력란) {
    if (!계측기 || 계측기.끝남) return () => {};
    const 폼 = (입력란 && 입력란.closest("form")) || (버튼 && 버튼.closest("form"));
    const 남기기 = (항목) => {
      try {
        계측기.레코드.클릭전달.push(
          Object.assign(
            { 상대시각: Math.round(performance.now() - 계측기.시작시각), 절대시각: Date.now() },
            항목
          )
        );
      } catch (e) {
        /* 무시 */
      }
    };

    const 버튼클릭 = (e) => {
      const 경로 = typeof e.composedPath === "function" ? e.composedPath() : [];
      남기기({
        지점: "버튼.click",
        isTrusted: e.isTrusted,
        eventPhase: e.eventPhase,
        defaultPrevented: e.defaultPrevented,
        경로에버튼포함: 경로.includes(버튼),
        경로에폼포함: 폼 ? 경로.includes(폼) : null,
      });
    };
    const 문서캡처 = (e) => {
      const 경로 = typeof e.composedPath === "function" ? e.composedPath() : [];
      남기기({
        지점: "document.click(캡처)",
        isTrusted: e.isTrusted,
        eventPhase: e.eventPhase,
        defaultPrevented: e.defaultPrevented,
        경로에버튼포함: 경로.includes(버튼),
      });
    };
    const 문서버블 = (e) => {
      남기기({
        지점: "document.click(버블)",
        isTrusted: e.isTrusted,
        eventPhase: e.eventPhase,
        defaultPrevented: e.defaultPrevented,
      });
    };
    const 폼클릭 = (e) => {
      const 경로 = typeof e.composedPath === "function" ? e.composedPath() : [];
      남기기({
        지점: "form.click",
        isTrusted: e.isTrusted,
        경로에버튼포함: 경로.includes(버튼),
      });
    };
    // submit 이벤트 경로에는 버튼이 포함되지 않습니다.
    // 그래서 composedPath 로 대조하지 않고 target·submitter 로 봅니다.
    const 폼전송 = (e) => {
      let submitter판정 = "SUBMITTER-UNKNOWN";
      try {
        if ("submitter" in e) {
          submitter판정 = e.submitter === 버튼 ? "SUBMITTER-IS-BUTTON" : "SUBMITTER-OTHER";
        }
      } catch (_) {}
      남기기({
        지점: "form.submit",
        isTrusted: e.isTrusted,
        defaultPrevented: e.defaultPrevented,
        target이대상폼: e.target === 폼,
        submitter: submitter판정,
      });
      계측기.레코드.메모.push({ 종류: "SUBMIT-OBSERVED", 상대시각: performance.now() });
    };

    try {
      버튼 && 버튼.addEventListener("click", 버튼클릭, true);
      document.addEventListener("click", 문서캡처, true);
      document.addEventListener("click", 문서버블, false);
      폼 && 폼.addEventListener("click", 폼클릭, true);
      폼 && 폼.addEventListener("submit", 폼전송, true);
    } catch (e) {
      /* 무시 */
    }

    // 버튼·document 리스너는 click() 반환 직후 뗍니다.
    // 폼 submit 리스너는 스냅샷이 끝날 때까지 둡니다(지시서 3항).
    const 즉시해제 = () => {
      try {
        버튼 && 버튼.removeEventListener("click", 버튼클릭, true);
        document.removeEventListener("click", 문서캡처, true);
        document.removeEventListener("click", 문서버블, false);
        폼 && 폼.removeEventListener("click", 폼클릭, true);
      } catch (e) {
        /* 무시 */
      }
    };
    계측기.정리들.push(() => {
      즉시해제();
      try {
        폼 && 폼.removeEventListener("submit", 폼전송, true);
      } catch (e) {
        /* 무시 */
      }
    });
    return 즉시해제;
  }

  /* ─────────── 클릭 후 스냅샷 (지시서 4항) ───────────
   * 클릭 직후 / 100ms / 500ms / 2초. 전송 함수를 기다리게 하지 않습니다.
   */
  function 스냅샷예약(계측기, 설정, 입력란) {
    if (!계측기 || 계측기.끝남) return;
    계측기.클릭실행됨 = true;
    const 찍기 = (이름) => {
      if (계측기.끝남) return;
      try {
        계측기.레코드.스냅샷.push(상태읽기(이름, 계측기, 설정, 입력란));
      } catch (e) {
        /* 무시 */
      }
    };
    찍기("클릭직후");
    for (const [지연, 이름] of [
      [100, "100ms"],
      [500, "500ms"],
      [2000, "2초"],
    ]) {
      const t = setTimeout(() => {
        찍기(이름);
        if (이름 === "2초") {
          계측기.스냅샷완료 = true;
          종료검토(계측기);
        }
      }, 지연);
      계측기.타이머들.push(t);
    }
  }

  function 상태읽기(이름, 계측기, 설정, 입력란) {
    const 찾기 = globalThis.__3대장_요소찾기;
    const 지금입력란 = (찾기 && 찾기(설정.입력란)) || 입력란;
    const 글 = 지금입력란 ? 지금입력란.value ?? 지금입력란.innerText ?? "" : "";
    const 버튼 = 찾기 ? 찾기(설정.전송버튼) : null;
    const 말풍선들 = 사용자말풍선들(설정);
    const 마지막 = 말풍선들[말풍선들.length - 1];
    return {
      이름,
      상대시각: Math.round(performance.now() - 계측기.시작시각),
      절대시각: Date.now(),
      입력창길이: 글.length,
      입력창해시: 해시(글),
      버튼있음: !!버튼,
      버튼disabled: 버튼 ? !!버튼.disabled : null,
      버튼ariaDisabled: 버튼 ? 버튼.getAttribute("aria-disabled") : null,
      사용자말풍선수: 말풍선들.length,
      마지막말풍선해시: 마지막 ? 해시(마지막.innerText || "") : null,
      마지막말풍선길이: 마지막 ? (마지막.innerText || "").length : null,
      생성중표시: 찾기 ? !!찾기(설정.생성중표시 || []) : null,
      첨부: 첨부상태(설정),
    };
  }

  /** 진단 전용 말풍선 선택자 — 기존 수집·성공 판정 경로에서는 쓰지 않습니다. */
  function 사용자말풍선들(설정) {
    try {
      const 후보들 = (설정.진단 && 설정.진단.사용자말풍선) || [];
      for (const 선택자 of 후보들) {
        const 목록 = document.querySelectorAll(선택자);
        if (목록.length) return [...목록];
      }
    } catch (e) {
      /* 무시 */
    }
    return [];
  }

  /** 첨부 상태 — 파일 이름 원문은 저장하지 않고 해시·개수만 남깁니다. */
  function 첨부상태(설정) {
    try {
      const 진단 = 설정.진단 || {};
      const 세기 = (후보들) => {
        for (const s of 후보들 || []) {
          const n = document.querySelectorAll(s).length;
          if (n) return n;
        }
        return 0;
      };
      return {
        작성기내첨부수: 세기(진단.첨부항목),
        업로드중수: 세기(진단.업로드중),
        오류표시수: 세기(진단.첨부오류),
        제거버튼수: 세기(진단.첨부제거),
      };
    } catch (e) {
      return null;
    }
  }

  /* ─────────── 사용자 개입 로그 (지시서 6항) ───────────
   * isTrusted === true 인 것만 이 계층에 남깁니다.
   * 입력된 실제 문자는 저장하지 않습니다.
   */
  function 사용자개입감시(계측기) {
    const 남기기 = (종류, e, 추가) => {
      try {
        if (!e.isTrusted) return; // 자동 클릭은 클릭전달 계층에서 따로 봅니다
        계측기.레코드.사용자개입.push(
          Object.assign(
            {
              종류,
              상대시각: Math.round(performance.now() - 계측기.시작시각),
              절대시각: Date.now(),
              대상태그: e.target && e.target.tagName,
              대상역할: e.target && e.target.getAttribute && e.target.getAttribute("role"),
            },
            추가 || {}
          )
        );
      } catch (_) {}
    };

    const 핸들러들 = [
      ["beforeinput", (e) => 남기기("편집", e, { inputType: e.inputType })],
      ["input", (e) => 남기기("편집", e, { inputType: e.inputType })],
      ["paste", (e) => 남기기("붙여넣기", e)],
      ["drop", (e) => 남기기("끌어놓기", e)],
      ["compositionstart", (e) => 남기기("한글조합시작", e)],
      ["compositionend", (e) => 남기기("한글조합끝", e)],
      [
        "click",
        (e) => {
          const t = e.target;
          const 버튼인가 = t && t.closest && t.closest("button");
          남기기(버튼인가 ? "버튼수동클릭" : "화면클릭", e, {
            버튼라벨: 버튼인가 ? 버튼인가.getAttribute("aria-label") : null,
            버튼testid: 버튼인가 ? 버튼인가.getAttribute("data-testid") : null,
          });
        },
      ],
    ];

    for (const [종류, fn] of 핸들러들) {
      try {
        document.addEventListener(종류, fn, true);
      } catch (e) {
        /* 무시 */
      }
    }
    계측기.정리들.push(() => {
      for (const [종류, fn] of 핸들러들) {
        try {
          document.removeEventListener(종류, fn, true);
        } catch (e) {
          /* 무시 */
        }
      }
    });
  }

  /* ─────────── 종료 ─────────── */

  /** 전송 함수가 끝났음을 알립니다 (terminal). 계측기는 이걸로 바로 끝나지 않을 수 있습니다. */
  function 종료신호(계측기, 결과코드) {
    if (!계측기 || 계측기.끝남) return;
    계측기.terminal받음 = true;
    계측기.레코드.결과코드 = 결과코드 || null;
    계측기.레코드.종료절대시각 = Date.now();
    계측기.레코드.전송함수경과ms = Math.round(performance.now() - 계측기.시작시각);
    종료검토(계측기);
  }

  function 종료검토(계측기) {
    if (계측기.끝남) return;
    // 클릭이 실행된 전송은 스냅샷 2초까지 마치고 terminal 도 받아야 끝냅니다.
    if (계측기.클릭실행됨) {
      if (계측기.스냅샷완료 && 계측기.terminal받음) 종료(계측기, "정상");
      return;
    }
    // 클릭이 없었던 전송은 terminal 만 오면 바로 끝냅니다.
    if (계측기.terminal받음) 종료(계측기, "정상");
  }

  function 종료(계측기, 사유) {
    if (!계측기 || 계측기.끝남) return; // 멱등성
    계측기.끝남 = true;
    for (const t of 계측기.타이머들) {
      try {
        clearTimeout(t);
      } catch (e) {
        /* 무시 */
      }
    }
    for (const 정리 of 계측기.정리들) {
      try {
        정리();
      } catch (e) {
        /* 무시 */
      }
    }
    계측기.레코드.계측종료사유 = 사유;
    if (현재계측기 === 계측기) 현재계측기 = null;
    저장예약(계측기.레코드);
  }

  // 탭이 닫히거나 이동하면 남은 기록을 최선을 다해 저장합니다.
  window.addEventListener("pagehide", () => {
    const 계측기 = 현재계측기;
    if (!계측기 || 계측기.끝남) return;
    계측기.레코드.메모.push({ 종류: "TAB-UNLOAD-BEST-EFFORT", 절대시각: Date.now() });
    종료(계측기, "TAB-UNLOAD-BEST-EFFORT");
    // 여기서부터는 저장 완료를 보장할 수 없습니다.
    계측기.레코드.저장확인 = "SAVE-NOT-CONFIRMED";
  });

  globalThis.전송진단 = {
    시작,
    회차기록,
    체크포인트,
    불일치분석,
    클릭전달감시,
    스냅샷예약,
    종료신호,
    해시,
    노드번호,
  };
})();
