/**
 * popup.js — 확장 아이콘을 눌렀을 때 나오는 작은 창의 동작
 */

const 사이트목록 = ["claude", "chatgpt", "gemini"];
const 사이트이름 = { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini" };
let 현재설정 = null;

/** 화면을 처음 그립니다. */
async function 초기화() {
  // 실행 중인 버전을 표시해, 업데이트가 적용됐는지 바로 알 수 있게 합니다.
  document.getElementById("버전").textContent =
    "v" + chrome.runtime.getManifest().version;

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

  const 저장값 = await chrome.storage.local.get(["마지막결과"]);
  const 질문칸 = document.getElementById("질문");
  질문칸.focus();

  await 이력그리기();

  // 전송 도중 팝업이 닫혔더라도, 10분 안에 다시 열면 지난 결과를 보여줍니다.
  const 지난 = 저장값.마지막결과;
  if (지난 && Date.now() - 지난.시각 < 10 * 60 * 1000) {
    상태표시(지난.결과들, "지난 전송 결과");
  }
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
function 상태표시(결과들, 제목) {
  const 상자 = document.getElementById("상태");
  상자.innerHTML = "";
  if (제목) {
    const 머리 = document.createElement("div");
    머리.className = "안내";
    머리.textContent = `— ${제목} —`;
    상자.appendChild(머리);
  }
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
      const 사유 = r.모델.사유 ? ` (${r.모델.사유})` : "";
      안내.textContent = `ℹ ${r.이름} 모델 자동 선택 실패${사유} — 현재 설정 모델로 전송됨`;
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

/* ───────────── 질문 이력 (로컬에만 저장, 최근 50개) ─────────────
 * 보낸 질문은 입력칸에서 지워지되 완전히 사라지지 않고
 * 아래 이력 목록에 쌓입니다. 항목을 클릭하면 입력칸으로 다시 불러옵니다.
 */
async function 이력불러오기() {
  const { 질문이력 } = await chrome.storage.local.get("질문이력");
  return 질문이력 || [];
}

async function 이력에추가(질문, 프로필이름) {
  const 이력 = await 이력불러오기();
  이력.unshift({ 질문, 프로필: 프로필이름, 시각: Date.now() });
  await chrome.storage.local.set({ 질문이력: 이력.slice(0, 50) });
  await 이력그리기();
}

async function 이력그리기() {
  const 상자 = document.getElementById("이력");
  const 이력 = await 이력불러오기();
  상자.innerHTML = "";
  for (const 항목 of 이력) {
    const 줄 = document.createElement("div");
    줄.className = "이력항목";
    줄.title = "클릭하면 입력칸으로 불러옵니다";
    const 시각 = new Date(항목.시각);
    const 시각글 = `${시각.getMonth() + 1}/${시각.getDate()} ${String(시각.getHours()).padStart(2, "0")}:${String(시각.getMinutes()).padStart(2, "0")}`;
    줄.textContent = `[${시각글}·${항목.프로필}] ${항목.질문}`;
    줄.addEventListener("click", () => {
      const 질문칸 = document.getElementById("질문");
      질문칸.value = 항목.질문;
      질문칸.focus();
    });
    상자.appendChild(줄);
  }
  if (!이력.length) {
    const 빈줄 = document.createElement("div");
    빈줄.className = "안내";
    빈줄.textContent = "아직 보낸 질문이 없습니다.";
    상자.appendChild(빈줄);
  }
}

/** 전송 실행 */
async function 전송() {
  const 질문칸 = document.getElementById("질문");
  const 질문 = 질문칸.value.trim();
  if (!질문) return;

  await 선택저장();

  const 버튼 = document.getElementById("전송버튼");
  버튼.disabled = true;
  document.getElementById("상태").textContent = "전송 중…";

  // 입력칸은 비우고, 질문은 이력으로 내려보냅니다.
  // (실패하면 이력에서 클릭 한 번으로 다시 불러올 수 있습니다)
  const 프로필상자 = document.getElementById("프로필");
  const 프로필이름 = 프로필상자.selectedOptions[0]
    ? 프로필상자.selectedOptions[0].textContent
    : "표준";
  질문칸.value = "";
  await 이력에추가(질문, 프로필이름);

  try {
    const 응답 = await chrome.runtime.sendMessage({
      종류: "동시질문",
      질문,
      프로필ID: 프로필상자.value,
      사이트사용: 현재설정.사이트사용,
    });
    상태표시((응답 && 응답.결과들) || []);
  } catch (e) {
    // 백그라운드와의 연결이 끊긴 드문 경우에도 안내는 남깁니다.
    document.getElementById("상태").textContent =
      "결과를 받지 못했습니다. 명령창을 다시 열면 지난 전송 결과가 표시됩니다.";
  } finally {
    버튼.disabled = false;
    질문칸.focus();
  }
}

document.getElementById("전송버튼").addEventListener("click", 전송);
document.getElementById("질문").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) 전송();
});
document.getElementById("창정리버튼").addEventListener("click", () => {
  chrome.runtime.sendMessage({ 종류: "창정리" });
});
document.getElementById("새대화버튼").addEventListener("click", () => {
  chrome.runtime.sendMessage({ 종류: "새대화" });
  document.getElementById("상태").textContent =
    "세 사이트를 새 대화 화면으로 이동했습니다.";
});
document.getElementById("모두닫기버튼").addEventListener("click", () => {
  // 실수로 누르는 것을 막기 위해 한 번 확인합니다.
  if (!confirm("세 AI 창을 모두 닫을까요? (대화 기록은 각 사이트에 남습니다)")) return;
  chrome.runtime.sendMessage({ 종류: "모두닫기" });
  document.getElementById("상태").textContent = "세 AI 창을 닫았습니다.";
});
document.getElementById("이력지우기").addEventListener("click", async (e) => {
  e.preventDefault();
  if (!confirm("보낸 질문 이력을 모두 지울까요?")) return;
  await chrome.storage.local.remove("질문이력");
  await 이력그리기();
});
document.getElementById("설정열기").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

초기화();

// ── v2 후보 (이번 버전에서는 만들지 않음) ──
// - 세 답변을 모아 4번째 창에서 비교 요약
// - 프로필 단축키 (Alt+1 / Alt+2 / Alt+3)
