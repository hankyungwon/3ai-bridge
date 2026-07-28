#!/usr/bin/env node
/**
 * tools/make-payloads.mjs — [진단 전용] 개행 변수 판별용 시험 문장 3종 생성
 *
 * 사용법:
 *   node tools/make-payloads.mjs 4000        # 목표 길이(글자 수), 기본 4000
 *   node tools/make-payloads.mjs 4000 원문.txt   # P1 을 실패했던 원문으로 지정
 *
 * 만들어지는 파일 (현재 폴더):
 *   payload-P2.txt  같은 길이 · 개행 5개 · 특수문자 없음 (순수 산문)
 *   payload-P3.txt  같은 길이 · 개행 수백 개 · 특수문자 없음
 *   payload-P1.txt  (원문 파일을 준 경우에만) 길이를 맞춘 기준선
 *
 * 판정
 *   P2 성공 + P3 실패 → "개행 수"가 범인 (1순위 가설 확정에 가까움)
 *   P2 · P3 둘 다 실패 → 개행과 무관한 길이/타이밍 문제
 *   P2 · P3 둘 다 성공 → 특수문자·마크다운 구조 쪽을 다시 봐야 함
 */

import { readFileSync, writeFileSync } from "node:fs";

// 인수가 없으면 payload-P1.txt 를 기준으로 삼습니다(원문 고정 원칙).
const 원문파일 = process.argv[3] || "payload-P1.txt";
let 기준원문 = null;
try {
  기준원문 = readFileSync(원문파일, "utf8");
} catch (e) {
  기준원문 = null;
}
// 길이는 P1 이 있으면 P1 길이로 맞춥니다. 없으면 인수, 그것도 없으면 4000.
const 목표 = process.argv[2]
  ? parseInt(process.argv[2], 10)
  : 기준원문
  ? 기준원문.length
  : 4000;

// 특수문자(백틱·달러·역슬래시·별표 등)를 일부러 배제한 한글 산문 재료
const 낱말 = [
  "오늘", "아침", "창밖", "바람", "조용히", "지나가고", "책상", "위에",
  "놓인", "찻잔", "에서", "김", "이", "천천히", "올라온다", "어제", "읽던",
  "책", "을", "다시", "펼쳐", "본다", "문장", "하나", "가", "오래", "남는다",
];

function 산문(길이, 개행수) {
  const 조각 = [];
  let 누적 = 0;
  let i = 0;
  // 개행을 고르게 뿌리기 위한 간격
  const 간격 = 개행수 > 0 ? Math.floor(길이 / (개행수 + 1)) : Infinity;
  let 다음개행 = 간격;
  while (누적 < 길이) {
    const w = 낱말[i++ % 낱말.length];
    조각.push(w);
    누적 += w.length + 1;
    if (누적 >= 다음개행 && 개행수 > 0) {
      조각.push("\n");
      다음개행 += 간격;
    } else {
      조각.push(" ");
    }
  }
  return 조각.join("").slice(0, 길이);
}

const P2 = 산문(목표, 5);
const P3 = 산문(목표, Math.max(200, Math.floor(목표 / 20)));

writeFileSync("payload-P2.txt", P2);
writeFileSync("payload-P3.txt", P3);

const 요약 = (이름, 글) =>
  `${이름}: ${글.length}자 / 개행 ${(글.match(/\n/g) || []).length}개`;

console.log(요약("P2 (개행 5개)", P2));
console.log(요약("P3 (개행 많음)", P3));

if (기준원문) {
  const P1 = 기준원문.length > 목표 ? 기준원문.slice(0, 목표) : 기준원문;
  writeFileSync("payload-P1.txt", P1);
  console.log(요약(`P1 (${원문파일})`, P1));
} else {
  console.log(
    `P1: ${원문파일} 이 없습니다. 실패했던 원문을 payload-P1.txt 로 저장한 뒤 다시 실행하면 길이를 맞춰 줍니다.`
  );
}

console.log(
  "\n세 파일을 각각 명령바에 붙여넣어 3회씩 보낸 뒤, 진단 로그를 내보내십시오."
);
console.log(
  "규칙: 9회 전부 같은 파일에서 복사 · 시행 사이 응답 완료 대기 · 매 시행 새 대화 · 무거운 프로그램 종료"
);
