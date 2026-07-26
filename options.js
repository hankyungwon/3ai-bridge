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
}

(async () => {
  설정 = await 설정불러오기();
  순서상자그리기();
  선택프로필그리기();
  배치옵션그리기();
  프로필그리기();
})();
