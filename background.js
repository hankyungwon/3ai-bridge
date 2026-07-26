/**
 * background.js — 확장의 "지휘자" 역할 (서비스 워커)
 * - 단축키(Alt+3)를 받아 3개 창을 열고 화면을 가로 3등분해 배치합니다.
 * - 팝업에서 온 질문을 각 사이트 탭으로 전달하고 결과를 모아 돌려줍니다.
 */

importScripts("selectors.js", "config.js");

/* ────────────────────────────── 창 열기·배치 ────────────────────────────── */

/**
 * 창을 펼칠 모니터의 작업 영역(작업표시줄·독 제외)을 구합니다.
 * 모니터가 여러 대면 "지금 쓰고 있는 크롬 창이 있는 모니터"를 기준으로 잡아,
 * 맥미니+외장 모니터, 노트북+보조 모니터 어떤 조합에서도
 * 사용자가 보고 있는 화면에 3분할이 펼쳐지게 합니다.
 */
async function 화면영역구하기() {
  try {
    const 디스플레이 = await chrome.system.display.getInfo();
    let 기준화면 = null;

    // 마지막으로 사용한 크롬 창의 중심점이 들어 있는 모니터를 찾습니다.
    try {
      const 창 = await chrome.windows.getLastFocused();
      const 중심X = (창.left ?? 0) + (창.width ?? 0) / 2;
      const 중심Y = (창.top ?? 0) + (창.height ?? 0) / 2;
      기준화면 = 디스플레이.find((d) => {
        const w = d.workArea;
        return (
          중심X >= w.left &&
          중심X < w.left + w.width &&
          중심Y >= w.top &&
          중심Y < w.top + w.height
        );
      });
    } catch (e) {
      /* 창이 하나도 없으면 아래에서 주 모니터를 사용 */
    }

    const 화면 = 기준화면 || 디스플레이.find((d) => d.isPrimary) || 디스플레이[0];
    return 화면.workArea; // {left, top, width, height}
  } catch (e) {
    // system.display 를 쓸 수 없는 경우의 안전한 기본값
    return { left: 0, top: 0, width: 1440, height: 900 };
  }
}

/**
 * 해당 사이트가 이미 열려 있는 탭을 찾습니다. 없으면 null.
 * - 아직 로딩 중인 탭(pendingUrl)과 일시적 오류 상태의 탭도 놓치지 않도록,
 *   URL 패턴 검색 대신 전체 탭을 직접 확인합니다.
 * - 같은 사이트 탭이 여러 개면 "가장 최근에 본 탭"을 골라,
 *   후속 질문이 사용자가 실제로 보던 대화에 이어지게 합니다.
 */
async function 기존탭찾기(사이트키) {
  const 호스트들 = BRIDGE_SELECTORS[사이트키].호스트;
  const 전체탭 = await chrome.tabs.query({});
  const 일치 = 전체탭.filter((t) => {
    const 주소 = t.url || t.pendingUrl || "";
    return 호스트들.some((h) => 주소.includes("://" + h));
  });
  if (!일치.length) return null;
  일치.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return 일치[0];
}

/** 잠깐 기다리는 도우미 (밀리초) */
function 잠깐(밀리초) {
  return new Promise((r) => setTimeout(r, 밀리초));
}

/** 탭이 다 열릴 때까지 최대 15초 기다립니다. */
async function 탭준비대기(탭ID) {
  for (let i = 0; i < 30; i++) {
    try {
      const 탭 = await chrome.tabs.get(탭ID);
      if (탭.status === "complete") return true;
    } catch (e) {
      return false;
    }
    await 잠깐(500);
  }
  return false;
}

/**
 * 실제로 적용할 배치 모드를 정합니다.
 * "auto"면 화면 폭으로 판단: 1600px 미만(노트북급)은 겹침, 그 이상은 3분할.
 */
function 실효배치모드(설정, 영역) {
  if (설정.배치모드 === "thirds" || 설정.배치모드 === "overlap") {
    return 설정.배치모드;
  }
  return 영역.width < 1600 ? "overlap" : "thirds";
}

/**
 * 모드에 따라 사이트별 창 위치를 계산합니다.
 * - 3분할(thirds): 각 창이 1/3 폭으로 나란히
 * - 겹침(overlap): 각 창이 1/2 폭.
 *     왼쪽 창은 화면 왼쪽 절반, 오른쪽 창은 화면 오른쪽 절반,
 *     가운데 창은 화면 중앙(1/4~3/4 지점)에서 양쪽을 반씩 가리며 맨 앞.
 */
function 배치계산(영역, 순서, 모드) {
  const 위치들 = {};
  const 공통 = { top: 영역.top, height: 영역.height };

  if (모드 === "overlap") {
    const 반 = Math.floor(영역.width / 2);
    위치들[순서[0]] = { left: 영역.left, width: 반, ...공통 };
    위치들[순서[2]] = { left: 영역.left + 영역.width - 반, width: 반, ...공통 };
    위치들[순서[1]] = { left: 영역.left + Math.floor(영역.width / 4), width: 반, ...공통 };
  } else {
    const 폭 = Math.floor(영역.width / 순서.length);
    순서.forEach((키, i) => {
      const 마지막 = i === 순서.length - 1;
      위치들[키] = {
        left: 영역.left + 폭 * i,
        // 마지막 창은 나누고 남은 픽셀까지 채워 화면 오른쪽에 틈이 없게 합니다.
        width: 마지막 ? 영역.width - 폭 * (순서.length - 1) : 폭,
        ...공통,
      };
    });
  }
  return 위치들;
}

/** 한 사이트 창을 지정 위치로 배치하고 탭 ID를 반환합니다. */
async function 사이트창배치(사이트키, 위치) {
  const 사이트 = BRIDGE_SELECTORS[사이트키];
  const 기존 = await 기존탭찾기(사이트키);
  if (기존) {
    const 창 = await chrome.windows.get(기존.windowId, { populate: true });
    if (창.tabs && 창.tabs.length > 1) {
      // 다른 탭들과 같은 창에 있으면 이 탭만 떼어내 전용 창으로 만듭니다.
      // (사용자의 메인 브라우저 창을 건드리지 않음)
      await chrome.windows.create({
        tabId: 기존.id,
        type: "normal",
        focused: false,
        ...위치,
      });
    } else {
      // 전용 창이면 위치만 다시 잡습니다.
      // (최대화 상태에서는 크기 지정이 무시되므로 먼저 보통 상태로 되돌립니다)
      if (창.state !== "normal") {
        await chrome.windows.update(창.id, { state: "normal" });
      }
      await chrome.windows.update(창.id, 위치);
    }
    await chrome.tabs.update(기존.id, { active: true });
    return 기존.id;
  }
  const 새창 = await chrome.windows.create({
    url: 사이트.시작URL,
    type: "normal",
    focused: false,
    ...위치,
  });
  return 새창.tabs && 새창.tabs[0] ? 새창.tabs[0].id : null;
}

/**
 * 3개 창을 열고 배치합니다 (모드에 따라 3분할 또는 겹침).
 * - 이미 열려 있는 사이트는 새로 열지 않고 재사용합니다(대화 유지).
 * - 겹침 모드에서는 가운데 창을 마지막에 배치·포커스해 맨 앞에 둡니다.
 * - 방금 만든/찾은 탭의 ID 지도를 반환해, 전송 단계가 탭을 다시 검색하다
 *   놓치는 일이 없게 합니다.
 */
async function 창정리() {
  const 설정 = await 설정불러오기();
  const 순서 = 설정.창순서;
  const 영역 = await 화면영역구하기();
  const 모드 = 실효배치모드(설정, 영역);
  const 위치들 = 배치계산(영역, 순서, 모드);
  const 탭지도 = {};

  // 겹침 모드에서는 가운데(순서[1])를 마지막에 처리해 맨 앞에 오게 합니다.
  const 처리순서 =
    모드 === "overlap" ? [순서[0], 순서[2], 순서[1]] : [...순서];

  for (const 사이트키 of 처리순서) {
    try {
      탭지도[사이트키] = await 사이트창배치(사이트키, 위치들[사이트키]);
    } catch (e) {
      // 한 창 배치가 실패해도 나머지 창 배치는 계속합니다.
      탭지도[사이트키] = null;
    }
  }

  // 겹침 모드: 가운데 창을 앞으로 (호버 포커스 판단용으로 모드도 기억)
  await chrome.storage.session.set({ 현재배치모드: 모드 });
  if (모드 === "overlap" && 탭지도[순서[1]]) {
    try {
      const 탭 = await chrome.tabs.get(탭지도[순서[1]]);
      await chrome.windows.update(탭.windowId, { focused: true });
    } catch (e) {
      /* 무시 */
    }
  }
  return 탭지도;
}

/* ─────────────────── 리모컨 기능: 모두 닫기 / 새 대화 ─────────────────── */

/** 세 사이트의 전용 창(또는 탭)을 한 번에 닫습니다. */
async function 모두닫기() {
  const 설정 = await 설정불러오기();
  for (const 사이트키 of 설정.창순서) {
    try {
      const 탭 = await 기존탭찾기(사이트키);
      if (!탭) continue;
      const 창 = await chrome.windows.get(탭.windowId, { populate: true });
      if (창.tabs && 창.tabs.length > 1) {
        // 다른 탭과 같은 창이면 그 탭만 닫습니다.
        await chrome.tabs.remove(탭.id);
      } else {
        await chrome.windows.remove(창.id);
      }
    } catch (e) {
      /* 한 곳 실패해도 나머지는 계속 */
    }
  }
}

/** 세 사이트 모두 새 대화 화면으로 이동합니다(열려 있는 곳만). */
async function 새대화시작() {
  const 설정 = await 설정불러오기();
  for (const 사이트키 of 설정.창순서) {
    try {
      const 탭 = await 기존탭찾기(사이트키);
      if (탭) {
        await chrome.tabs.update(탭.id, {
          url: BRIDGE_SELECTORS[사이트키].시작URL,
        });
      }
    } catch (e) {
      /* 무시 */
    }
  }
}

/* ─────────────────────── 떠 있는 명령창 (드래그 가능) ─────────────────────── */

/**
 * 질문을 입력하는 "명령창"을 독립된 작은 창으로 엽니다.
 * 확장 기본 팝업은 다른 곳을 클릭하면 자동으로 닫히지만,
 * 이 창은 계속 떠 있고 제목줄을 잡아 어디로든 끌고 다닐 수 있습니다.
 * 이미 열려 있으면 새로 만들지 않고 앞으로 가져옵니다.
 */
async function 명령창열기() {
  // 서비스 워커가 재시작돼도 기억하도록 세션 저장소에 창 ID를 보관합니다.
  const { 명령창ID } = await chrome.storage.session.get("명령창ID");
  if (명령창ID) {
    try {
      await chrome.windows.update(명령창ID, { focused: true });
      return 명령창ID;
    } catch (e) {
      /* 창이 이미 닫혔으면 아래에서 새로 만듭니다 */
    }
  }

  const 영역 = await 화면영역구하기();
  const 창폭 = 420;
  const 창높이 = 560;
  const 새창 = await chrome.windows.create({
    url: "popup.html",
    type: "popup", // 주소창 없는 작은 창
    width: 창폭,
    height: 창높이,
    // 기본 위치: 화면 오른쪽 아래 (이후엔 사용자가 끌어다 놓은 대로)
    left: 영역.left + 영역.width - 창폭 - 24,
    top: 영역.top + 영역.height - 창높이 - 24,
    focused: true,
  });
  await chrome.storage.session.set({ 명령창ID: 새창.id });
  return 새창.id;
}

/** 명령창이 3분할 창들 뒤에 가려지지 않게 다시 앞으로 가져옵니다. */
async function 명령창앞으로() {
  const { 명령창ID } = await chrome.storage.session.get("명령창ID");
  if (!명령창ID) return;
  try {
    await chrome.windows.update(명령창ID, { focused: true });
  } catch (e) {
    /* 닫혀 있으면 무시 */
  }
}

// 확장 아이콘 클릭 → 명령창 열기
chrome.action.onClicked.addListener(() => {
  명령창열기();
});

// 단축키(Alt+3) → 3개 창 배치 후 명령창을 맨 앞에 띄우기
chrome.commands.onCommand.addListener(async (명령) => {
  if (명령 === "open-three") {
    await 창정리();
    await 명령창열기();
  }
});

/* ─────────────────────────── 질문 주입·전송 ─────────────────────────── */

/**
 * 콘텐츠 스크립트에 메시지를 보냅니다.
 * 확장 설치 전부터 열려 있던 탭은 스크립트가 없으므로,
 * 실패하면 그 자리에서 스크립트를 주입한 뒤 한 번 더 시도합니다.
 */
async function 탭에보내기(탭ID, 메시지) {
  try {
    return await chrome.tabs.sendMessage(탭ID, 메시지);
  } catch (e) {
    await chrome.scripting.executeScript({
      target: { tabId: 탭ID },
      files: ["selectors.js", "content.js"],
    });
    return await chrome.tabs.sendMessage(탭ID, 메시지);
  }
}

/** 한 사이트(탭)에 질문을 보냅니다. 결과 객체를 반환합니다. */
async function 사이트에전송(사이트키, 탭ID, 본문, 희망모델) {
  const 이름 = BRIDGE_SELECTORS[사이트키].이름;
  try {
    if (!탭ID) {
      return { 사이트: 사이트키, 이름, 성공: false, 사유: "창이 열려 있지 않음" };
    }
    await 탭준비대기(탭ID);
    const 결과 = await 탭에보내기(탭ID, {
      종류: "질문전송",
      사이트: 사이트키,
      본문,
      희망모델,
    });
    return Object.assign({ 사이트: 사이트키, 이름 }, 결과 || {});
  } catch (e) {
    return {
      사이트: 사이트키,
      이름,
      성공: false,
      사유: "페이지와 통신 실패 (새로고침 후 재시도)",
    };
  }
}

/** 프로필과 사이트에 맞춰 최종 전송 문구를 만듭니다. */
function 본문만들기(프로필, 사이트키, 질문) {
  if (!프로필) return 질문;
  const 사이트별 = (프로필.사이트별접두어 || {})[사이트키];
  const 접두어 = 사이트별 && 사이트별.trim() ? 사이트별 : 프로필.공통접두어 || "";
  return 접두어 + 질문;
}

chrome.runtime.onMessage.addListener((메시지, 발신, 응답) => {
  // 겹침 모드에서 마우스가 어떤 AI 창 위에 잠시 머물면
  // 그 창을 앞으로 가져옵니다 (content.js가 보내는 신호).
  if (메시지.종류 === "호버포커스" && 발신.tab) {
    (async () => {
      const 설정 = await 설정불러오기();
      const { 현재배치모드 } = await chrome.storage.session.get("현재배치모드");
      if (설정.호버포커스 && 현재배치모드 === "overlap") {
        try {
          await chrome.windows.update(발신.tab.windowId, { focused: true });
        } catch (e) {
          /* 창이 닫혔으면 무시 */
        }
      }
      응답({ 성공: true });
    })();
    return true;
  }

  // content.js가 보내는 답변 진행 상태를 세션 저장소에 기록합니다.
  // 명령창은 storage 변경을 구독해 실시간으로 ⏳/✅ 를 갱신합니다.
  if (메시지.종류 === "답변상태") {
    (async () => {
      const { 답변상태 } = await chrome.storage.session.get("답변상태");
      const 지금 = 답변상태 || {};
      지금[메시지.사이트] = { 상태: 메시지.상태, 시각: Date.now() };
      await chrome.storage.session.set({ 답변상태: 지금 });
      응답({ 성공: true });
    })();
    return true;
  }

  // 세 사이트의 최신 답변을 한꺼번에 걷어 옵니다 (답변 모으기).
  if (메시지.종류 === "답변수집") {
    (async () => {
      const 설정 = await 설정불러오기();
      const 결과 = {};
      await Promise.all(
        설정.창순서.map(async (사이트키) => {
          const 이름 = BRIDGE_SELECTORS[사이트키].이름;
          try {
            const 탭 = await 기존탭찾기(사이트키);
            if (!탭) {
              결과[사이트키] = { 이름, 성공: false, 사유: "창이 열려 있지 않음" };
              return;
            }
            const r = await 탭에보내기(탭.id, {
              종류: "답변수집",
              사이트: 사이트키,
            });
            결과[사이트키] = Object.assign({ 이름 }, r || { 성공: false });
          } catch (e) {
            결과[사이트키] = { 이름, 성공: false, 사유: "페이지와 통신 실패" };
          }
        })
      );
      응답({ 결과 });
    })();
    return true;
  }

  if (메시지.종류 === "모두닫기") {
    모두닫기().then(() => 응답({ 성공: true }));
    return true;
  }

  if (메시지.종류 === "새대화") {
    새대화시작()
      .then(() => 명령창앞으로())
      .then(() => 응답({ 성공: true }));
    return true;
  }

  if (메시지.종류 === "창정리") {
    창정리()
      .then(() => 명령창앞으로())
      .then(() => 응답({ 성공: true }));
    return true; // 비동기 응답을 쓰겠다는 표시
  }

  if (메시지.종류 === "동시질문") {
    (async () => {
      const 설정 = await 설정불러오기();
      // 프로필이 하나도 없어도 동작하도록 안전하게 처리합니다(접두어 없이 원문 전송).
      const 프로필 =
        설정.프로필.find((p) => p.id === 메시지.프로필ID) ||
        설정.프로필[0] ||
        null;

      const 대상 = 설정.창순서.filter((키) => 메시지.사이트사용[키]);

      // 답변 진행 상태를 초기화합니다 (보낼 사이트는 "대기"로).
      const 초기상태 = {};
      for (const 키 of 대상) 초기상태[키] = { 상태: "대기", 시각: Date.now() };
      await chrome.storage.session.set({ 답변상태: 초기상태 });

      // 대상 사이트가 모두 이미 열려 있으면 창을 움직이지 않습니다.
      // (후속 질문 때마다 창이 재배치되는 것을 막고, 팝업도 닫히지 않음)
      let 탭지도 = {};
      let 전부열림 = true;
      for (const 키 of 대상) {
        const 탭 = await 기존탭찾기(키);
        if (탭) 탭지도[키] = 탭.id;
        else 전부열림 = false;
      }
      if (!전부열림) {
        탭지도 = await 창정리();
      }

      // 세 사이트에 동시에(병렬로) 보냅니다 — 한 곳이 실패해도 나머지는 진행됩니다.
      const 결과들 = await Promise.all(
        대상.map((키) =>
          사이트에전송(
            키,
            탭지도[키],
            본문만들기(프로필, 키, 메시지.질문),
            프로필 ? (프로필.모델 || {})[키] || "" : ""
          )
        )
      );

      // 명령창이 닫혔어도 다시 열면 결과를 볼 수 있게 저장해 둡니다.
      await chrome.storage.local.set({
        마지막결과: { 시각: Date.now(), 결과들 },
      });
      // 새 창들이 열리면서 명령창이 뒤로 밀렸을 수 있으니 다시 앞으로 가져옵니다.
      if (!전부열림) await 명령창앞으로();
      응답({ 결과들 });
    })();
    return true;
  }
});
