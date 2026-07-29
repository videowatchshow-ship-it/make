/**
 * 30-case parser verification
 * Run: node gauth/parser_test.js
 */

const { analyzeColumns, isEmail, isTotpLike } = require('./upload_excels.js');

let pass = 0, fail = 0;

function check(id, desc, result, expected) {
  const ok = JSON.stringify(result) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`✅ #${id} ${desc}`); }
  else { fail++; console.log(`❌ #${id} ${desc}\n   got:      ${JSON.stringify(result)}\n   expected: ${JSON.stringify(expected)}`); }
}

// Helper: build rows from column arrays
function cols2rows(...columns) {
  const len = Math.max(...columns.map(c => c.length));
  const rows = [];
  for (let r = 0; r < len; r++) {
    rows.push(columns.map(c => c[r] || ''));
  }
  return rows;
}

// ═══════════════════════════════════════════
// SECTION 1: isEmail 판별 (5개)
// ═══════════════════════════════════════════
check(1, 'isEmail: 일반 지메일', isEmail('zahrasiakoohi4751@gmail.com'), true);
check(2, 'isEmail: 복구 이메일', isEmail('backup_acct@yahoo.com'), true);
check(3, 'isEmail: TOTP를 이메일로 오판 안함', isEmail('JBSW Y3DP EHPK 3PXP'), false);
check(4, 'isEmail: 비밀번호를 이메일로 오판 안함', isEmail('myP@ssw0rd!'), false);
check(5, 'isEmail: URL을 이메일로 오판 안함', isEmail('https://youtube.com/channel/abc'), false);

// ═══════════════════════════════════════════
// SECTION 2: isTotpLike 판별 (5개)
// ═══════════════════════════════════════════
check(6, 'isTotpLike: 공백 구분 Base32', isTotpLike('JBSW Y3DP EHPK 3PXP'), true);
check(7, 'isTotpLike: 하이픈 구분 Base32', isTotpLike('JBSW-Y3DP-EHPK-3PXP'), true);
check(8, 'isTotpLike: 연속 Base32', isTotpLike('JBSWY3DPEHPK3PXP'), true);
check(9, 'isTotpLike: 이메일은 TOTP 아님', isTotpLike('foo@bar.com'), false);
check(10, 'isTotpLike: 짧은 문자열은 TOTP 아님', isTotpLike('abc123'), false);

// ═══════════════════════════════════════════
// SECTION 3: 컬럼 분석 - 기본 순서 (이메일,비번,TOTP) (5개)
// ═══════════════════════════════════════════

const emailCol = ['a@gmail.com','b@gmail.com','c@gmail.com','d@gmail.com','e@gmail.com'];
const pwCol = ['pass1','pass2','pass3','pass4','pass5'];
const totpCol = ['JBSWY3DPEHPK3PXP','NBSWY3DPEHPK3ABC','KRSWY3DPEHPK3DEF','MMSWY3DPEHPK3GHI','LLSWY3DPEHPK3JKL'];
const recovCol = ['r1@yahoo.com','r2@yahoo.com','r3@yahoo.com','r4@yahoo.com','r5@yahoo.com'];
const ytCol = ['https://youtube.com/a','https://youtube.com/b','https://youtube.com/c','https://youtube.com/d','https://youtube.com/e'];

// 순서: email, pw, totp
const rows11 = cols2rows(emailCol, pwCol, totpCol);
const m11 = analyzeColumns(rows11);
check(11, '순서 [email,pw,totp] → email=0', m11.email, 0);
check(12, '순서 [email,pw,totp] → password=1', m11.password, 1);
check(13, '순서 [email,pw,totp] → totp=2', m11.totp, 2);

// 순서 뒤집기: totp, pw, email
const rows14 = cols2rows(totpCol, pwCol, emailCol);
const m14 = analyzeColumns(rows14);
check(14, '순서 [totp,pw,email] → email=2', m14.email, 2);
check(15, '순서 [totp,pw,email] → totp=0', m14.totp, 0);

// ═══════════════════════════════════════════
// SECTION 4: 컬럼 분석 - 복구이메일 구분 (5개)
// ═══════════════════════════════════════════

// email, recovery, pw → recovery가 email과 혼동되면 안됨
const rows16 = cols2rows(emailCol, recovCol, pwCol);
const m16 = analyzeColumns(rows16);
check(16, '[email,recovery,pw] → email=0', m16.email, 0);
check(17, '[email,recovery,pw] → recovery=1', m16.recovery, 1);
check(18, '[email,recovery,pw] → password=2', m16.password, 2);

// recovery, email, totp, pw — 둘 다 100% 이메일이면 앞쪽이 메인
const rows19 = cols2rows(recovCol, emailCol, totpCol, pwCol);
const m19 = analyzeColumns(rows19);
check(19, '[recov,email,totp,pw] → email=0 (앞쪽이 메인)', m19.email, 0);
check(20, '[recov,email,totp,pw] → recovery=1', m19.recovery, 1);

// ═══════════════════════════════════════════
// SECTION 5: 컬럼 분석 - URL/유튜브 (3개)
// ═══════════════════════════════════════════

const rows21 = cols2rows(emailCol, pwCol, totpCol, ytCol);
const m21 = analyzeColumns(rows21);
check(21, '[email,pw,totp,yt] → youtube=3', m21.youtube, 3);

const rows22 = cols2rows(ytCol, emailCol, pwCol);
const m22 = analyzeColumns(rows22);
check(22, '[yt,email,pw] → youtube=0', m22.youtube, 0);
check(23, '[yt,email,pw] → email=1', m22.email, 1);

// ═══════════════════════════════════════════
// SECTION 6: 엣지케이스 (4개)
// ═══════════════════════════════════════════

// 빈 컬럼이 섞여있을 때
const emptyCol = ['','','','',''];
const rows24 = cols2rows(emailCol, emptyCol, pwCol, totpCol);
const m24 = analyzeColumns(rows24);
check(24, '빈 컬럼 건너뛰기 → email=0, pw=2', m24.email === 0 && m24.password === 2, true);

// 5컬럼 전부: email, pw, totp, recovery, youtube
const rows25 = cols2rows(emailCol, pwCol, totpCol, recovCol, ytCol);
const m25 = analyzeColumns(rows25);
check(25, '5컬럼 전부 매핑', m25.email === 0 && m25.totp === 2 && m25.recovery === 3 && m25.youtube === 4, true);

// 비밀번호가 이메일처럼 생겼을 때 (p@ss 등) → 비밀번호를 이메일로 오판 안해야
const trickPwCol = ['p@ss.wo','p@ss.wo','p@ss.wo','p@ss.wo','p@ss.wo'];
const rows26 = cols2rows(emailCol, trickPwCol, totpCol);
const m26 = analyzeColumns(rows26);
check(26, 'p@ss.wo를 이메일로 오판 안함 → email=0', m26.email, 0);

// 데이터가 1행만 있을 때
const rows27 = [['test@gmail.com', 'mypass', 'JBSWY3DPEHPK3PXP']];
const m27 = analyzeColumns(rows27);
check(27, '1행만 있어도 email 감지', m27.email, 0);

// ═══════════════════════════════════════════
// SECTION 7: 실전 시나리오 (3개)
// ═══════════════════════════════════════════

// 실전: pw, email, totp, recovery (사람마다 다른 순서)
const rows28 = cols2rows(pwCol, emailCol, totpCol, recovCol);
const m28 = analyzeColumns(rows28);
check(28, '실전 [pw,email,totp,recov] 전부 정확',
  m28.email === 1 && m28.password === 0 && m28.totp === 2 && m28.recovery === 3, true);

// 실전: email, totp, pw (TOTP가 비번 앞에 옴)
const rows29 = cols2rows(emailCol, totpCol, pwCol);
const m29 = analyzeColumns(rows29);
check(29, '실전 [email,totp,pw] TOTP≠비번 혼동 없음',
  m29.email === 0 && m29.totp === 1 && m29.password === 2, true);

// 실전: recovery, totp, pw, email (완전 역순) — 둘 다 100% 이메일이면 앞쪽이 메인
const rows30 = cols2rows(recovCol, totpCol, pwCol, emailCol);
const m30 = analyzeColumns(rows30);
check(30, '실전 완전 역순도 정확',
  m30.email === 0 && m30.recovery === 3 && m30.totp === 1 && m30.password === 2, true);

// ═══════════════════════════════════════════
console.log(`\n${'='.repeat(40)}`);
console.log(`결과: ${pass}/30 통과, ${fail}/30 실패`);
if (fail === 0) console.log('✅ 전체 통과');
else console.log('❌ 실패 항목 있음');
process.exit(fail > 0 ? 1 : 0);
