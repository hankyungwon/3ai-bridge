/**
 * diag.js — [진단 전용] 장문 잘림 추적용 계측 모듈
 * =====================================================
 * ★ 이 파일은 관찰(로깅)만 합니다. 어떤 동작도 바꾸지 않습니다. ★
 *
 * 규칙
 *  - 문자열 캡처는 100% 동기(sync). 해시 계산 같은 비동기 작업은
 *    setTimeout 으로 떼어 낸 별도 큐에서 처리합니다.
 *  - 주입·전송 경로에서는 절대 await 하지 않습니다.
 *  - 모든 호출은 try/catch 로 감싸 기존 흐름을 끊지 않습니다.
 *
 * 로드되는 곳: 명령바(popup), 각 사이트 탭(content script), 서비스워커.
 */

(() => {
  if (globalThis.진단기록) return;

  const 서비스워커냐 = typeof importScripts === "function";

  /** 정규화: \r\n → \n, NBSP → 공백, 양끝 공백 제거 */
  function 정규화문자열(글) {
    return String(글 ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/ /g, " ")
      .trim();
  }

  /** [진단 전용] 이 문서가 OS 포커스를 갖고 있는가 (문서가 없으면 null) */
  function 문서포커스() {
    try {
      return typeof document === "undefined" ? null : document.hasFocus();
    } catch (e) {
      return null;
    }
  }

  /** [진단 전용] 지금 활성 요소가 무엇인가 (태그 + class 앞 40자) */
  function 활성요소표시() {
    try {
      if (typeof document === "undefined") return "";
      const el = document.activeElement;
      if (!el) return "(없음)";
      const cls = String(el.className || "").slice(0, 40);
      return el.tagName + (cls ? "." + cls : "");
    } catch (e) {
      return "";
    }
  }

  function 바이트수(글) {
    try {
      return new TextEncoder().encode(글).length;
    } catch (e) {
      return -1;
    }
  }

  async function 해시(글) {
    try {
      const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(글)
      );
      return [...new Uint8Array(buf)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch (e) {
      return "";
    }
  }

  /**
   * 한 지점의 문자열을 기록합니다. (동기 캡처 → 비동기 후처리)
   * @param {object} 정보 {sendId, stage:"A"|"B"|"C"|"D", site, position, note}
   * @param {string} 원문 캡처된 문자열 (여기서 가공하지 않음)
   */
  function 진단기록(정보, 원문) {
    try {
      // ── 여기까지는 전부 동기: 타이밍에 영향 없음 ──
      const 글 = String(원문 ?? "");
      const 정규 = 정규화문자열(글);
      const 뼈대 = {
        sendId: 정보.sendId || "(없음)",
        stage: 정보.stage,
        site: 정보.site || "",
        position: 정보.position || 0,
        ts: (globalThis.performance || Date).now(),
        length: 글.length,
        byteLength: 바이트수(글),
        newlineCount: (글.match(/\n/g) || []).length,
        first64: 글.slice(0, 64),
        last64: 글.slice(-64),
        // [포커스 실측] execCommand 는 선택 영역에 의존하므로, 캡처 순간의
        // 포커스 상태를 그대로 남깁니다. 읽기만 하므로 타이밍 영향 없음.
        hasFocus: 문서포커스(),
        activeElTag: 활성요소표시(),
        sha256: "",
        sha256Norm: "",
        note: 정보.note || "",
      };

      // ── 이후는 전부 떼어 낸 큐: 호출자는 기다리지 않습니다 ──
      setTimeout(async () => {
        try {
          뼈대.sha256 = await 해시(글);
          뼈대.sha256Norm = await 해시(정규);
          await 진단저장(뼈대);
        } catch (e) {
          /* 진단이 본 기능을 방해하지 않도록 조용히 무시 */
        }
      }, 0);
    } catch (e) {
      /* 무시 */
    }
  }

  /** 링버퍼(최근 50건 전송)에 저장 — 서비스워커면 직접, 아니면 메시지로 위임 */
  async function 진단저장(레코드) {
    if (서비스워커냐) return 진단직접저장(레코드);
    try {
      await chrome.runtime.sendMessage({ 종류: "진단로그", 레코드 });
    } catch (e) {
      /* 무시 */
    }
  }

  /** 서비스워커에서만 실제 저장 (단일 지점이라 경쟁 조건이 적음) */
  async function 진단직접저장(레코드) {
    const { diagLogs } = await chrome.storage.local.get("diagLogs");
    const 목록 = Array.isArray(diagLogs) ? diagLogs : [];
    목록.push(레코드);
    // 최근 50건 "전송(sendId)" 기준 링버퍼
    const 아이디들 = [];
    for (const r of 목록) if (!아이디들.includes(r.sendId)) 아이디들.push(r.sendId);
    const 남길 = new Set(아이디들.slice(-50));
    await chrome.storage.local.set({
      diagLogs: 목록.filter((r) => 남길.has(r.sendId)),
    });
  }

  /** 전송 1회를 묶는 식별자 */
  function 진단아이디() {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return "id-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
    }
  }

  globalThis.진단기록 = 진단기록;
  globalThis.진단아이디 = 진단아이디;
  globalThis.진단직접저장 = 진단직접저장;
})();
