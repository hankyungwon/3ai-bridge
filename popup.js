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
  // 창 제목에 이름과 버전을 그대로 표시합니다.
  // (예전에는 끝의 .0을 떼어 1.18.0이 "v1.18"로 보여, 업데이트가 됐는지
  //  헷갈렸습니다. 이제 적힌 그대로 보여 줍니다.)
  const 버전 = chrome.runtime.getManifest().version;
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
    버튼.title = `${사이트이름[키]} 창을 앞으로`;
    버튼.dataset.사이트 = 키;
    버튼.addEventListener("click", () => {
      chrome.runtime.sendMessage({ 종류: "창포커스", 사이트: 키 });
    });
    전환줄.appendChild(버튼);
  });
  await 전면표시갱신();
  await 짝표시갱신(); // 둘만 보기 중이면 그 알약을 켜 둡니다

  const 질문칸 = document.getElementById("질문");
  질문칸.focus();

  // 상태는 두 조건으로 분리해 관리합니다 (참새 합의안):
  //  - 포커스 유무 → CSS :focus-within 이 처리 (JS 관여 없음)
  //  - 내용 유무   → input 이벤트로 .작성칸 에 '내용있음' 클래스만 토글
  // 장식 커서 _ 는 "포커스 없음 AND 내용 없음"일 때만 CSS 로 나타납니다.
  const 작성칸 = document.querySelector(".작성칸");
  const 커서갱신 = () =>
    작성칸.classList.toggle("내용있음", 질문칸.value.length > 0);
  질문칸.addEventListener("input", 커서갱신);
  커서갱신();
  // 명령바가 다시 앞으로 올 때마다 커서를 자동으로 입력칸 좌상단에 둡니다.
  window.addEventListener("focus", () => 질문칸.focus());

  // 창 높이가 내용보다 작으면(내용이 잘리면) 창을 위쪽으로 스스로 늘립니다.
  // — "하단 요소가 가려지는" 문제의 근본 해결
  setTimeout(창높이맞춤, 150);

  await 이력그리기();
  await 표시설정초기화();
}

/* ═══════════ 표시 조절 (글자 크기 · 서체 · 고대비) ═══════════
 * 저장 키를 셋으로 분리해, 하나가 없거나 깨져도 그 키만 기본값으로
 * 떨어지고 나머지 설정은 그대로 유지되게 합니다.
 */
const 글자크기단계 = [15, 17, 19, 21];
const 기본글자크기 = 17;
const FONT_LOAD_TIMEOUT_MS = 2000; // 서체 로딩 대기 한도 (조정 가능)
/**
 * 글꼴 목록 — "또렷"·"고정폭" 같은 뜻 모를 말 대신 글꼴 이름을 그대로 씁니다.
 * 이 컴퓨터에 실제로 있는 글꼴만 목록에 나옵니다(없는 것을 골라 봐야
 * 아무 일도 안 일어나므로). 번들 글꼴 두 개는 확장에 들어 있어 항상 나옵니다.
 */
const 글꼴후보 = [
  { 이름: "시스템 기본", css: "", 번들: null },
  // 맥
  { 이름: "애플 SD 산돌고딕Neo", css: '"Apple SD Gothic Neo"', 검사: "Apple SD Gothic Neo" },
  { 이름: "애플 명조", css: '"AppleMyungjo"', 검사: "AppleMyungjo" },
  // 윈도우
  { 이름: "맑은 고딕", css: '"Malgun Gothic"', 검사: "Malgun Gothic" },
  { 이름: "굴림", css: '"Gulim"', 검사: "Gulim" },
  { 이름: "바탕", css: '"Batang"', 검사: "Batang" },
  { 이름: "돋움", css: '"Dotum"', 검사: "Dotum" },
  { 이름: "궁서", css: '"Gungsuh"', 검사: "Gungsuh" },
  // 공통(설치돼 있으면)
  { 이름: "나눔고딕", css: '"NanumGothic","Nanum Gothic"', 검사: "NanumGothic" },
  { 이름: "나눔명조", css: '"NanumMyeongjo","Nanum Myeongjo"', 검사: "NanumMyeongjo" },
  { 이름: "본고딕 (Noto Sans KR)", css: '"Noto Sans KR"', 검사: "Noto Sans KR" },
  // 확장에 들어 있는 글꼴 (항상 사용 가능)
  { 이름: "프리텐다드 (넓고 또렷)", css: '"Pretendard"', 번들: "Pretendard" },
  { 이름: "D2Coding (글자 폭이 모두 같음)", css: '"D2Coding"', 번들: "D2Coding" },
];
let 현재글꼴 = "";
let 서체요청토큰 = 0; // 연속 선택·늦은 완료를 가려내는 표식

/**
 * 이 컴퓨터에 그 글꼴이 실제로 있는지 확인합니다.
 * 같은 글자를 기준 글꼴과 후보 글꼴로 각각 재어, 폭이 다르면 있는 것입니다.
 */
function 글꼴있나(이름) {
  try {
    const 캔버스 = document.createElement("canvas");
    const 그리기 = 캔버스.getContext("2d");
    const 표본 = "가나다ABC123";
    const 재기 = (family) => {
      그리기.font = '72px ' + family;
      return 그리기.measureText(표본).width;
    };
    const 기준 = ["monospace", "serif", "sans-serif"];
    return 기준.some((기본) => 재기(`"${이름}", ${기본}`) !== 재기(기본));
  } catch (e) {
    return false;
  }
}

/** 옛 설정값(기본/가독형/고정폭)을 새 값으로 옮깁니다. */
function 옛설정옮기기(값) {
  if (값 === "기본") return "";
  if (값 === "가독형") return '"Pretendard"';
  if (값 === "고정폭") return '"D2Coding"';
  return 값;
}

/** 키 하나만 읽어 옵니다. 없거나 형식이 어긋나면 기본값. */
async function 표시설정읽기(키, 기본값, 검증) {
  try {
    const 저장 = await chrome.storage.local.get(키);
    const 값 = 저장[키];
    return 검증(값) ? 값 : 기본값;
  } catch (e) {
    return 기본값;
  }
}

async function 글자크기적용(px, 저장할까 = true) {
  const 질문칸 = document.getElementById("질문");
  질문칸.style.fontSize = px + "px";
  document.getElementById("글자크기표시").textContent = px + "px";
  document.getElementById("글자작게").disabled = px <= 글자크기단계[0];
  document.getElementById("글자크게").disabled =
    px >= 글자크기단계[글자크기단계.length - 1];
  if (저장할까) {
    try {
      await chrome.storage.local.set({ inputFontSize: px });
    } catch (e) {
      /* 저장 실패는 표시에 영향 주지 않음 */
    }
  }
}

function 서체안내표시(글) {
  const 상자 = document.getElementById("서체안내");
  상자.textContent = 글;
  상자.classList.remove("숨김");
  setTimeout(() => 상자.classList.add("숨김"), 4000); // 자동 소멸, 포커스 이동 없음
}

/**
 * 글꼴 전환.
 * 확장에 들어 있는 글꼴은 다 불러온 뒤에 적용합니다(반쪽만 보이는 일 방지).
 * 실패하면 쓰던 글꼴을 그대로 두고 알려 줍니다.
 */
async function 글꼴전환(css값) {
  const 내토큰 = ++서체요청토큰;
  const 질문칸 = document.getElementById("질문");
  const 이전 = 현재글꼴;
  const 후보 = 글꼴후보.find((f) => f.css === css값);

  // 커서·선택 영역·스크롤·포커스 보존
  const 상태 = {
    start: 질문칸.selectionStart,
    end: 질문칸.selectionEnd,
    scrollTop: 질문칸.scrollTop,
    포커스: document.activeElement === 질문칸,
  };

  if (후보 && 후보.번들) {
    try {
      const 크기 = 질문칸.style.fontSize || 기본글자크기 + "px";
      const 결과 = await Promise.race([
        document.fonts.load(`${크기} "${후보.번들}"`, "가나다 ABC 123"),
        new Promise((_, 거절) =>
          setTimeout(() => 거절(new Error("timeout")), FONT_LOAD_TIMEOUT_MS)
        ),
      ]);
      const 있음 =
        Array.isArray(결과) &&
        결과.some((f) => f && f.family && f.family.includes(후보.번들));
      if (!있음) throw new Error("not-loaded");
    } catch (e) {
      if (내토큰 === 서체요청토큰) {
        document.getElementById("글꼴선택").value = 이전;
        서체안내표시("글꼴을 불러오지 못했습니다");
      }
      return;
    }
  }

  if (내토큰 !== 서체요청토큰) return; // 늦게 끝난 이전 요청은 버립니다

  질문칸.style.fontFamily = css값 || "";
  현재글꼴 = css값;
  requestAnimationFrame(() => {
    질문칸.scrollTop = 상태.scrollTop;
    if (상태.포커스) {
      질문칸.focus();
      try {
        질문칸.setSelectionRange(상태.start, 상태.end);
      } catch (e) {
        /* 범위를 벗어나면 무시 */
      }
    }
  });
  try {
    await chrome.storage.local.set({ inputFontFamily: css값 });
  } catch (e) {
    /* 저장 실패는 표시에 영향 주지 않음 */
  }
}

/** 이 컴퓨터에 있는 글꼴만 골라 목록을 채웁니다. */
function 글꼴목록채우기() {
  const 선택 = document.getElementById("글꼴선택");
  선택.innerHTML = "";
  for (const f of 글꼴후보) {
    if (f.css && !f.번들 && f.검사 && !글꼴있나(f.검사)) continue; // 없는 글꼴은 감춤
    const opt = document.createElement("option");
    opt.value = f.css;
    opt.textContent = f.이름;
    선택.appendChild(opt);
  }
}

async function 고대비적용(켬, 저장할까 = true) {
  document.body.classList.toggle("고대비", !!켬);
  document.getElementById("고대비토글").classList.toggle("선택됨", !!켬);
  if (저장할까) {
    try {
      await chrome.storage.local.set({ highContrast: !!켬 });
    } catch (e) {
      /* 무시 */
    }
  }
}

/** 세 키를 각각 독립적으로 읽어 적용합니다. */
async function 표시설정초기화() {
  const 크기 = await 표시설정읽기(
    "inputFontSize",
    기본글자크기,
    (v) => 글자크기단계.includes(v)
  );
  await 글자크기적용(크기, false);

  글꼴목록채우기();
  const 저장된글꼴 = 옛설정옮기기(
    await 표시설정읽기("inputFontFamily", "", (v) => typeof v === "string")
  );
  const 선택 = document.getElementById("글꼴선택");
  // 목록에 없는 값(글꼴을 지웠거나 다른 컴퓨터에서 저장한 값)이면 기본으로
  const 있음 = [...선택.options].some((o) => o.value === 저장된글꼴);
  선택.value = 있음 ? 저장된글꼴 : "";
  if (선택.value) 글꼴전환(선택.value);
  선택.addEventListener("change", () => 글꼴전환(선택.value));

  const 고대비 = await 표시설정읽기(
    "highContrast",
    false,
    (v) => typeof v === "boolean"
  );
  await 고대비적용(고대비, false);

  // 가운데 크기 표시를 누르면 기본 크기로 돌아갑니다.
  // (A−를 여러 번 누르지 않아도 되게. 크기 그룹 안에서만 도는 개념입니다)
  document.getElementById("글자크기표시").addEventListener("click", async () => {
    await 글자크기적용(기본글자크기);
  });

  document.getElementById("글자작게").addEventListener("click", async () => {
    const 지금 = parseInt(document.getElementById("글자크기표시").textContent, 10);
    const i = 글자크기단계.indexOf(지금);
    if (i > 0) await 글자크기적용(글자크기단계[i - 1]);
  });
  document.getElementById("글자크게").addEventListener("click", async () => {
    const 지금 = parseInt(document.getElementById("글자크기표시").textContent, 10);
    const i = 글자크기단계.indexOf(지금);
    if (i >= 0 && i < 글자크기단계.length - 1) await 글자크기적용(글자크기단계[i + 1]);
  });
  document.getElementById("고대비토글").addEventListener("click", () => {
    고대비적용(!document.body.classList.contains("고대비"));
  });
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
    질문칸.dispatchEvent(new Event("input"));
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
      질문칸.dispatchEvent(new Event("input"));
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
/**
 * 안전한 클립보드 복사.
 *
 * 왜 두 가지를 쓰나:
 *  사용자가 버튼을 누른 뒤 세 사이트에서 답변을 걷어 오는 동안(수 초)
 *  "방금 클릭했다"는 효력(사용자 제스처)이 사라집니다. 그러면
 *  navigator.clipboard.writeText 가 조용히 거부되어, 붙여넣기를 하면
 *  예전에 복사해 둔 내용이 나옵니다. 그래서
 *   (1) 창을 앞으로 불러 포커스를 확보하고,
 *   (2) writeText 를 쓰되 실패하면 execCommand("copy") 로 다시 시도합니다.
 *      (manifest 의 clipboardWrite 권한 덕분에 제스처 없이도 동작)
 *  그리고 성공 여부를 절대 추측하지 않고 그대로 보고합니다.
 */
async function 클립보드복사(글) {
  try {
    window.focus();
  } catch (e) {
    /* 무시 */
  }
  for (let 회차 = 0; 회차 < 2; 회차++) {
    try {
      await navigator.clipboard.writeText(글);
      return true;
    } catch (e) {
      /* 아래 대비책 */
    }
    try {
      const 임시 = document.createElement("textarea");
      임시.value = 글;
      임시.style.position = "fixed";
      임시.style.top = "0";
      임시.style.opacity = "0";
      document.body.appendChild(임시);
      임시.focus();
      임시.setSelectionRange(0, 글.length);
      const 됨 = document.execCommand("copy");
      document.body.removeChild(임시);
      if (됨) return true;
    } catch (e) {
      /* 다음 회차 */
    }
  }
  return false;
}

/**
 * 답변 모으기 — 지금 띄워 둔 AI들의 최신 답변을 한 문서로 합쳐 클립보드에
 * 넣습니다. 둘만 보기(짝) 상태면 그 두 곳만 모읍니다 — 최소화해 둔 곳은
 * 대상에서 빠지므로 "창이 열려 있지 않음" 같은 헛된 실패가 나오지 않습니다.
 * 화면 배치는 건드리지 않습니다. (예전에는 패널이 펼쳐지며 입력창을 가렸음)
 * 복사한 뒤 한글·워드·입력창 어디에나 바로 붙여넣으면 됩니다.
 */
async function 답변모으기() {
  const 버튼 = document.getElementById("모으기버튼");
  버튼.disabled = true;
  버튼.textContent = "모으는 중…";
  try {
    const 응답 = await chrome.runtime.sendMessage({ 종류: "답변수집" });
    const 결과 = (응답 && 응답.결과) || {};
    let 문서 = "";
    const 성공한곳 = [];
    const 실패한곳 = [];
    for (const [, r] of Object.entries(결과)) {
      if (r.성공) {
        문서 += `## ${r.이름}\n\n${r.본문}\n\n---\n\n`;
        성공한곳.push(r.이름);
      } else {
        실패한곳.push(`${r.이름}(${r.사유 || "실패"})`);
      }
    }

    if (!문서) {
      토스트(
        [
          글줄(`복사할 답변이 없습니다 — ${실패한곳.join(", ")}`, "실패"),
          글줄("띄워 둔 AI가 답을 다 쓴 뒤에 눌러 주세요.", "안내"),
        ],
        9000
      );
      return;
    }

    // 한 곳이라도 빠졌으면, 반쪽짜리를 조용히 복사해 두지 않고 먼저 알립니다.
    if (실패한곳.length) {
      토스트(
        [
          글줄(`${실패한곳.join(", ")} — 이 곳은 빠졌습니다`, "실패"),
          글줄(`${성공한곳.join(" · ")} 답변만 복사합니다.`, "안내"),
        ],
        9000
      );
    }

    const 복사됨 = await 클립보드복사(문서.trim());
    if (!복사됨) {
      // 복사에 실패했으면 "됐다"고 하지 않습니다.
      // (예전에는 실패해도 성공으로 알려, 붙여넣으면 옛 내용이 나왔습니다)
      토스트(
        [
          글줄("복사하지 못했습니다 — 클립보드가 막혔습니다.", "실패"),
          글줄("명령바를 한 번 클릭한 뒤 다시 눌러 주세요.", "안내"),
        ],
        9000
      );
      return;
    }
    const 글자수 = 문서.trim().length;
    토스트(
      [
        글줄(
          `${성공한곳.join(" · ")} 답변 ${글자수.toLocaleString("ko-KR")}자를 복사했습니다.`,
          "안내"
        ),
        글줄("붙여넣기(⌘V / Ctrl+V) 하세요.", "안내"),
      ],
      6000
    );
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
  질문칸.dispatchEvent(new Event("input"));
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
      // 명령바에서 대상 선택을 없앴으므로 세 곳 모두를 후보로 올립니다.
      // 실제 대상은 백그라운드가 "지금 띄워 둔 곳"으로 좁힙니다 —
      // 둘만 보기(짝) 중이면 그 두 곳에만 전달됩니다.
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
  // ★ 한글을 조합하는 중에는 Enter 를 전송으로 받지 않습니다. ★
  // 빠르게 치면 마지막 글자가 아직 조합 중인 상태에서 Enter 가 눌립니다.
  // 그때 전송하면 마지막 글자가 빠진 채 나가고, 뒤늦게 확정된 글자가
  // 입력칸에 남아 한 번 더 누르게 되어 전송이 겹쳤습니다.
  // 조합 중 Enter 는 "글자 확정"이므로 흘려보내고, 확정된 뒤의 Enter 만 받습니다.
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    전송();
  }
});
document.getElementById("창정리버튼").addEventListener("click", async () => {
  // 정렬 = 원래 모습으로. 펼쳐 둔 패널을 먼저 접어야 창 높이와 내용이 맞습니다.
  await 확장패널열기(false);
  // 짝을 빼고 보내면 백그라운드가 세 창 기본 보기로 되돌립니다.
  chrome.runtime.sendMessage({ 종류: "창정리" });
  await 짝표시갱신();
});

/* ── 둘만 보기(짝) ──
 * 셋 중 두 곳만 좌우로 화면을 꽉 채워 띄웁니다. 빠진 곳은 닫지 않고
 * 최소화만 하므로 대화가 그대로 남고, 정렬(기본 보기)를 누르면 되살아납니다.
 * 짝은 기억하지 않습니다 — 카페는 언제나 세 창(기본 보기)으로 시작합니다.
 */
async function 짝표시갱신() {
  const { 현재짝 } = await chrome.storage.session.get("현재짝");
  const 짝 = Array.isArray(현재짝) && 현재짝.length === 2 ? 현재짝 : null;
  document.querySelectorAll(".짝버튼").forEach((b) => {
    const 값 = (b.dataset.짝 || "").split(",");
    b.classList.toggle(
      "선택됨",
      !!짝 && 값.length === 2 && 값.every((키) => 짝.includes(키))
    );
  });
  // 지금 안 보이는 창의 전환 탭을 흐리게 해, 눌러도 안 되는 게 아니라
  // "최소화되어 있다"는 것을 알 수 있게 합니다.
  document.querySelectorAll(".전환버튼").forEach((b) => {
    b.classList.toggle("빠짐", !!짝 && !짝.includes(b.dataset.사이트));
  });
}

document.querySelectorAll(".짝버튼").forEach((버튼) => {
  버튼.addEventListener("click", async () => {
    const 짝 = (버튼.dataset.짝 || "").split(",").filter(Boolean);
    if (짝.length !== 2) return;
    await 확장패널열기(false);
    await chrome.runtime.sendMessage({ 종류: "창정리", 짝 });
    await 짝표시갱신();
    await 전면표시갱신();
  });
});
document.getElementById("새대화버튼").addEventListener("click", () => {
  chrome.runtime.sendMessage({ 종류: "새대화" });
});
// 모두 닫기: 크롬의 확인 대화상자는 명령바가 화면 하단에 있을 때
// 버튼이 독(Dock) 아래로 내려가 누를 수 없는 문제가 있어 쓰지 않습니다.
// 대신 같은 버튼이 "정말 닫기?"로 바뀌는 2단 확인 방식을 씁니다.
let 모두닫기확인타이머 = null;
const 모두닫기버튼 = document.getElementById("모두닫기버튼");
function 모두닫기확인해제() {
  if (모두닫기확인타이머) clearTimeout(모두닫기확인타이머);
  모두닫기확인타이머 = null;
  delete 모두닫기버튼.dataset.확인중;
  모두닫기버튼.textContent = "모두 닫기";
  모두닫기버튼.classList.remove("위험");
}
모두닫기버튼.addEventListener("click", () => {
  if (!모두닫기버튼.dataset.확인중) {
    // 1단계: 실수 방지 — 버튼이 그 자리에서 물어봅니다 (4초 안에 다시 누르면 실행)
    모두닫기버튼.dataset.확인중 = "1";
    모두닫기버튼.textContent = "정말 닫기?";
    모두닫기버튼.classList.add("위험");
    모두닫기확인타이머 = setTimeout(모두닫기확인해제, 4000);
    return;
  }
  // 2단계: 실행
  모두닫기확인해제();
  chrome.runtime.sendMessage({ 종류: "모두닫기" }).then(() => 짝표시갱신());
  토스트([글줄("세 AI 창을 닫았습니다. [정렬] 또는 Alt+3 으로 다시 엽니다.")], 6000);
});
// 이력 지우기: confirm 대화상자 대신 링크가 "정말 지우기?"로 바뀌는 2단 확인
let 이력지우기타이머 = null;
document.getElementById("이력지우기").addEventListener("click", async (e) => {
  e.preventDefault();
  const 링크 = e.target;
  if (!링크.dataset.확인중) {
    링크.dataset.확인중 = "1";
    링크.textContent = "정말 지우기?";
    이력지우기타이머 = setTimeout(() => {
      delete 링크.dataset.확인중;
      링크.textContent = "지우기";
    }, 4000);
    return;
  }
  clearTimeout(이력지우기타이머);
  delete 링크.dataset.확인중;
  링크.textContent = "지우기";
  await chrome.storage.local.remove("질문이력");
  await 이력그리기();
});
document.getElementById("이력검색").addEventListener("input", 이력그리기);
document.getElementById("모으기버튼").addEventListener("click", () => {
  답변모으기(); // 복사만 합니다 — 창 크기·배치는 그대로
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
    return 토스트(
      [글줄("아직 보관된 대화가 없습니다. (세 답변 생성이 모두 끝나면 자동 보관됩니다)")],
      6000
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
  if (!이력.length) return 토스트([글줄("내보낼 이력이 없습니다.")], 5000);
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


/* 백그라운드가 "패널을 접으라"고 하면 접습니다.
 * (단축키로 정렬했을 때도 명령바 안 상태가 창 크기와 어긋나지 않게)
 */
chrome.runtime.onMessage.addListener((메시지) => {
  if (메시지 && 메시지.종류 === "패널접기" && 패널열림) {
    패널열림 = false;
    document.getElementById("확장패널").classList.add("숨김");
  }
});
