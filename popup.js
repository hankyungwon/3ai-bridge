/**
 * popup.js — 확장 아이콘을 눌렀을 때 나오는 작은 창의 동작
 */

const 사이트목록 = ["claude", "chatgpt", "gemini"];
const 사이트이름 = { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini" };
let 현재설정 = null;

/** 화면을 처음 그립니다. */
async function 초기화() {
  현재설정 = await 설정불러오기();

  const 프로필상자 = document.getElementById("프로필");
  프로필상자.innerHTML = "";
  for (const p of 현재설정.프로필) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.이름;
    프로필상자.appendChild(opt);
  }
  프로필상자.value = 현재설정.선택프로필;

  for (const 키 of 사이트목록) {
    document.getElementById("사용_" + 키).checked =
      현재설정.사이트사용[키] !== false;
  }

  // 마지막에 쓰던 질문을 복원(창을 닫아도 사라지지 않게)
  const 임시 = await chrome.storage.local.get("임시질문");
  if (임시.임시질문) document.getElementById("질문").value = 임시.임시질문;

  document.getElementById("질문").focus();
}

/** 선택 상태를 저장합니다. */
async function 선택저장() {
  현재설정.선택프로필 = document.getElementById("프로필").value;
  현재설정.사이트사용 = {};
  for (const 키 of 사이트목록) {
    현재설정.사이트사용[키] = document.getElementById("사용_" + 키).checked;
  }
  await 설정저장(현재설정);
}

/** 사이트별 성공/실패를 팝업에 표시합니다. */
function 상태표시(결과들) {
  const 상자 = document.getElementById("상태");
  상자.innerHTML = "";
  for (const r of 결과들) {
    const 줄 = document.createElement("div");
    줄.className = r.성공 ? "성공" : "실패";
    줄.textContent = r.성공
      ? `✅ ${r.이름 || 사이트이름[r.사이트]} — 전송됨`
      : `❌ ${r.이름 || 사이트이름[r.사이트]} — ${r.사유 || "알 수 없는 오류"}`;
    상자.appendChild(줄);

    // 모델 자동 선택은 실패해도 전송을 막지 않으므로 안내만 덧붙입니다.
    if (r.모델 && r.모델.시도 && !r.모델.성공) {
      const 안내 = document.createElement("div");
      안내.className = "안내";
      안내.textContent = `ℹ ${r.이름} 모델 자동 선택 실패 — 현재 설정 모델로 전송됨`;
      상자.appendChild(안내);
    }
  }
  if (결과들.some((r) => !r.성공)) {
    const 도움 = document.createElement("div");
    도움.className = "안내";
    도움.textContent = "선택자가 깨진 것 같다면 저장소의 수리요청.md 를 참고하세요.";
    상자.appendChild(도움);
  }
}

/** 전송 실행 */
async function 전송() {
  const 질문 = document.getElementById("질문").value.trim();
  if (!질문) return;

  await 선택저장();
  await chrome.storage.local.set({ 임시질문: 질문 });

  const 버튼 = document.getElementById("전송버튼");
  버튼.disabled = true;
  document.getElementById("상태").textContent = "전송 중…";

  const 응답 = await chrome.runtime.sendMessage({
    종류: "동시질문",
    질문,
    프로필ID: document.getElementById("프로필").value,
    사이트사용: 현재설정.사이트사용,
  });

  버튼.disabled = false;
  상태표시((응답 && 응답.결과들) || []);
}

document.getElementById("전송버튼").addEventListener("click", 전송);
document.getElementById("질문").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) 전송();
});
document.getElementById("창정리버튼").addEventListener("click", () => {
  chrome.runtime.sendMessage({ 종류: "창정리" });
});
document.getElementById("설정열기").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

초기화();

// ── v2 후보 (이번 버전에서는 만들지 않음) ──
// - 세 답변을 모아 4번째 창에서 비교 요약
// - 질문 이력 로컬 저장·검색
// - 프로필 단축키 (Alt+1 / Alt+2 / Alt+3)
