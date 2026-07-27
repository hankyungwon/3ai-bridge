/**
 * popup.js — 확장 아이콘을 눌렀을 때 나오는 작은 창의 동작
 */

const 사이트목록 = ["claude", "chatgpt", "gemini"];
const 사이트이름 = { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini" };
// 3대장의 별명 — 창 전환 버튼에 표시됩니다
const 사이트별명 = { gemini: "제비", chatgpt: "참새", claude: "하마" };
let 현재설정 = null;

/** 화면을 처음 그립니다. */
async function 초기화() {
  // 창 제목에 이름과 버전을 깔끔하게 표시합니다 (뒤의 .0은 생략: 1.8.0 → v1.8)
  const 버전 = chrome.runtime.getManifest().version.replace(/\.0$/, "");
  document.title = `AI 3대장(제비·참새·하마) 카페 v${버전}`;

  현재설정 = await 설정불러오기();
  // 프로필·대상 선택은 명령바에서 뺐습니다(⚙ 설정에서 관리).
  // 명령바는 "3대장 지휘"에만 집중하고, 모델·수준은 각 AI 창에서 고릅니다.

  // 창 전환 버튼: 배치 순서(왼쪽→오른쪽)대로 만들어,
  // 가려진 창(특히 겹침 배치의 가운데 창)을 클릭 한 번에 앞으로 가져옵니다.
  const 전환줄 = document.getElementById("전환줄");
  전환줄.innerHTML = "";
  현재설정.창순서.forEach((키, i) => {
    const 버튼 = document.createElement("button");
    버튼.className = "전환버튼";
    버튼.textContent = 사이트별명[키] || 사이트이름[키];
    버튼.title = `${사이트이름[키]} 창을 앞으로 (Alt+${[1, 2, 4][i]})`;
    버튼.dataset.사이트 = 키;
    버튼.addEventListener("click", () => {
      chrome.runtime.sendMessage({ 종류: "창포커스", 사이트: 키 });
    });
    전환줄.appendChild(버튼);
  });
  await 전면표시갱신();

  const 질문칸 = document.getElementById("질문");
  질문칸.focus();
  // 명령바가 다시 앞으로 올 때마다 커서를 자동으로 입력칸 좌상단에 둡니다.
  window.addEventListener("focus", () => 질문칸.focus());

  // 창 높이가 내용보다 작으면(내용이 잘리면) 창을 위쪽으로 스스로 늘립니다.
  // — "하단 요소가 가려지는" 문제의 근본 해결
  setTimeout(창높이맞춤, 150);

  await 이력그리기();
}

/** 명령바를 화면 하단 제자리에 다시 붙입니다(내용이 잘리는 것 방지). */
async function 창높이맞춤() {
  try {
    await chrome.runtime.sendMessage({ 종류: "명령바스냅", 펼침: 패널열림 });
  } catch (e) {
    /* 조절이 안 되는 환경이면 그대로 둠 */
  }
}

/** 지금 맨 앞에 나와 있는 AI 창의 전환 버튼을 "돌출" 표시합니다. */
async function 전면표시갱신() {
  const { 현재전면사이트 } = await chrome.storage.session.get("현재전면사이트");
  document.querySelectorAll(".전환버튼").forEach((b) => {
    b.classList.toggle("눌림", b.dataset.사이트 === 현재전면사이트);
  });
}

chrome.storage.onChanged.addListener((변경, 영역) => {
  if (영역 === "session" && 변경.현재전면사이트) 전면표시갱신();
});

/** 현재 적용 중인 프로필(⚙ 설정에서 선택)을 찾습니다. 없으면 표준 동작. */
function 현재프로필() {
  return (
    현재설정.프로필.find((p) => p.id === 현재설정.선택프로필) ||
    현재설정.프로필[0] ||
    null
  );
}

/* ───────────── 파일·사진 첨부 ─────────────
 * ＋첨부 버튼, 입력칸에 붙여넣기(Ctrl+V), 끌어다 놓기 세 가지로 담을 수 있고,
 * 전송하면 세 사이트의 입력란에 "붙여넣기한 것처럼" 함께 들어갑니다.
 * 파일 내용은 브라우저 안에서만 오가며 외부로 전송되지 않습니다.
 */
let 첨부목록 = [];
const 첨부최대 = 15 * 1024 * 1024; // 총 15MB — 메시지 전달 한계를 넘지 않게

function 첨부그리기() {
  const 줄 = document.getElementById("첨부줄");
  줄.innerHTML = "";
  줄.classList.toggle("숨김", !첨부목록.length);
  첨부목록.forEach((f, i) => {
    const 칩 = document.createElement("span");
    칩.className = "첨부칩";
    칩.textContent = `📎 ${f.이름}`;
    const 엑스 = document.createElement("span");
    엑스.className = "첨부엑스";
    엑스.textContent = "×";
    엑스.title = "첨부 제거";
    엑스.addEventListener("click", () => {
      첨부목록.splice(i, 1);
      첨부그리기();
    });
    칩.appendChild(엑스);
    줄.appendChild(칩);
  });
}

async function 파일담기(파일들) {
  for (const 파일 of 파일들) {
    const 현재합 = 첨부목록.reduce((s, f) => s + f.크기, 0);
    if (현재합 + 파일.size > 첨부최대) {
      토스트([글줄(`첨부 용량 한도(15MB)를 넘어 "${파일.name}"은 뺐습니다.`, "실패")], 6000);
      continue;
    }
    const 자료 = await new Promise((끝) => {
      const r = new FileReader();
      r.onload = () => 끝(r.result);
      r.readAsDataURL(파일);
    });
    첨부목록.push({ 이름: 파일.name, 종류: 파일.type, 크기: 파일.size, 자료 });
  }
  첨부그리기();
}

/* ── 알림 토스트 ──
 * 진행·성공은 세 AI 창에서 직접 보이므로 표시하지 않습니다.
 * "실패했을 때만" 우측 하단에 잠깐 나타났다 사라집니다 (레이아웃 불변).
 */
let 토스트타이머 = null;
function 토스트(내용HTML목록, 지속 = 8000) {
  const 상자 = document.getElementById("상태");
  if (!내용HTML목록.length) return;
  상자.innerHTML = "";
  for (const el of 내용HTML목록) 상자.appendChild(el);
  상자.classList.remove("숨김");
  if (토스트타이머) clearTimeout(토스트타이머);
  토스트타이머 = setTimeout(() => 상자.classList.add("숨김"), 지속);
}

function 글줄(글, 클래스) {
  const d = document.createElement("div");
  d.className = 클래스 || "안내";
  d.textContent = 글;
  return d;
}

/** 전송 결과 중 "실패한 곳만" 토스트로 알립니다. */
function 상태표시(결과들) {
  const 줄들 = [];
  for (const r of 결과들 || []) {
    if (r.성공 && r.첨부실패) {
      줄들.push(글줄(`⚠ ${r.이름 || 사이트이름[r.사이트]} — 첨부는 붙지 못해 글만 전송됨`, "실패"));
      continue;
    }
    if (!r.성공) {
      줄들.push(
        글줄(
          `❌ ${r.이름 || 사이트이름[r.사이트]} — ${r.사유 || "알 수 없는 오류"}`,
          "실패"
        )
      );
    }
  }
  if (줄들.length) {
    줄들.push(글줄("계속 실패하면 저장소의 수리요청.md 를 참고하세요."));
    토스트(줄들);
  }
}

/* ───────────── 질문 이력 (로컬에만 저장, 최근 500개) ─────────────
 * 보낸 질문은 입력칸에서 지워지되 완전히 사라지지 않고
 * 아래 이력 목록에 쌓입니다.
 *  - 클릭: 입력칸으로 다시 불러오기
 *  - ☆ 클릭: 즐겨찾기 — 자주 쓰는 질문을 맨 위 "★ 즐겨찾기"에 고정
 *  - 검색칸: 지난 며칠 치에서도 바로 찾기
 *  - 내보내기: 전체 이력을 파일(.md)로 백업 — 확장을 지워도 남습니다
 * 날짜별(오늘/어제/그 이전)로 묶어 보여줘 지난 대화 맥락을 되짚기 쉽게 합니다.
 */
async function 이력불러오기() {
  const { 질문이력 } = await chrome.storage.local.get("질문이력");
  return 질문이력 || [];
}

async function 이력에추가(질문, 프로필이름) {
  const 이력 = await 이력불러오기();
  이력.unshift({
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    질문,
    프로필: 프로필이름,
    시각: Date.now(),
    즐겨찾기: false,
  });
  await chrome.storage.local.set({ 질문이력: 이력.slice(0, 500) });
  await 이력그리기();
}

/** 날짜를 "오늘 / 어제 / 7/24(수)" 같은 묶음 이름으로 바꿉니다. */
function 날짜묶음이름(시각) {
  const 그날 = new Date(시각);
  const 오늘 = new Date();
  const 하루 = 24 * 60 * 60 * 1000;
  const 그날0시 = new Date(그날.getFullYear(), 그날.getMonth(), 그날.getDate());
  const 오늘0시 = new Date(오늘.getFullYear(), 오늘.getMonth(), 오늘.getDate());
  const 차이 = Math.round((오늘0시 - 그날0시) / 하루);
  if (차이 === 0) return "오늘";
  if (차이 === 1) return "어제";
  const 요일 = ["일", "월", "화", "수", "목", "금", "토"][그날.getDay()];
  return `${그날.getMonth() + 1}/${그날.getDate()}(${요일})`;
}

function 이력항목만들기(항목) {
  const 줄 = document.createElement("div");
  줄.className = "이력항목";

  const 별 = document.createElement("span");
  별.className = "별";
  별.textContent = 항목.즐겨찾기 ? "★" : "☆";
  별.title = 항목.즐겨찾기 ? "즐겨찾기 해제" : "즐겨찾기로 고정";
  별.addEventListener("click", async (e) => {
    e.stopPropagation();
    const 이력 = await 이력불러오기();
    const 대상 = 이력.find((h) => h.id === 항목.id);
    if (대상) 대상.즐겨찾기 = !대상.즐겨찾기;
    await chrome.storage.local.set({ 질문이력: 이력 });
    await 이력그리기();
  });
  줄.appendChild(별);

  const 글 = document.createElement("span");
  const 시각 = new Date(항목.시각);
  const 시각글 = `${String(시각.getHours()).padStart(2, "0")}:${String(시각.getMinutes()).padStart(2, "0")}`;
  글.textContent = ` [${시각글}·${항목.프로필}] ${항목.질문}`;
  글.title = "클릭하면 입력칸으로 불러옵니다";
  줄.appendChild(글);

  줄.addEventListener("click", () => {
    const 질문칸 = document.getElementById("질문");
    질문칸.value = 항목.질문.replace(/^\[📎\d+\] /, ""); // 첨부 표식은 떼고 불러옴
    질문칸.focus();
  });
  return 줄;
}

/** "방금 / 5분 / 3시간 / 2일" 식의 아주 짧은 상대 시각 표시 */
function 짧은시간(시각) {
  const 초 = Math.floor((Date.now() - 시각) / 1000);
  if (초 < 60) return "방금";
  if (초 < 3600) return Math.floor(초 / 60) + "분 전";
  if (초 < 86400) return Math.floor(초 / 3600) + "시간 전";
  return Math.floor(초 / 86400) + "일 전";
}

/** 명령바 오른쪽의 "최근 질문" 미니 이력 — 그 자체로 이력 관리가 되게 */
async function 미니이력그리기() {
  const 상자 = document.getElementById("미니이력");
  const 이력 = (await 이력불러오기()).slice(0, 30);
  상자.innerHTML = "";
  for (const 항목 of 이력) {
    const 줄 = document.createElement("div");
    줄.className = "미니항목";
    const 질문줄 = document.createElement("div");
    질문줄.className = "미니질문";
    질문줄.textContent = (항목.즐겨찾기 ? "★ " : "") + 항목.질문;
    const 시간줄 = document.createElement("div");
    시간줄.className = "미니시간";
    시간줄.textContent = 짧은시간(항목.시각);
    줄.appendChild(질문줄);
    줄.appendChild(시간줄);
    줄.addEventListener("click", () => {
      const 질문칸 = document.getElementById("질문");
      질문칸.value = 항목.질문.replace(/^\[📎\d+\] /, "");
      질문칸.focus();
    });
    상자.appendChild(줄);
  }
  if (!이력.length) {
    const 빈줄 = document.createElement("div");
    빈줄.className = "안내";
    빈줄.style.padding = "6px";
    빈줄.textContent = "최근 질문이 여기에 쌓입니다";
    상자.appendChild(빈줄);
  }
}

async function 이력그리기() {
  await 미니이력그리기();
  const 상자 = document.getElementById("이력");
  const 검색어 = document.getElementById("이력검색").value.trim().toLowerCase();
  let 이력 = await 이력불러오기();
  상자.innerHTML = "";

  if (검색어) {
    이력 = 이력.filter((h) => h.질문.toLowerCase().includes(검색어));
  }

  // 1) 즐겨찾기 먼저
  const 즐겨찾기들 = 이력.filter((h) => h.즐겨찾기);
  if (즐겨찾기들.length) {
    const 머리 = document.createElement("div");
    머리.className = "이력날짜";
    머리.textContent = "★ 즐겨찾기";
    상자.appendChild(머리);
    for (const 항목 of 즐겨찾기들) 상자.appendChild(이력항목만들기(항목));
  }

  // 2) 나머지를 날짜별로 묶어서
  let 현재묶음 = null;
  for (const 항목 of 이력.filter((h) => !h.즐겨찾기)) {
    const 묶음 = 날짜묶음이름(항목.시각);
    if (묶음 !== 현재묶음) {
      현재묶음 = 묶음;
      const 머리 = document.createElement("div");
      머리.className = "이력날짜";
      머리.textContent = 묶음;
      상자.appendChild(머리);
    }
    상자.appendChild(이력항목만들기(항목));
  }

  if (!이력.length) {
    const 빈줄 = document.createElement("div");
    빈줄.className = "안내";
    빈줄.textContent = 검색어 ? "검색 결과가 없습니다." : "아직 보낸 질문이 없습니다.";
    상자.appendChild(빈줄);
  }
}

/* ───────────── 답변 모으기 ─────────────
 * 세 사이트의 최신 답변을 걷어 와 하나의 문서로 만들어
 * 클립보드에 복사하고, 아래에 펼쳐볼 수 있게 보여줍니다.
 */
async function 답변모으기() {
  const 버튼 = document.getElementById("모으기버튼");
  버튼.disabled = true;
  버튼.textContent = "모으는 중…";
  try {
    const 응답 = await chrome.runtime.sendMessage({ 종류: "답변수집" });
    const 결과 = (응답 && 응답.결과) || {};
    let 문서 = "";
    const 요약 = [];
    for (const [키, r] of Object.entries(결과)) {
      if (r.성공) {
        문서 += `## ${r.이름}\n\n${r.본문}\n\n---\n\n`;
        요약.push(`✅${r.이름}`);
      } else {
        요약.push(`❌${r.이름}(${r.사유 || "실패"})`);
      }
    }

    const 결과상자 = document.getElementById("모으기결과");
    결과상자.innerHTML = "";
    if (문서) {
      try {
        await navigator.clipboard.writeText(문서.trim());
        요약.push("→ 클립보드에 복사됨");
      } catch (e) {
        요약.push("→ 복사 실패, 아래에서 직접 복사하세요");
      }
      const 펼침 = document.createElement("details");
      const 제목 = document.createElement("summary");
      제목.textContent = "모은 답변 펼쳐 보기";
      펼침.appendChild(제목);
      const 본문칸 = document.createElement("textarea");
      본문칸.rows = 10;
      본문칸.value = 문서.trim();
      펼침.appendChild(본문칸);
      결과상자.appendChild(펼침);
    }
    const 실패요약 = 요약.filter((글) => 글.startsWith("❌"));
    if (실패요약.length) 토스트(실패요약.map((글) => 글줄(글, "실패")));
  } finally {
    버튼.disabled = false;
    버튼.textContent = "답변 모으기";
  }
}

/** 전송 실행 */
async function 전송() {
  const 질문칸 = document.getElementById("질문");
  const 질문 = 질문칸.value.trim();
  if (!질문 && !첨부목록.length) return; // 글도 첨부도 없으면 보낼 게 없음

  const 버튼 = document.getElementById("전송버튼");
  버튼.disabled = true;

  // 입력칸은 비우고, 질문은 이력으로 내려보냅니다.
  // (실패하면 이력에서 클릭 한 번으로 다시 불러올 수 있습니다)
  const 프로필 = 현재프로필();
  질문칸.value = "";
  const 보낼첨부 = 첨부목록;
  첨부목록 = [];
  첨부그리기();
  if (질문) {
    await 이력에추가(
      보낼첨부.length ? `[📎${보낼첨부.length}] ${질문}` : 질문,
      프로필 ? 프로필.이름 : "표준"
    );
  }

  try {
    const 응답 = await chrome.runtime.sendMessage({
      종류: "동시질문",
      질문,
      첨부: 보낼첨부.map((f) => ({ 이름: f.이름, 종류: f.종류, 자료: f.자료 })),
      프로필ID: 프로필 ? 프로필.id : "표준",
      // 명령바에서 대상 선택을 없앴으므로 항상 세 곳 모두에 보냅니다.
      사이트사용: { claude: true, chatgpt: true, gemini: true },
    });
    상태표시((응답 && 응답.결과들) || []);
  } catch (e) {
    // 백그라운드와의 연결이 끊긴 드문 경우에도 안내는 남깁니다.
    토스트([글줄("전송 결과를 받지 못했습니다. 세 AI 창을 직접 확인하세요.", "실패")]);
  } finally {
    버튼.disabled = false;
    질문칸.focus();
  }
}

document.getElementById("전송버튼").addEventListener("click", 전송);

// ── 첨부 담기: 버튼 / 붙여넣기 / 끌어다 놓기 ──
document.getElementById("첨부버튼").addEventListener("click", () => {
  document.getElementById("파일입력").click();
});
document.getElementById("파일입력").addEventListener("change", async (e) => {
  await 파일담기([...e.target.files]);
  e.target.value = ""; // 같은 파일을 다시 골라도 인식되게 초기화
});
document.getElementById("질문").addEventListener("paste", async (e) => {
  const 파일들 = [...(e.clipboardData?.files || [])];
  if (파일들.length) {
    e.preventDefault();
    await 파일담기(파일들);
  }
});
const 작성칸요소 = document.querySelector(".작성칸");
작성칸요소.addEventListener("dragover", (e) => e.preventDefault());
작성칸요소.addEventListener("drop", async (e) => {
  e.preventDefault();
  const 파일들 = [...(e.dataTransfer?.files || [])];
  if (파일들.length) await 파일담기(파일들);
});
// Enter = 바로 전송, Shift+Enter = 줄바꿈 (채팅 앱과 같은 방식)
document.getElementById("질문").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    전송();
  }
});
document.getElementById("창정리버튼").addEventListener("click", () => {
  chrome.runtime.sendMessage({ 종류: "창정리" });
});
document.getElementById("새대화버튼").addEventListener("click", () => {
  chrome.runtime.sendMessage({ 종류: "새대화" });
});
document.getElementById("모두닫기버튼").addEventListener("click", () => {
  // 실수로 누르는 것을 막기 위해 한 번 확인합니다.
  if (
    !confirm(
      "세 AI 창을 모두 닫습니다. (각 사이트의 대화 기록은 그대로 남습니다)\n\n다시 열 때는 [정렬] 버튼이나 Alt+3 만 누르면 됩니다."
    )
  )
    return;
  chrome.runtime.sendMessage({ 종류: "모두닫기" });
  토스트([글줄("세 AI 창을 닫았습니다. [정렬] 또는 Alt+3 으로 다시 엽니다.")], 6000);
});
document.getElementById("이력지우기").addEventListener("click", async (e) => {
  e.preventDefault();
  if (!confirm("보낸 질문 이력을 모두 지울까요? (즐겨찾기 포함)")) return;
  await chrome.storage.local.remove("질문이력");
  await 이력그리기();
});
document.getElementById("이력검색").addEventListener("input", 이력그리기);
document.getElementById("모으기버튼").addEventListener("click", async () => {
  await 답변모으기();
  await 확장패널열기(true); // 모은 답변을 바로 볼 수 있게 패널을 펼칩니다
});

/* ── 접이식 패널: 명령바를 위로 늘려 이력·모은 답변을 보여줍니다 ──
 * 크기 조절은 백그라운드가 "화면 하단에 절대 좌표로" 다시 붙이는 방식입니다.
 * (예전의 상대 계산은 오차가 쌓여 명령바가 작업표시줄 아래로 숨는 문제가 있었음)
 */
let 패널열림 = false;

async function 확장패널열기(열기) {
  if (열기 === 패널열림) return;
  패널열림 = 열기;
  document.getElementById("확장패널").classList.toggle("숨김", !열기);
  try {
    await chrome.runtime.sendMessage({ 종류: "명령바스냅", 펼침: 열기 });
  } catch (e) {
    /* 크기 조절이 안 되는 환경이면 패널만 토글 */
  }
}

document.getElementById("이력토글").addEventListener("click", () => {
  확장패널열기(!패널열림);
});

// 질문+세 답변 자동 보관본을 마크다운 파일로 내려받습니다.
// (세 답변 생성이 모두 끝나면 확장이 알아서 보관해 두므로, 저장 버튼이 필요 없음)
document.getElementById("대화내보내기").addEventListener("click", async (e) => {
  e.preventDefault();
  const { 대화기록 } = await chrome.storage.local.get("대화기록");
  if (!대화기록 || !대화기록.length) {
    return alert(
      "아직 보관된 대화가 없습니다.\n(세 답변 생성이 모두 끝나면 자동으로 보관됩니다)"
    );
  }
  let 문서 = "# AI 3대장 브리지 — 대화 보관함\n\n";
  for (const 기록 of [...대화기록].reverse()) {
    문서 += `\n---\n\n# 질문 (${new Date(기록.시각).toLocaleString("ko-KR")})\n\n${기록.질문}\n\n`;
    for (const [키, 답] of Object.entries(기록.답변 || {})) {
      문서 += `## ${사이트이름[키] || 키}\n\n${답}\n\n`;
    }
  }
  const 파일 = new Blob([문서], { type: "text/markdown" });
  const 링크 = document.createElement("a");
  링크.href = URL.createObjectURL(파일);
  링크.download = "3대장브리지_대화보관함.md";
  링크.click();
  URL.revokeObjectURL(링크.href);
});

// 이력 전체를 마크다운 파일로 내려받습니다 (확장을 지워도 남는 백업).
document.getElementById("이력내보내기").addEventListener("click", async (e) => {
  e.preventDefault();
  const 이력 = await 이력불러오기();
  if (!이력.length) return alert("내보낼 이력이 없습니다.");
  let 문서 = "# 3대장 브리지 — 질문 이력\n\n";
  let 현재묶음 = null;
  for (const 항목 of 이력) {
    const 묶음 = new Date(항목.시각).toLocaleDateString("ko-KR");
    if (묶음 !== 현재묶음) {
      현재묶음 = 묶음;
      문서 += `\n## ${묶음}\n\n`;
    }
    const 시각 = new Date(항목.시각);
    문서 += `- ${String(시각.getHours()).padStart(2, "0")}:${String(시각.getMinutes()).padStart(2, "0")} [${항목.프로필}]${항목.즐겨찾기 ? " ★" : ""} ${항목.질문.replace(/\n/g, " ")}\n`;
  }
  const 파일 = new Blob([문서], { type: "text/markdown" });
  const 링크 = document.createElement("a");
  링크.href = URL.createObjectURL(파일);
  링크.download = "3대장브리지_질문이력.md";
  링크.click();
  URL.revokeObjectURL(링크.href);
});
document.getElementById("설정열기").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

초기화();

// ── v2 후보 (이번 버전에서는 만들지 않음) ──
// - 세 답변을 모아 4번째 창에서 비교 요약
// - 프로필 단축키 (Alt+1 / Alt+2 / Alt+3)
