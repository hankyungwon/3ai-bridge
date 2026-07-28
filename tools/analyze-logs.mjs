#!/usr/bin/env node
/**
 * tools/analyze-logs.mjs — [진단 전용] 잘림 지점 자동 판정기
 *
 * 사용법:
 *   node tools/analyze-logs.mjs ~/Downloads/3ai-diag-logs.json
 *
 * 명령바의 "진단 로그" 버튼으로 내려받은 JSON을 넣으면
 * 전송(sendId)마다 A→B→C→D 중 어디에서 글자가 사라졌는지 판정합니다.
 *
 * 판정 규칙
 *   A ≠ B          → 전달 경로 훼손 (보간·직렬화·메시지 패싱)
 *   A = B, B ≠ C   → 주입 실패 (에디터 주입 방식)
 *   A = B = C, C≠D → 내부 상태 동기화 또는 전송 문제
 *   A = B = C = D  → 잘림 없음 (표시 문제 또는 응답 문제)
 *   D 읽기 실패     → 판정 보류
 *
 * 주의: B는 프로필 접두어가 앞에 붙을 수 있습니다. B가 A로 "끝나면"
 * 접두어만 붙은 정상으로 보고, 접두어 길이를 함께 표시합니다.
 */

import { readFileSync } from "node:fs";

const 파일 = process.argv[2];
if (!파일) {
  console.error("사용법: node tools/analyze-logs.mjs <로그.json>");
  process.exit(1);
}

const 로그 = JSON.parse(readFileSync(파일, "utf8"));

/** 최초로 갈라지는 문자 인덱스 (같으면 -1) */
function 갈림점(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

/** 그 인덱스가 무엇과 겹치는지 표시 */
function 경계단서(원문, idx) {
  const 단서 = [];
  const 표 = {
    "첫 백틱 `": 원문.indexOf("`"),
    "첫 ${": 원문.indexOf("${"),
    "첫 역슬래시": 원문.indexOf("\\"),
    "첫 $&": 원문.indexOf("$&"),
    "첫 $$": 원문.indexOf("$$"),
    "첫 $'": 원문.indexOf("$'"),
    "첫 $`": 원문.indexOf("$`"),
    "첫 코드펜스 ```": 원문.indexOf("```"),
  };
  for (const [이름, 위치] of Object.entries(표)) {
    if (위치 >= 0 && Math.abs(위치 - idx) <= 2) 단서.push(`${이름}(=${위치})`);
  }
  // 개행 위치와 일치?
  let nl = -1;
  let 개행번호 = 0;
  while ((nl = 원문.indexOf("\n", nl + 1)) >= 0) {
    개행번호++;
    if (Math.abs(nl - idx) <= 1) 단서.push(`개행 #${개행번호}(=${nl})`);
  }
  단서.push(`고정 글자 수 후보: ${idx}`);
  return 단서;
}

// sendId 별로 묶기
const 묶음 = new Map();
for (const r of 로그) {
  if (!묶음.has(r.sendId)) 묶음.set(r.sendId, []);
  묶음.get(r.sendId).push(r);
}

const 집계 = {}; // site → {총, 실패}
const 교차 = {}; // `site|position` → {총, 실패}
let 전체 = 0;

for (const [sendId, 목록] of 묶음) {
  const A = 목록.find((r) => r.stage === "A");
  const 사이트들 = [...new Set(목록.filter((r) => r.site !== "controller").map((r) => r.site))];
  console.log(`\n══ 전송 ${sendId} ══`);
  if (!A) {
    console.log("  A 단계 기록 없음 — 판정 보류");
    continue;
  }
  console.log(`  A(원문): ${A.length}자 / ${A.byteLength}B / 개행 ${A.newlineCount}`);

  for (const site of 사이트들) {
    전체++;
    const B = 목록.find((r) => r.stage === "B" && r.site === site);
    const C = 목록.find((r) => r.stage === "C" && r.site === site);
    const D = 목록.find((r) => r.stage === "D" && r.site === site);
    const pos = (B && B.position) || (C && C.position) || 0;

    let 판정;
    let 상세 = [];

    const 접두어길이 = B ? B.length - A.length : 0;
    const A같은B =
      B && (B.sha256 === A.sha256 || (접두어길이 >= 0 && B.last64 === A.last64 && B.length >= A.length));

    if (!B) {
      판정 = "판정 보류 (B 없음)";
    } else if (!A같은B) {
      판정 = "❌ 전달 경로 훼손 (A ≠ B)";
      상세 = 비교상세(A, B);
    } else if (!C) {
      판정 = "판정 보류 (C 없음)";
    } else if (C.length < B.length - 2 || (C.sha256Norm !== B.sha256Norm && C.last64 !== B.last64)) {
      판정 = "❌ 주입 실패 (B ≠ C)";
      상세 = 비교상세(B, C);
    } else if (!D || /unreadable/.test(D.note || "")) {
      판정 = "⏸ 판정 보류 (D 읽기 실패)";
    } else if (D.length < C.length - 2 && D.last64 !== C.last64) {
      판정 = "❌ 전송/상태 동기화 문제 (C ≠ D)";
      상세 = 비교상세(C, D);
    } else {
      판정 = "✅ 잘림 없음 (A=B=C=D)";
    }

    const 실패 = 판정.startsWith("❌");
    집계[site] = 집계[site] || { 총: 0, 실패: 0 };
    집계[site].총++;
    if (실패) 집계[site].실패++;
    const 키 = `${site}|${pos}`;
    교차[키] = 교차[키] || { 총: 0, 실패: 0 };
    교차[키].총++;
    if (실패) 교차[키].실패++;

    console.log(
      `  · ${site} (순번 ${pos}) — ${판정}` +
        (접두어길이 > 0 ? ` [접두어 ${접두어길이}자]` : "")
    );
    const 길이표 = [B, C, D]
      .map((r, i) => (r ? `${"BCD"[i]}=${r.length}자` : `${"BCD"[i]}=없음`))
      .join(" / ");
    console.log(`    길이: A=${A.length}자 / ${길이표}`);
    for (const 줄 of 상세) console.log(`    ${줄}`);
  }
}

/** 두 레코드 비교 — 갈림점과 단서 (로그에는 앞뒤 64자만 있으므로 그 범위에서 추정) */
function 비교상세(앞, 뒤) {
  const 줄 = [];
  줄.push(`길이 ${앞.length} → ${뒤.length} (${뒤.length - 앞.length}자)`);
  줄.push(`개행 ${앞.newlineCount} → ${뒤.newlineCount}`);
  const idx = 갈림점(앞.first64, 뒤.first64);
  if (idx >= 0) {
    줄.push(`앞 64자 안에서 갈라짐: 인덱스 ${idx}`);
    줄.push(`  A쪽: …${앞.first64.slice(Math.max(0, idx - 40), idx + 40)}…`);
    줄.push(`  B쪽: …${뒤.first64.slice(Math.max(0, idx - 40), idx + 40)}…`);
    for (const c of 경계단서(앞.first64, idx)) 줄.push(`  단서: ${c}`);
  } else {
    줄.push(`앞부분은 동일 — 뒤쪽이 잘림. 잘린 지점 추정 인덱스: ${뒤.length}`);
    줄.push(`  끝 64자 A쪽: …${앞.last64}`);
    줄.push(`  끝 64자 B쪽: …${뒤.last64}`);
    줄.push(`  단서: 고정 글자 수 후보 ${뒤.length} (다른 전송에서도 같은 값이면 상한선)`);
  }
  if (앞.sha256 !== 뒤.sha256 && 앞.sha256Norm === 뒤.sha256Norm) {
    줄.push("  단서: 정규화 후 동일 — 줄바꿈/공백 변환만 일어남 (잘림 아님)");
  }
  return 줄;
}

console.log("\n══ 집계 ══");
console.log(`전체 전송(사이트 단위): ${전체}`);
for (const [site, v] of Object.entries(집계)) {
  console.log(`  ${site}: ${v.실패}/${v.총} 실패 (${((v.실패 / v.총) * 100).toFixed(0)}%)`);
}
console.log("\n── 사이트 × 순번 교차표 (실패/전체) ──");
const 사이트목록 = [...new Set(Object.keys(교차).map((k) => k.split("|")[0]))];
const 순번목록 = [...new Set(Object.keys(교차).map((k) => k.split("|")[1]))].sort();
console.log(["site".padEnd(10), ...순번목록.map((p) => `순번${p}`)].join("\t"));
for (const s of 사이트목록) {
  console.log(
    [
      s.padEnd(10),
      ...순번목록.map((p) => {
        const v = 교차[`${s}|${p}`];
        return v ? `${v.실패}/${v.총}` : "-";
      }),
    ].join("\t")
  );
}
console.log(
  "\n해석: 실패가 특정 site 행에 몰리면 사이트 고유 문제, 특정 순번 열에 몰리면 순서·타이밍 문제입니다."
);
