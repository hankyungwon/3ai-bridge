/**
 * background.js — 확장의 "지휘자" 역할 (서비스 워커)
 * - 단축키(Alt+3)를 받아 3개 창을 열고 화면을 가로 3등분해 배치합니다.
 * - 팝업에서 온 질문을 각 사이트 탭으로 전달하고 결과를 모아 돌려줍니다.
 */

importScripts("selectors.js", "config.js");

/* ────────────────────────────── 창 열기·배치 ────────────────────────────── */

/** 현재 모니터의 작업 영역(작업표시줄 제외)을 구합니다. */
async function 화면영역구하기() {
  try {
    const 디스플레이 = await chrome.system.display.getInfo();
    const 주화면 = 디스플레이.find((d) => d.isPrimary) || 디스플레이[0];
    return 주화면.workArea; // {left, top, width, height}
  } catch (e) {
    // system.display 를 쓸 수 없는 경우의 안전한 기본값
    return { left: 0, top: 0, width: 1440, height: 900 };
  }
}

/** 해당 사이트가 이미 열려 있는 탭을 찾습니다. 없으면 null. */
async function 기존탭찾기(사이트키) {
  const 설정 = BRIDGE_SELECTORS[사이트키];
  const 패턴 = 설정.호스트.map((h) => `*://${h}/*`);
  const 탭들 = await chrome.tabs.query({ url: 패턴 });
  return 탭들.length ? 탭들[0] : null;
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
 * 3개 창을 열고 가로 3등분 배치합니다.
 * 이미 열려 있는 창은 새로 열지 않고 위치만 다시 잡습니다.
 */
async function 창정리() {
  const 설정 = await 설정불러오기();
  const 순서 = 설정.창순서;
  const 영역 = await 화면영역구하기();
  const 폭 = Math.floor(영역.width / 3);

  for (let i = 0; i < 순서.length; i++) {
    const 사이트키 = 순서[i];
    const 사이트 = BRIDGE_SELECTORS[사이트키];
    const 위치 = {
      left: 영역.left + 폭 * i,
      top: 영역.top,
      width: 폭,
      height: 영역.height,
    };

    const 기존 = await 기존탭찾기(사이트키);
    if (기존) {
      // 이미 열려 있으면 그 창을 옮기고 해당 탭을 앞으로 가져옵니다.
      await chrome.windows.update(기존.windowId, {
        state: "normal",
        ...위치,
      });
      await chrome.tabs.update(기존.id, { active: true });
    } else {
      await chrome.windows.create({
        url: 사이트.시작URL,
        type: "normal",
        focused: false,
        ...위치,
      });
    }
  }
}

// 단축키(Alt+3) 처리
chrome.commands.onCommand.addListener((명령) => {
  if (명령 === "open-three") 창정리();
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

/** 한 사이트에 질문을 보냅니다. 결과 객체를 반환합니다. */
async function 사이트에전송(사이트키, 본문, 희망모델) {
  const 이름 = BRIDGE_SELECTORS[사이트키].이름;
  try {
    const 탭 = await 기존탭찾기(사이트키);
    if (!탭) {
      return { 사이트: 사이트키, 이름, 성공: false, 사유: "창이 열려 있지 않음" };
    }
    await 탭준비대기(탭.id);
    const 결과 = await 탭에보내기(탭.id, {
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

chrome.runtime.onMessage.addListener((메시지, _발신, 응답) => {
  if (메시지.종류 === "창정리") {
    창정리().then(() => 응답({ 성공: true }));
    return true; // 비동기 응답을 쓰겠다는 표시
  }

  if (메시지.종류 === "동시질문") {
    (async () => {
      const 설정 = await 설정불러오기();
      const 프로필 =
        설정.프로필.find((p) => p.id === 메시지.프로필ID) || 설정.프로필[0];

      // 창이 아직 없으면 먼저 열고 배치합니다.
      await 창정리();

      const 대상 = 설정.창순서.filter((키) => 메시지.사이트사용[키]);
      // 세 사이트에 동시에(병렬로) 보냅니다 — 한 곳이 실패해도 나머지는 진행됩니다.
      const 결과들 = await Promise.all(
        대상.map((키) =>
          사이트에전송(
            키,
            본문만들기(프로필, 키, 메시지.질문),
            (프로필.모델 || {})[키] || ""
          )
        )
      );
      응답({ 결과들 });
    })();
    return true;
  }
});
