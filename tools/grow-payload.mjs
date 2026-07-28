#!/usr/bin/env node
/**
 * tools/grow-payload.mjs — [진단 전용] P1이 재현되지 않을 때 한 변수씩 키우기
 *
 * 사용법 (payload-P1.txt 를 기준으로 읽습니다):
 *   node tools/grow-payload.mjs 길이     → payload-P1-길이2배.txt
 *   node tools/grow-payload.mjs 개행     → payload-P1-개행2배.txt
 *   node tools/grow-payload.mjs 구조     → payload-P1-구조2배.txt
 *
 * ★ 반드시 한 번에 하나씩만 바꾸십시오. 재현되는 순간 멈추고, 그 파일을
 *   새 P1 으로 삼으십시오. 마지막에 바꾼 변수가 곧 임계 변수입니다.
 *
 * 순서: 1) 길이 2배(개행 비율 유지) → 2) 개행만 2배(길이 유지)
 *       → 3) 표·코드펜스 밀도 2배
 * 셋 다 재현 실패면 재현 조건이 다른 데 있다는 뜻입니다.
 */

import { readFileSync, writeFileSync } from "node:fs";

const 모드 = process.argv[2];
const 원본파일 = process.argv[3] || "payload-P1.txt";

if (!["길이", "개행", "구조"].includes(모드)) {
  console.error("사용법: node tools/grow-payload.mjs 길이|개행|구조 [원본파일]");
  process.exit(1);
}

let 원본;
try {
  원본 = readFileSync(원본파일, "utf8");
} catch (e) {
  console.error(`${원본파일} 을 읽지 못했습니다.`);
  process.exit(1);
}

const 통계 = (글) =>
  `${글.length}자 / 개행 ${(글.match(/\n/g) || []).length}개 / ` +
  `표줄 ${(글.match(/^\s*\|/gm) || []).length} / 코드펜스 ${(글.match(/```/g) || []).length}`;

let 결과;
let 이름;

if (모드 === "길이") {
  // 같은 글을 두 번 이어 붙임 — 개행 비율은 그대로 유지됩니다.
  결과 = 원본 + "\n" + 원본;
  이름 = "payload-P1-길이2배.txt";
} else if (모드 === "개행") {
  // 길이를 유지하며 개행 수만 늘립니다: 공백 하나를 개행으로 바꾸고,
  // 그만큼 다른 곳에서 글자를 덜어내지 않아도 되도록 1:1 치환만 합니다.
  const 목표추가 = (원본.match(/\n/g) || []).length;
  let 남음 = 목표추가;
  const 공백수 = (원본.match(/ /g) || []).length;
  const 간격 = Math.max(1, Math.floor(공백수 / Math.max(1, 목표추가)));
  let 본카운트 = 0;
  결과 = 원본.replace(/ /g, (m) => {
    본카운트++;
    if (남음 > 0 && 본카운트 % 간격 === 0) {
      남음--;
      return "\n";
    }
    return m;
  });
  이름 = "payload-P1-개행2배.txt";
} else {
  // 표·코드펜스 블록을 원본 끝에 같은 분량만큼 덧붙여 구조 밀도를 올립니다.
  const 표줄 = (원본.match(/^\s*\|.*$/gm) || []).join("\n");
  const 펜스 = (원본.match(/```[\s\S]*?```/g) || []).join("\n\n");
  const 덧 = [표줄, 펜스].filter(Boolean).join("\n\n");
  if (!덧) {
    console.error(
      "원본에 표(| … |)나 코드펜스(```)가 없어 구조 밀도를 2배로 만들 수 없습니다."
    );
    process.exit(1);
  }
  결과 = 원본 + "\n\n" + 덧;
  이름 = "payload-P1-구조2배.txt";
}

writeFileSync(이름, 결과);
console.log(`원본 (${원본파일}): ${통계(원본)}`);
console.log(`생성 (${이름}): ${통계(결과)}`);
console.log(
  "\n이 파일로 3창 3회를 돌리십시오. 재현되면 멈추고 이것을 새 P1 으로 삼으십시오."
);
