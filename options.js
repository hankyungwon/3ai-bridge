/**
 * options.js — 설정 화면 (프로필·접두어·모델·창 순서 편집)
 */

const 사이트목록 = ["claude", "chatgpt", "gemini"];
const 사이트이름 = { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini" };
let 설정 = null;

function 순서상자그리기() {
  for (let i = 0; i < 3; i++) {
    const 상자 = document.getElementById("순서" + i);
    상자.innerHTML = "";
    for (const 키 of 사이트목록) {
      const opt = document.createElement("option");
      opt.value = 키;
      opt.textContent = 사이트이름[키];
      상자.appendChild(opt);
    }
    상자.value = 설정.창순서[i] || 사이트목록[i];
  }
}

function 프로필그리기() {
  const 목록 = document.getElementById("프로필목록");
  목록.innerHTML = "";

  설정.프로필.forEach((p, 번호) => {
    const 칸 = document.createElement("div");
    칸.className = "카드";

    const 제목줄 = document.createElement("div");
    제목줄.className = "줄";
    const 이름칸 = document.createElement("input");
    이름칸.value = p.이름;
    이름칸.className = "이름칸";
    이름칸.addEventListener("input", () => (p.이름 = 이름칸.value));
    제목줄.appendChild(이름칸);

    const 삭제 = document.createElement("button");
    삭제.textContent = "삭제";
    삭제.className = "보조";
    삭제.addEventListener("click", () => {
      설정.프로필.splice(번호, 1);
      프로필그리기();
    });
    제목줄.appendChild(삭제);
    칸.appendChild(제목줄);

    const 공통라벨 = document.createElement("label");
    공통라벨.className = "라벨";
    공통라벨.textContent = "공통 접두어";
    칸.appendChild(공통라벨);

    const 공통 = document.createElement("textarea");
    공통.rows = 2;
    공통.value = p.공통접두어 || "";
    공통.addEventListener("input", () => (p.공통접두어 = 공통.value));
    칸.appendChild(공통);

    for (const 키 of 사이트목록) {
      const 줄 = document.createElement("div");
      줄.className = "사이트줄";

      const 라벨 = document.createElement("span");
      라벨.className = "사이트라벨";
      라벨.textContent = 사이트이름[키];
      줄.appendChild(라벨);

      const 접두 = document.createElement("input");
      접두.placeholder = "사이트별 접두어 (비우면 공통 사용)";
      접두.value = (p.사이트별접두어 || {})[키] || "";
      접두.addEventListener("input", () => {
        p.사이트별접두어 = p.사이트별접두어 || {};
        p.사이트별접두어[키] = 접두.value;
      });
      줄.appendChild(접두);

      const 모델 = document.createElement("input");
      모델.placeholder = "희망 모델명 (비우면 그대로)";
      모델.className = "모델칸";
      모델.value = (p.모델 || {})[키] || "";
      모델.addEventListener("input", () => {
        p.모델 = p.모델 || {};
        p.모델[키] = 모델.value;
      });
      줄.appendChild(모델);

      칸.appendChild(줄);
    }

    목록.appendChild(칸);
  });
}

document.getElementById("프로필추가").addEventListener("click", () => {
  설정.프로필.push({
    id: "프로필" + Date.now(),
    이름: "새 프로필",
    공통접두어: "",
    사이트별접두어: { claude: "", chatgpt: "", gemini: "" },
    모델: { claude: "", chatgpt: "", gemini: "" },
  });
  프로필그리기();
});

document.getElementById("저장").addEventListener("click", async () => {
  설정.창순서 = [0, 1, 2].map((i) => document.getElementById("순서" + i).value);
  설정.배치모드 = document.getElementById("배치모드").value;
  설정.호버포커스 = document.getElementById("호버포커스").checked;
  설정.시작시자동열기 = document.getElementById("시작시자동열기").checked;
  // 같은 사이트가 두 번 선택된 경우 빠진 사이트를 자동으로 채워 넣습니다.
  const 중복없이 = [...new Set(설정.창순서)];
  for (const 키 of 사이트목록) if (!중복없이.includes(키)) 중복없이.push(키);
  설정.창순서 = 중복없이.slice(0, 3);

  await 설정저장(설정);
  순서상자그리기();
  선택프로필그리기();
  const 안내 = document.getElementById("저장안내");
  안내.textContent = "저장되었습니다.";
  setTimeout(() => (안내.textContent = ""), 2000);
});

document.getElementById("초기화").addEventListener("click", async () => {
  설정 = JSON.parse(JSON.stringify(기본설정));
  await 설정저장(설정);
  순서상자그리기();
  선택프로필그리기();
  배치옵션그리기();
  프로필그리기();
});

function 선택프로필그리기() {
  const 상자 = document.getElementById("선택프로필");
  상자.innerHTML = "";
  for (const p of 설정.프로필) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.이름;
    상자.appendChild(opt);
  }
  상자.value = 설정.선택프로필;
  상자.addEventListener("change", () => (설정.선택프로필 = 상자.value));
}

function 배치옵션그리기() {
  document.getElementById("배치모드").value = 설정.배치모드 || "auto";
  document.getElementById("호버포커스").checked = 설정.호버포커스 !== false;
  document.getElementById("시작시자동열기").checked =
    설정.시작시자동열기 !== false;
}

(async () => {
  설정 = await 설정불러오기();
  순서상자그리기();
  선택프로필그리기();
  배치옵션그리기();
  프로필그리기();
})();


/* ─────────────── 진단 로그 열람 (관찰 전용) ───────────────
 * 개발자도구 없이도 로그를 보고 통째로 복사할 수 있게 합니다.
 */

const 로그라벨 = {
  runId: "묶음 ID",
  site: "사이트",
  이름: "이름",
  수집성공: "수집 성공",
  실패사유: "실패 사유",
  재시도횟수: "재시도 횟수",
  ts: "시각",
  path: "사용한 경로",
  pathAttempted: "시도한 경로",
  copyButtonFound: "복사 버튼 탐색",
  clipboardReadResult: "클립보드 읽기",
  documentHasFocus: "읽기 직전 창 포커스",
  documentHasFocusNow: "수집 시점 창 포커스",
  qualityCheck: "자가 품질검사",
  qualityFailReason: "품질검사 실패 항목",
  fallbackFired: "폴백 실행",
  fallbackTiming: "폴백 시점",
  extractSelector: "실제 사용 선택자",
  extractSelectorTried: "시도한 선택자",
  추출블록태그: "추출한 블록",
  블록내버튼수: "그 블록 안 버튼 수",
  블록내버튼글: "그 버튼들의 글자",
  postProcessApplied: "후처리 단계",
  streamComplete: "생성 완료 판정",
  rawLength: "원시 길이",
  finalLength: "최종 길이",
  head120: "앞 120자",
  tail120: "뒤 120자",
  결과모양: "결과 모양(관찰)",
  계측오류: "계측 오류",
};

function 값글로(값) {
  if (값 === null || 값 === undefined) return "(없음)";
  if (Array.isArray(값)) return 값.length ? 값.join(" / ") : "(빈 목록)";
  if (typeof 값 === "object") return JSON.stringify(값, null, 1);
  return String(값);
}

async function 로그읽기() {
  const { diagLog } = await chrome.storage.local.get("diagLog");
  return Array.isArray(diagLog) ? diagLog : [];
}

document.getElementById("로그보기").addEventListener("click", async () => {
  const 기록 = await 로그읽기();
  const 상자 = document.getElementById("로그내용");
  const 안내 = document.getElementById("로그안내");
  if (!기록.length) {
    상자.style.display = "none";
    안내.textContent =
      "아직 기록이 없습니다. 「세 답변 복사」를 한 번 누른 뒤 다시 보십시오.";
    return;
  }
  const 줄 = [];
  for (const 묶음 of 기록.slice(0, 5)) {
    줄.push("══ 묶음 " + 묶음.runId + "  (" + 묶음.ts + ") ══");
    for (const 항목 of 묶음.항목들 || []) {
      줄.push("── " + (항목.이름 || 항목.site) + " ──");
      for (const [키, 값] of Object.entries(항목)) {
        if (키 === "site" ||키 === "runId") continue;
        줄.push("  " + (로그라벨[키] || 키) + ": " + 값글로(값));
      }
    }
    줄.push("");
  }
  상자.textContent = 줄.join("\n");
  상자.style.display = "block";
  안내.textContent = `최근 ${Math.min(5, 기록.length)}개 묶음을 표시했습니다 (전체 ${기록.length}개 보관 중).`;
});

document.getElementById("로그복사").addEventListener("click", async () => {
  const 안내 = document.getElementById("로그안내");
  const 기록 = await 로그읽기();
  const 글 = JSON.stringify(기록, null, 2);
  let 복사됨 = false;
  try {
    await navigator.clipboard.writeText(글);
    복사됨 = true;
  } catch (e) {
    try {
      const 임시 = document.createElement("textarea");
      임시.value = 글;
      document.body.appendChild(임시);
      임시.select();
      복사됨 = document.execCommand("copy");
      document.body.removeChild(임시);
    } catch (e2) {
      복사됨 = false;
    }
  }
  안내.textContent = 복사됨
    ? `복사됨 — ${기록.length}개 묶음, ${글.length.toLocaleString("ko-KR")}자`
    : "복사하지 못했습니다. 「최근 로그 보기」로 띄운 뒤 직접 긁어 복사해 주십시오.";
});

document.getElementById("로그비우기").addEventListener("click", async () => {
  const 버튼 = document.getElementById("로그비우기");
  const 안내 = document.getElementById("로그안내");
  if (버튼.dataset.확인 !== "예") {
    버튼.dataset.확인 = "예";
    버튼.textContent = "정말 지울까요?";
    setTimeout(() => {
      버튼.dataset.확인 = "";
      버튼.textContent = "로그 비우기";
    }, 4000);
    return;
  }
  버튼.dataset.확인 = "";
  버튼.textContent = "로그 비우기";
  await chrome.storage.local.remove("diagLog");
  document.getElementById("로그내용").style.display = "none";
  안내.textContent = "로그를 비웠습니다.";
});


/* ─────────────── 전송 진단 로그 (관찰 전용) ───────────────
 * 저장 키는 sendLog 입니다. 수집용 diagLog 와 섞지 않습니다
 * (tools/analyze-logs.mjs 가 diagLog 형태를 전제로 파싱하기 때문).
 */

document.getElementById("전송로그내려받기").addEventListener("click", async () => {
  const 안내 = document.getElementById("전송로그안내");
  try {
    const { sendLog } = await chrome.storage.local.get("sendLog");
    const 목록 = Array.isArray(sendLog) ? sendLog : [];
    if (!목록.length) {
      안내.textContent =
        "아직 기록이 없습니다. 전송을 한 번 한 뒤 다시 눌러 주세요.";
      return;
    }
    const 글 = JSON.stringify(목록, null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([글], { type: "application/json" }));
    a.download = "3ai-send-log.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    안내.textContent = `내려받았습니다 — ${목록.length}건, ${글.length.toLocaleString("ko-KR")}자`;
  } catch (e) {
    안내.textContent = "내려받지 못했습니다: " + (e && e.message);
  }
});

document.getElementById("전송로그비우기").addEventListener("click", async () => {
  const 버튼 = document.getElementById("전송로그비우기");
  const 안내 = document.getElementById("전송로그안내");
  if (버튼.dataset.확인 !== "예") {
    버튼.dataset.확인 = "예";
    버튼.textContent = "정말 지울까요?";
    setTimeout(() => {
      버튼.dataset.확인 = "";
      버튼.textContent = "전송 로그 비우기";
    }, 4000);
    return;
  }
  버튼.dataset.확인 = "";
  버튼.textContent = "전송 로그 비우기";
  await chrome.storage.local.remove("sendLog");
  안내.textContent = "전송 로그를 비웠습니다.";
});
