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
    모델항목: [
      '[role="menu"] [role="menuitem"]',
      '[role="menuitem"]',
      '[role="option"]',
    ],
    // 현재 선택된 모델 이름이 적혀 있는 곳 (선택 성공 여부 확인용)
    모델라벨: [
      'button[data-testid="model-selector-dropdown"]',
      'button[aria-haspopup="menu"][data-testid*="model"]',
    ],
    // 목록에 원하는 모델이 안 보일 때 눌러 볼 "더 보기" 계열 항목의 문구
    더보기문구: ["more models", "다른 모델", "기타", "more"],
    // 답변 생성 중에만 나타나는 "중지" 버튼 (답변 완료 감지용)
    생성중표시: [
      'button[aria-label="Stop response"]',
      'button[aria-label="응답 중지"]',
      'button[aria-label*="Stop"]',
    ],
    // AI 답변 본문 블록 (답변 모으기용) — 마지막 것이 최신 답변
    답변블록: [
      'div[data-testid="assistant-message"]',
      ".font-claude-message",
      'div[data-test-render-count] div[class*="font-claude"]',
    ],
    // 첨부를 넣는 방식(순서대로 시도): input=숨겨진 파일 업로드 칸에 직접 주입,
    // paste=붙여넣기 이벤트, drop=끌어다 놓기 이벤트
    // 답변 본문에서 걷어낼 것들 (버튼·도구모음 등 화면 장식)
    본문제외: [
      "button",
      '[role="button"]',
      '[role="toolbar"]',
      '[data-testid*="action"]',
      "svg",
    ],
    첨부방식: ["input", "drop", "paste"],
    파일입력: [
      'input[data-testid="file-upload"]',
      'input[type="file"][multiple]',
      'input[type="file"]',
    ],
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
      'button[aria-label*="Model"]',
    ],
    모델항목: [
      '[role="menu"] [role="menuitem"]',
      '[data-testid^="model-switcher-"]',
      '[role="menuitem"]',
      '[role="option"]',
    ],
    모델라벨: [
      'button[data-testid="model-switcher-dropdown-button"]',
      'div[data-testid="model-switcher-label"]',
    ],
    // ChatGPT는 상위 모델이 "레거시 모델 / 더 보기" 하위 메뉴에 숨어 있는 경우가 많습니다.
    더보기문구: ["레거시", "legacy", "더 보기", "more models", "기타 모델", "more"],
    생성중표시: [
      'button[data-testid="stop-button"]',
      'button[aria-label*="중지"]',
      'button[aria-label*="Stop"]',
    ],
    답변블록: [
      '[data-message-author-role="assistant"]',
      'div[data-testid^="conversation-turn"] .markdown',
    ],
    본문제외: [
      "button",
      '[role="button"]',
      '[role="toolbar"]',
      ".sr-only",
      "svg",
    ],
    첨부방식: ["paste", "input"],
    파일입력: ['input[type="file"][multiple]', 'input[type="file"]'],
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
    모델항목: [
      'button[role="menuitemradio"]',
      ".mat-mdc-menu-panel button",
      '[role="menuitem"]',
      '[role="option"]',
    ],
    모델라벨: [
      "button.gds-mode-switch-button",
      '[data-test-id="bard-mode-menu-button"]',
    ],
    더보기문구: ["더 보기", "more", "기타"],
    생성중표시: [
      'button[aria-label*="중지"]',
      'button[aria-label*="Stop"]',
      ".stop-icon",
      'mat-icon[data-mat-icon-name="stop"]',
    ],
    답변블록: [
      "message-content .markdown",
      "message-content",
      ".model-response-text",
      "model-response",
    ],
    본문제외: [
      "button",
      '[role="button"]',
      '[role="toolbar"]',
      "mat-icon",
      ".mat-mdc-button-touch-target",
      "svg",
    ],
    첨부방식: ["paste", "input", "drop"],
    파일입력: ['input[type="file"]'],
  },

  // ─────────────────────────────────────────────────────────────
  // 모델 이름 별칭표 (모델 자동 선택 성공률을 높이기 위한 사전)
  // 설정에 적은 이름이 화면 표기와 조금 달라도 찾아낼 수 있게,
  // "같은 뜻으로 볼 수 있는 표현"들을 함께 적어 둡니다.
  // 사이트가 새 모델을 내면 여기에 한 줄 추가하면 됩니다.
  // ─────────────────────────────────────────────────────────────
};

const 모델별칭 = {
  claude: {
    fable: ["fable", "fable 5"],
    opus: ["opus", "opus 4.1", "opus 4"],
    sonnet: ["sonnet", "sonnet 4.5", "sonnet 4"],
    haiku: ["haiku"],
    최상위: ["fable", "opus"],
  },
  chatgpt: {
    최상위: ["pro", "thinking", "o3", "5.2 pro"],
    thinking: ["thinking", "생각", "reasoning"],
    pro: ["pro"],
    auto: ["auto", "자동"],
    instant: ["instant", "빠른"],
  },
  gemini: {
    pro: ["pro"],
    flash: ["flash", "빠른"],
    최상위: ["pro", "ultra", "deep think"],
    "deep research": ["deep research", "심층 리서치"],
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
globalThis.모델별칭 = 모델별칭;
globalThis.사이트판별 = 사이트판별;
