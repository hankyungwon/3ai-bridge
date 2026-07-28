# 제비(Gemini) 장문 잘림 — 진단 보고서 (수정 없음)

- 작업 시작 시점 커밋: **64e47fa0108e3019f9248c9c7758f8c32f98abc4** (v1.17.1)
- 브랜치: `diagnose/gemini-truncation`
- **Manifest 버전: MV3** (`manifest.json` 2행 `"manifest_version": 3`, 서비스워커 `background.js`)
- 이 문서의 줄 번호는 **계측 코드가 들어간 현재 브랜치 기준**입니다. 계측은
  모두 "추가"이며 기존 줄을 옮기기만 했을 뿐 논리는 그대로입니다.

---

## 1. 정적 조사 결과 (작업 A-1)

지시서에 나열된 표현을 전 파일에서 검색한 요약입니다. **굵게** 표시한 것이
질문 원문이 지나가는 경로 위에 실제로 존재하는 것들입니다.

| 표현 | 발견 여부 | 위치 |
|---|---|---|
| `.replace(` | 원문 경로에 **없음** | `popup.js:444,478`(이력 표시용 첨부 표식 제거), `popup.js:778`(내보내기 문서에서 개행→공백). 셋 다 전송 경로 밖 |
| `${` (템플릿 리터럴) | 원문 경로에 **없음** | 전부 `popup.js`의 화면 표시/파일 내보내기 문자열 |
| `executeScript` | 있음 (**코드 문자열 아님**) | `background.js:453` — `files: [...]` 방식 |
| `executeJavaScript` / `new Function` / `eval(` | **없음** | — |
| `innerHTML` | 원문 경로에 **없음** | `popup.js`, `options.js`의 목록 비우기 용도 |
| `innerText` | **있음** | `content.js:86,93`(입력란 읽기), `297,318,369,513` |
| `textContent` | **있음(대비책)** | `content.js:80` — `execCommand` 실패 시에만 |
| `.value =` | 원문 경로에 **없음**(팝업 입력칸 비우기) | `popup.js:597` |
| `execCommand` | **있음 — 핵심** | `content.js:76`(delete), `content.js:77`(insertText) |
| `chunk` | **없음** | 분할 로직 자체가 존재하지 않음 |
| `slice(` | 원문 경로에 **없음** | `content.js:514` 답변 수집 30000자 제한(수신 측), `background.js` 기록 개수 제한 |
| `substring(` | **없음** | — |
| `split('\n')` / `split("\n")` | **없음** | — |
| `dispatchEvent` | **있음** | `content.js:66,67,82` 등 |
| `ClipboardEvent` / `DataTransfer` | 있음(첨부 전용) | `content.js:104,144,149` |
| `InputEvent` | **있음** | `content.js:82` |
| `.focus(` / `.blur(` | 있음 | `content.js:53`(주입 직전), `content.js:141,190`; `.blur(` **없음** |
| `sendMessage` / `onMessage` | **있음** | `popup.js:623`, `background.js:451,457,470`, `content.js:601` |
| `postMessage` | **없음** | — |

### 원문 경로 위의 결정적 코드 인용

```js
// popup.js:586-588  — 원문 시작점
async function 전송() {
  const 질문칸 = document.getElementById("질문");
  const 질문 = 질문칸.value.trim();   // ← trim 외 가공 없음
```

```js
// background.js:527-529 — 프로필 접두어만 앞에 붙음 (뒤는 손대지 않음)
function 본문만들기(프로필, 사이트키, 질문) {
  const 접두어 = 사이트별 && 사이트별.trim() ? 사이트별 : 프로필.공통접두어 || "";
  return 접두어 + 질문;
}
```

```js
// content.js:68-81 — 제비가 타는 경로 (contenteditable 분기)
const 범위 = document.createRange();
범위.selectNodeContents(입력란);
기존선택.removeAllRanges();
기존선택.addRange(범위);
document.execCommand("delete", false, null);
const 성공 = document.execCommand("insertText", false, 본문);
if (!성공) { 입력란.textContent = 본문; }
입력란.dispatchEvent(new InputEvent("input", { bubbles: true }));
```

```js
// content.js:85-88 — 주입 성공 판정: "길이 > 0" 뿐. 길이 일치 검사 없음
await 잠깐(150);
const 현재 = (입력란.value ?? 입력란.innerText ?? "").trim();
return 현재.length > 0;
```

---

## 2. Q1~Q10 답변 (작업 A-2)

### Q1. 원문이 제비 입력창에 도달하기까지의 전체 경로

| # | 단계 | 위치 |
|---|---|---|
| 1 | 명령바 textarea `#질문`의 `.value` 를 `.trim()` | `popup.js:587-588` |
| 2 | `chrome.runtime.sendMessage({종류:"동시질문", 질문, …})` (구조화 복제) | `popup.js:622-630` |
| 3 | 서비스워커 수신 → 대상 사이트 목록 결정 | `background.js:684` |
| 4 | `본문만들기(프로필, 키, 질문)` — 접두어 결합 | `background.js:714`, `527-529` |
| 5 | `사이트에전송(...)` → `탭에보내기` → `chrome.tabs.sendMessage({종류:"질문전송", 본문, …})` | `background.js:462-479`, `449-459` |
| 6 | 탭의 `content.js` 수신 → 모델 선택 → 입력란 대기 → 첨부 | `content.js:601-620` |
| 7 | `글자넣기(입력란, 메시지.본문)` → `execCommand("insertText")` | `content.js:621-623`, `52-88` |
| 8 | `전송하기()` — 전송 버튼 클릭 또는 Enter | `content.js:639`, `171-219` |

### Q2. 원문이 코드 문자열에 보간되는 지점

**없습니다.** 원문은 처음부터 끝까지 자바스크립트 **값**으로만 전달됩니다.
템플릿 리터럴·문자열 연결·`replace()` 두 번째 인수 어디에도 원문이 들어가지
않습니다. 유일한 문자열 연결은 `background.js:528`의 `접두어 + 질문` 이며,
이것은 원문 **앞**에만 붙습니다(뒤쪽 잘림과 무관). 따라서 `$&`, `` ` ``,
`${`, 역슬래시 같은 문자로 인한 훼손 가능성은 **정적으로 배제**됩니다.

### Q3. `chrome.scripting.executeScript` 방식

`background.js:453-456`, **`files:` 방식**입니다(코드 문자열 조립 아님).
게다가 이 호출은 원문을 나르지 않고, 스크립트가 없는 탭에 파일을 넣기만 합니다.

### Q4. 제비 입력창 주입 방식

`document.execCommand("insertText", false, 본문)` (contenteditable 분기).
그 앞에 `execCommand("delete")` 로 기존 내용을 지웁니다. 실패 시에만
`입력란.textContent = 본문` 대비책. CDP·클립보드는 글자 주입에 쓰지 않습니다.
(`content.js:68-81`)

### Q5. 청크 분할

**하지 않습니다.** 전 파일에 `chunk`, `substring`, `split("\n")` 이 없고,
`slice()` 는 답변 **수신** 측 30000자 제한(`content.js:514`)과 기록 개수
제한에만 쓰입니다. 즉 원문은 **한 번에 통째로** 주입됩니다.

### Q6. 세 창 주입은 순차인가 병렬인가

**병렬**입니다 — `Promise.all(대상.map(...))` (`background.js:709-720`).
순서는 `설정.창순서`(기본 `["gemini","chatgpt","claude"]`, `config.js`)에서
오며 하드코딩이 아니라 **설정값**입니다. 병렬이므로 "순번"은 시작 순서일 뿐
완료 순서를 보장하지 않습니다.

### Q7. 주입과 전송 사이의 대기

**고정 지연 + 조건 확인이 섞여 있습니다.**
- `글자넣기` 끝에 **고정 150ms** (`content.js:85`)
- 그 뒤 `전송하기`가 전송 버튼이 활성화될 때까지 250ms 간격으로 최대
  12회(첨부 시 120회) **조건 확인** (`content.js:221-231`)
- 전송 후 입력란이 비워졌는지 최대 4초 확인 (`content.js:250-254`)

**주의:** 대기 조건은 "버튼이 눌릴 수 있는가"이지 **"입력창 내용이 원문과
같은가"가 아닙니다.** 길이·해시 비교는 어디에도 없습니다.

### Q8. `focus()` / `blur()` / 탭 활성화 호출 지점

- `content.js:53-54` — 주입 직전 `입력란.focus(); 입력란.click();`
- `content.js:141` — 첨부(drop) 직전 `입력란.focus()`
- `content.js:181,187` — 첨부(paste) 시 `focus()`
- `content.js:190` — 전송 버튼을 못 찾았을 때 Enter 대비책 직전 `focus()`
- `content.js:262` — `전송하기` 안 Enter 대비책
- `blur()` 호출 **없음**
- 탭 활성화: `background.js:161`(기존 탭 재사용), `272`, `376`(창 앞으로).
  질문 주입 경로에서는 호출되지 않지만, **병렬 전송 중 다른 창이 포커스를
  가져가는 상황은 발생할 수 있습니다.**

### Q9. 제비 입력창 선택자와 요소 종류

`selectors.js:140-145`:
```js
입력란: [
  "div.ql-editor[contenteditable='true']",   // ← Quill 에디터
  "rich-textarea div[contenteditable='true']",
  "div[contenteditable='true']",
  "textarea",
],
```
**`<textarea>` 가 아니라 contenteditable(Quill `.ql-editor`)** 입니다.
따라서 제비는 네이티브 setter 경로가 아니라 `execCommand` 경로를 탑니다.

### Q10. 공통 함수인가, 사이트별 분기인가

주입 함수 `글자넣기`는 **세 사이트 공통**이며, 분기는 요소 종류
(`TEXTAREA/INPUT` ↔ contenteditable)로만 갈립니다. 세 사이트 모두 1순위
선택자가 contenteditable이므로 **코드 경로는 사실상 동일**합니다.
제비만 다른 것은 **선택자와 에디터 구현(Quill)** 이며, 첨부 방식 순서
(`제비 ["paste","input","drop"]`)도 다릅니다. 즉 **제비 전용 주입 분기는
코드에 존재하지 않습니다.**

---

## 3. 정적 조사만으로 유력해 보이는 지점 (보고만 — 고치지 않음)

> ⚠️ 아래는 **가설**입니다. 계측 로그로 확정하기 전에는 고치지 않습니다.

1. **`execCommand("insertText")` 의 장문 처리 (가장 유력, B→C 구간 가설)**
   Quill(`.ql-editor`)은 `insertText` 를 자체 델타(Delta) 모델로 가로채
   재처리합니다. 한 번의 `insertText` 로 수천 자 + 다수 개행이 들어오면
   Quill 이 중간에 잘라 반영하거나, 마지막 블록만 반영하는 사례가 알려져
   있습니다. 확인 방법: **C 단계 길이가 B보다 짧은가**.

2. **주입 성공 판정이 "길이 > 0" 뿐 (`content.js:87`)**
   절반만 들어가도 "성공"으로 보고됩니다. 잘림이 있어도 사용자에게 ❌가
   뜨지 않는 이유를 설명합니다. **이것은 잘림의 원인이 아니라 잘림을
   못 잡는 이유입니다.**

3. **전송 시점이 "버튼 활성화"로 판정됨 (`content.js:221-231`)**
   Quill 이 긴 텍스트를 비동기로 반영하는 중에 버튼이 먼저 활성화되면,
   반영이 끝나기 전에 전송될 수 있습니다. 확인 방법: **C=B인데 D만 짧은가**.

4. **고정 150ms 대기 (`content.js:85`)**
   장문일수록 반영 시간이 길어지는데 대기는 길이와 무관하게 고정입니다.
   위 3번과 같은 증거로 갈립니다.

5. **`insertText` 앞의 `execCommand("delete")`**
   기존 내용을 지운 직후 곧바로 삽입합니다. Quill 이 delete 를 비동기로
   처리하면 삽입과 경쟁할 수 있습니다.

정적 조사로 **배제된** 가설: 문자열 보간 훼손(Q2), 청크 분할(Q5),
코드 문자열 `executeScript`(Q3), 메시지 패싱 중 절단(구조화 복제는 길이 제한
없음 — 그래도 A/B 비교로 실측 확인합니다).

---

## 4. 계측 설계 (작업 B)

| 단계 | 캡처 대상 | 코드 위치 |
|---|---|---|
| A | 명령바 원문 (가공 전) | `popup.js` `전송()` 맨 앞 |
| B | 주입 함수가 수신한 문자열 | `content.js` `글자넣기` 호출 직전 |
| C | 주입 직후 입력란에서 다시 읽은 값 | `content.js` `전송하기` 호출 직전 |
| D | 전송 후 내 말풍선 `textContent` | `content.js` `진단말풍선캡처` (떼어 낸 작업) |

- 세 사이트 모두 B·C·D를 기록합니다(참새·하마는 대조군).
- 문자열 캡처는 전부 **동기**, `sha256`(비동기)은 `setTimeout(...,0)` 큐에서
  계산합니다. 주입·전송 경로에 `await` 를 추가하지 않았습니다.
- 모든 진단 호출은 `try/catch` + `globalThis.진단기록` 존재 확인으로 감쌌습니다.
- **전송을 막지 않습니다.** 검증 게이트를 도입하지 않았습니다. 잘려도 그대로
  보내고 기록만 합니다.
- D 단계는 접힘이 보이면 펼치기를 시도하고, 읽지 못하면
  `note: "unreadable(...)"` 로 남기며 실패로 단정하지 않습니다. 읽은 방법은
  `note` 에 기록합니다(`textContent 읽음 · 펼치기 시도함/안 함`).
- 저장: `chrome.storage.local` 키 `diagLogs`, **최근 50건 전송(sendId) 링버퍼**.

### 알아 둘 점 — A와 B는 원래 다를 수 있습니다
프로필 접두어가 `background.js:528`에서 원문 **앞**에 붙습니다. 그래서
판정기는 **B가 A로 끝나면** "접두어만 붙은 정상"으로 보고 접두어 길이를
표시합니다. 뒤쪽이 사라진 경우에만 A≠B 실패로 판정합니다.

---

## 5. 실행 절차 (사용자용)

1. 크롬 `chrome://extensions` → 이 브랜치 폴더로 확장 새로고침(⟳)
2. `Alt+3`(맥 `⌃3`)로 카페 열기
3. **잘리는 장문**을 명령바에 붙여넣고 전송
4. 제비 화면에서 실제로 잘렸는지 눈으로 확인 (같은 질문으로 2~3회 반복 권장)
5. 명령바 우측 **`진단 로그`** 버튼 클릭 → `3ai-diag-logs.json` 저장
6. 터미널에서:
   ```
   node tools/analyze-logs.mjs ~/Downloads/3ai-diag-logs.json
   ```
7. 출력 전체를 그대로 전달해 주십시오. 그 결과로 원인을 확정한 뒤,
   **별도 지시**에 따라 수정 작업을 시작합니다.

### 추가 실험 (선택)
설정 페이지 → **주입 순서 (진단 실험용)** 에서 `하마 → 참새 → 제비` 로 바꾸고
같은 장문을 다시 보낸 뒤 로그를 한 번 더 내려받으면, 판정기의 **사이트 × 순번
교차표**로 "제비라서 잘리는지, 첫 번째로 주입돼서 잘리는지"가 갈립니다.
기본값은 지금까지와 동일하므로 건드리지 않으면 동작 변화가 없습니다.
