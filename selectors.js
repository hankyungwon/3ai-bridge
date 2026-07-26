/**
 * selectors.js — 사이트별 "선택자(selector)" 모음
 * =====================================================
 * ★ 사이트가 개편되어 확장이 안 될 때는 이 파일만 고치면 됩니다. ★
 *
 * 선택자란? 웹페이지 안에서 "입력란", "전송 버튼" 같은 특정 요소를
 * 찾아내는 주소 같은 문자열입니다. 사이트가 화면을 바꾸면 이 주소가
 * 바뀌어서 확장이 요소를 못 찾게 됩니다. 그때 수리요청.md 를 참고하세요.
 *
 * 각 항목은 "후보 목록(배열)"입니다. 위에서부터 차례로 시도해서
 * 처음 발견되는 것을 사용합니다. 그래서 예전 선택자를 지우지 않고
 * 새 선택자를 맨 앞에 추가만 해도 대부분 동작합니다.
 */

const BRIDGE_SELECTORS = {
  claude: {
    이름: "Claude",
    // 이 사이트로 판별할 URL 조각
    호스트: ["claude.ai"],
    // 새 대화/기존 대화의 시작 주소 (창을 새로 열 때 사용)
    시작URL: "https://claude.ai/new",
    // 질문을 입력하는 칸 (Claude는 contenteditable div 사용)
    입력란: [
      'div[contenteditable="true"][enterkeyhint]',
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"]',
      "textarea",
    ],
    // 전송(비행기) 버튼
    전송버튼: [
      'button[aria-label="Send message"]',
      'button[aria-label="메시지 보내기"]',
      'button[type="submit"][aria-label*="Send"]',
      'fieldset button[type="submit"]',
    ],
    // 모델 선택 드롭다운을 여는 버튼 (베스트 에포트 기능용)
    모델버튼: [
      'button[data-testid="model-selector-dropdown"]',
      'button[aria-haspopup="menu"][data-testid*="model"]',
    ],
    // 드롭다운이 열린 뒤 나타나는 모델 항목들
    모델항목: ['[role="menuitem"]', '[role="option"]'],
  },

  chatgpt: {
    이름: "ChatGPT",
    호스트: ["chatgpt.com", "chat.openai.com"],
    시작URL: "https://chatgpt.com/",
    입력란: [
      "div#prompt-textarea[contenteditable='true']",
      "div[contenteditable='true'].ProseMirror",
      "textarea#prompt-textarea",
      "div[contenteditable='true']",
    ],
    전송버튼: [
      'button[data-testid="send-button"]',
      'button[aria-label="프롬프트 보내기"]',
      'button[aria-label="Send prompt"]',
      'button[id="composer-submit-button"]',
    ],
    모델버튼: [
      'button[data-testid="model-switcher-dropdown-button"]',
      'button[aria-label*="모델"]',
    ],
    모델항목: ['[role="menuitem"]', '[role="option"]'],
  },

  gemini: {
    이름: "Gemini",
    호스트: ["gemini.google.com"],
    시작URL: "https://gemini.google.com/app",
    입력란: [
      "div.ql-editor[contenteditable='true']",
      "rich-textarea div[contenteditable='true']",
      "div[contenteditable='true']",
      "textarea",
    ],
    전송버튼: [
      "button.send-button",
      'button[aria-label="보내기"]',
      'button[aria-label="Send message"]',
      'button[mattooltip="보내기"]',
    ],
    모델버튼: [
      "button.gds-mode-switch-button",
      'button[data-test-id="bard-mode-menu-button"]',
    ],
    모델항목: ['button[role="menuitemradio"]', '[role="menuitem"]', '[role="option"]'],
  },
};

/** URL을 보고 어느 사이트인지 알려줍니다. 모르면 null. */
function 사이트판별(url) {
  for (const [키, 설정] of Object.entries(BRIDGE_SELECTORS)) {
    if (설정.호스트.some((h) => url.includes(h))) return 키;
  }
  return null;
}

// 콘텐츠 스크립트(웹페이지 안)와 서비스워커(background.js) 양쪽에서
// 같은 파일을 그대로 쓸 수 있게 전역으로 노출합니다.
globalThis.BRIDGE_SELECTORS = BRIDGE_SELECTORS;
globalThis.사이트판별 = 사이트판별;
