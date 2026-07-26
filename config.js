/**
 * config.js — 기본 설정값과 저장/불러오기 도우미
 * 모든 데이터는 크롬 로컬 저장소(chrome.storage.local)에만 저장됩니다.
 * 외부 서버로 나가는 통신은 이 확장에 전혀 없습니다.
 */

const 기본설정 = {
  // 창을 왼쪽부터 배치할 순서
  창순서: ["claude", "chatgpt", "gemini"],

  // 프로필(프리셋). 접두어는 질문 앞에 자동으로 붙는 지시문입니다.
  // 사이트별접두어에 값을 넣으면 그 사이트에서는 공통접두어 대신 그 값을 씁니다.
  프로필: [
    {
      id: "표준",
      이름: "표준",
      공통접두어: "",
      사이트별접두어: { claude: "", chatgpt: "", gemini: "" },
      모델: { claude: "", chatgpt: "", gemini: "" },
    },
    {
      id: "심층",
      이름: "심층",
      공통접두어:
        "단계적으로 깊이 추론하고, 근거와 불확실성을 명시해 답하라.\n\n",
      사이트별접두어: { claude: "", chatgpt: "", gemini: "" },
      모델: { claude: "Fable", chatgpt: "", gemini: "Pro" },
    },
    {
      id: "신속",
      이름: "신속",
      공통접두어: "핵심만 5줄 이내로 답하라.\n\n",
      사이트별접두어: { claude: "", chatgpt: "", gemini: "" },
      모델: { claude: "", chatgpt: "", gemini: "" },
    },
  ],

  // 마지막으로 고른 프로필과 사이트 체크박스 상태
  선택프로필: "표준",
  사이트사용: { claude: true, chatgpt: true, gemini: true },
};

/** 저장된 설정을 불러옵니다(없으면 기본값). */
async function 설정불러오기() {
  const 저장 = await chrome.storage.local.get("설정");
  return Object.assign({}, 기본설정, 저장.설정 || {});
}

/** 설정을 저장합니다. */
async function 설정저장(설정) {
  await chrome.storage.local.set({ 설정 });
}

globalThis.기본설정 = 기본설정;
globalThis.설정불러오기 = 설정불러오기;
globalThis.설정저장 = 설정저장;
