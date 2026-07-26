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
 * 같은 사이트 탭이 여러 개면 "가장 최근에 본 탭"을 골라,
 * 후속 질문이 사용자가 실제로 보던 대화에 이어지게 합니다.
 */
async function 기존탭찾기(사이트키) {
  const 설정 = BRIDGE_SELECTORS[사이트키];
  const 패턴 = 설정.호스트.map((h) => `*://${h}/*`);
  const 탭들 = await chrome.tabs.query({ url: 패턴 });
  if (!탭들.length) return null;
  탭들.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return 탭들[0];
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
 * - 이미 열려 있는 사이트는 새로 열지 않고 재사용합니다(대화 유지).
 * - 사이트 탭이 다른 탭들과 한 창에 섞여 있으면, 그 창 전체를 옮기는 대신
 *   해당 탭만 떼어내 전용 창으로 만듭니다. (사용자의 메인 창을 건드리지 않음)
 * - 방금 만든/찾은 탭의 ID 지도를 반환해, 전송 단계가 탭을 다시 검색하다
 *   놓치는 일이 없게 합니다.
 */
async function 창정리() {
  const 설정 = await 설정불러오기();
  const 순서 = 설정.창순서;
  const 영역 = await 화면영역구하기();
  const 폭 = Math.floor(영역.width / 순서.length);
  const 탭지도 = {};

  for (let i = 0; i < 순서.length; i++) {
    const 사이트키 = 순서[i];
    const 사이트 = BRIDGE_SELECTORS[사이트키];
    const 마지막 = i === 순서.length - 1;
    const 위치 = {
      left: 영역.left + 폭 * i,
      top: 영역.top,
      // 마지막 창은 나누고 남은 픽셀까지 채워 화면 오른쪽에 틈이 없게 합니다.
      width: 마지막 ? 영역.width - 폭 * (순서.length - 1) : 폭,
      height: 영역.height,
    };

    try {
      const 기존 = await 기존탭찾기(사이트키);
      if (기존) {
        const 창 = await chrome.windows.get(기존.windowId, { populate: true });
        if (창.tabs && 창.tabs.length > 1) {
          // 다른 탭들과 같은 창에 있으면 이 탭만 떼어내 전용 창으로 만듭니다.
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
        탭지도[사이트키] = 기존.id;
      } else {
        const 새창 = await chrome.windows.create({
          url: 사이트.시작URL,
          type: "normal",
          focused: false,
          ...위치,
        });
        탭지도[사이트키] = 새창.tabs && 새창.tabs[0] ? 새창.tabs[0].id : null;
      }
    } catch (e) {
      // 한 창 배치가 실패해도 나머지 창 배치는 계속합니다.
      탭지도[사이트키] = 탭지도[사이트키] || null;
    }
  }
  return 탭지도;
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

chrome.runtime.onMessage.addListener((메시지, _발신, 응답) => {
  if (메시지.종류 === "창정리") {
    창정리().then(() => 응답({ 성공: true }));
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

      // 팝업이 (창 생성 등으로) 닫혔어도 다시 열면 결과를 볼 수 있게 저장해 둡니다.
      await chrome.storage.local.set({
        마지막결과: { 시각: Date.now(), 결과들 },
      });
      응답({ 결과들 });
    })();
    return true;
  }
});
