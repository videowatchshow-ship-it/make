/**
 * Extended parser test: 200 cases covering all edge cases
 * Run: node gauth/parser_test_extended.js
 */

const { analyzeColumns, isEmail, isTotpLike, classifyValue, extractLabelValue, tryVerticalExtract, tryStackedExtract, tryLabelValueExtract } = require('./upload_excels.js');

let pass = 0, fail = 0, total = 0;

function check(id, desc, result, expected) {
  total++;
  const ok = JSON.stringify(result) === JSON.stringify(expected);
  if (ok) { pass++; }
  else { fail++; console.log(`❌ #${id} ${desc}\n   got:      ${JSON.stringify(result)}\n   expected: ${JSON.stringify(expected)}`); }
}

function cols2rows(...columns) {
  const len = Math.max(...columns.map(c => c.length));
  const rows = [];
  for (let r = 0; r < len; r++) {
    rows.push(columns.map(c => c[r] || ''));
  }
  return rows;
}

// ═══════════════════════════════════════════
// SECTION 1: isEmail (20 cases)
// ═══════════════════════════════════════════
check(1, 'gmail', isEmail('test@gmail.com'), true);
check(2, 'yahoo', isEmail('user@yahoo.co.kr'), true);
check(3, 'hotmail', isEmail('name123@hotmail.com'), true);
check(4, 'subdomain', isEmail('admin@mail.example.co.uk'), true);
check(5, 'plus tag', isEmail('user+tag@gmail.com'), true);
check(6, 'dots', isEmail('first.last@domain.com'), true);
check(7, 'underscore', isEmail('my_email@test.org'), true);
check(8, 'hyphen domain', isEmail('user@my-domain.com'), true);
check(9, 'numbers', isEmail('abc123@456.com'), true);
check(10, 'short tld', isEmail('x@y.io'), true);
check(11, 'no @', isEmail('notanemail'), false);
check(12, 'no domain', isEmail('user@'), false);
check(13, 'space', isEmail('user @gmail.com'), false);
check(14, 'double @', isEmail('user@@gmail.com'), false);
check(15, 'TOTP not email', isEmail('JBSWY3DPEHPK3PXP'), false);
check(16, 'password not email', isEmail('myP@ssw0rd!'), false);
check(17, 'URL not email', isEmail('https://example.com'), false);
check(18, 'empty', isEmail(''), false);
check(19, 'null', isEmail(null), false);
check(20, 'number', isEmail(12345), false);

// ═══════════════════════════════════════════
// SECTION 2: isTotpLike (25 cases)
// ═══════════════════════════════════════════
check(21, 'standard base32', isTotpLike('JBSWY3DPEHPK3PXP'), true);
check(22, 'spaced base32', isTotpLike('JBSW Y3DP EHPK 3PXP'), true);
check(23, 'hyphenated', isTotpLike('JBSW-Y3DP-EHPK-3PXP'), true);
check(24, 'long key', isTotpLike('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'), true);
check(25, 'lowercase input', isTotpLike('jbswy3dpehpk3pxp'), true);
check(26, 'mixed case', isTotpLike('JbSwY3DpEhPk3PxP'), true);
check(27, 'with underscores', isTotpLike('JBSW_Y3DP_EHPK_3PXP'), true);
check(28, '32 char key', isTotpLike('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PX'), true);
check(29, '64 char key', isTotpLike('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'), true);
check(30, 'email not totp', isTotpLike('foo@bar.com'), false);
check(31, 'too short', isTotpLike('ABC123'), false);
check(32, 'just numbers', isTotpLike('1234567890123456'), false);
check(33, 'URL', isTotpLike('https://youtube.com/abc'), false);
check(34, 'password with special', isTotpLike('p@ssw0rd!#$%'), false);
check(35, 'empty', isTotpLike(''), false);
check(36, 'null', isTotpLike(null), false);
check(37, 'path like', isTotpLike('/usr/bin/bash'), false);
check(38, 'has parens', isTotpLike('FUNC(ABC)'), false);
check(39, 'has brackets', isTotpLike('LIST[123]'), false);
check(40, 'has colon', isTotpLike('key:JBSWY3DP'), false);
check(41, 'has semicolon', isTotpLike('JBSWY;3DP'), false);
check(42, 'has equals', isTotpLike('JBSWY=3DP='), false);
check(43, 'phone number', isTotpLike('+82-10-1234-5678'), false);
check(44, '15 chars (too short)', isTotpLike('JBSWY3DPEHPK3PX'), false);
check(45, '129+ chars (too long)', isTotpLike('A'.repeat(129)), false);

// ═══════════════════════════════════════════
// SECTION 3: classifyValue (15 cases)
// ═══════════════════════════════════════════
check(46, 'classify email', classifyValue('test@gmail.com'), 'email');
check(47, 'classify totp', classifyValue('JBSWY3DPEHPK3PXP'), 'totp');
check(48, 'classify url', classifyValue('https://youtube.com/abc'), 'url');
check(49, 'classify password', classifyValue('mypassword123'), 'unknown');
check(50, 'classify empty', classifyValue(''), null);
check(51, 'classify null', classifyValue(null), null);
check(52, 'classify korean pw', classifyValue('비밀번호123'), 'unknown');
check(53, 'classify http url', classifyValue('http://example.com'), 'url');
check(54, 'classify youtu.be', classifyValue('youtu.be/abc123'), 'url');
check(55, 'classify complex pw', classifyValue('Tr0ub4dor&3'), 'unknown');
check(56, 'classify spaced totp', classifyValue('JBSW Y3DP EHPK 3PXP'), 'totp');
check(57, 'classify number pw', classifyValue('abc12345'), 'unknown');
check(58, 'classify recovery email', classifyValue('backup@yahoo.com'), 'email');
check(59, 'classify ip addr', classifyValue('192.168.1.1'), 'unknown');
check(60, 'classify domain', classifyValue('example.com'), 'unknown');

// ═══════════════════════════════════════════
// SECTION 4: extractLabelValue (15 cases)
// ═══════════════════════════════════════════
check(61, 'email label EN', extractLabelValue('Email: test@gmail.com')?.field, 'email');
check(62, 'email label value', extractLabelValue('Email: test@gmail.com')?.value, 'test@gmail.com');
check(63, 'pw label EN', extractLabelValue('Password: abc123')?.field, 'password');
check(64, 'pw label KR', extractLabelValue('비밀번호: abc123')?.field, 'password');
check(65, 'totp label', extractLabelValue('TOTP: JBSWY3DP')?.field, 'totp');
check(66, '2fa label', extractLabelValue('2FA: JBSWY3DP')?.field, 'totp');
check(67, 'recovery label', extractLabelValue('Backup: r@y.com')?.field, 'recovery');
check(68, 'youtube label', extractLabelValue('YouTube: https://y.com')?.field, 'youtube');
check(69, 'korean email', extractLabelValue('계정: test@g.com')?.field, 'email');
check(70, 'korean pw', extractLabelValue('비번: abc')?.field, 'password');
check(71, 'korean totp', extractLabelValue('인증: ABC')?.field, 'totp');
check(72, 'korean recovery', extractLabelValue('복구: r@y.com')?.field, 'recovery');
check(73, 'fullwidth colon', extractLabelValue('Email：test@g.com')?.field, 'email');
check(74, 'no label', extractLabelValue('test@gmail.com'), null);
check(75, 'empty', extractLabelValue(''), null);

// ═══════════════════════════════════════════
// SECTION 5: Column analysis - all orderings (20 cases)
// ═══════════════════════════════════════════
const E = ['a@gmail.com','b@gmail.com','c@gmail.com','d@gmail.com','e@gmail.com'];
const P = ['pass1','pass2','pass3','pass4','pass5'];
const T = ['JBSWY3DPEHPK3PXP','NBSWY3DPEHPK3ABC','KRSWY3DPEHPK3DEF','MMSWY3DPEHPK3GHI','LLSWY3DPEHPK3JKL'];
const R = ['r1@yahoo.com','r2@yahoo.com','r3@yahoo.com','r4@yahoo.com','r5@yahoo.com'];
const Y = ['https://youtube.com/a','https://youtube.com/b','https://youtube.com/c','https://youtube.com/d','https://youtube.com/e'];

// all 6 permutations of [E, P, T]
let m;
m = analyzeColumns(cols2rows(E,P,T)); check(76,'EPT e=0',m.email,0); check(77,'EPT p=1',m.password,1); check(78,'EPT t=2',m.totp,2);
m = analyzeColumns(cols2rows(E,T,P)); check(79,'ETP e=0',m.email,0); check(80,'ETP t=1',m.totp,1); check(81,'ETP p=2',m.password,2);
m = analyzeColumns(cols2rows(P,E,T)); check(82,'PET e=1',m.email,1); check(83,'PET p=0',m.password,0); check(84,'PET t=2',m.totp,2);
m = analyzeColumns(cols2rows(P,T,E)); check(85,'PTE e=2',m.email,2); check(86,'PTE p=0',m.password,0); check(87,'PTE t=1',m.totp,1);
m = analyzeColumns(cols2rows(T,E,P)); check(88,'TEP e=1',m.email,1); check(89,'TEP t=0',m.totp,0); check(90,'TEP p=2',m.password,2);
m = analyzeColumns(cols2rows(T,P,E)); check(91,'TPE e=2',m.email,2); check(92,'TPE t=0',m.totp,0); check(93,'TPE p=1',m.password,1);

// with recovery
m = analyzeColumns(cols2rows(E,P,T,R));
check(94,'EPTR recovery=3',m.recovery,3);
check(95,'EPTR email=0',m.email,0);

// ═══════════════════════════════════════════
// SECTION 6: Column analysis - youtube + recovery combos (10 cases)
// ═══════════════════════════════════════════
m = analyzeColumns(cols2rows(Y,E,P,T));
check(96,'YEPT yt=0',m.youtube,0); check(97,'YEPT e=1',m.email,1);
m = analyzeColumns(cols2rows(E,Y,P,T));
check(98,'EYPT yt=1',m.youtube,1); check(99,'EYPT e=0',m.email,0);
m = analyzeColumns(cols2rows(E,P,Y,T));
check(100,'EPYT yt=2',m.youtube,2); check(101,'EPYT t=3',m.totp,3);
m = analyzeColumns(cols2rows(R,E,Y,T,P));
check(102,'REYTP e=0',m.email,0); check(103,'REYTP r=1',m.recovery,1);
check(104,'REYTP yt=2',m.youtube,2); check(105,'REYTP t=3',m.totp,3);

// ═══════════════════════════════════════════
// SECTION 7: Edge cases - empty cols, single row, sparse data (15 cases)
// ═══════════════════════════════════════════
const emptyCol = ['','','','',''];
m = analyzeColumns(cols2rows(E, emptyCol, P));
check(106,'empty col skip e=0',m.email,0); check(107,'empty col skip p=2',m.password,2);
m = analyzeColumns(cols2rows(emptyCol, E, emptyCol, T, P));
check(108,'multi empty e=1',m.email,1); check(109,'multi empty t=3',m.totp,3);

// single row
m = analyzeColumns([['test@gmail.com','pass123','JBSWY3DPEHPK3PXP']]);
check(110,'1 row e=0',m.email,0); check(111,'1 row t=2',m.totp,2);

// 2 rows
m = analyzeColumns([['a@g.com','pw1','JBSWY3DPEHPK3PXP'],['b@g.com','pw2','NBSWY3DPEHPK3ABC']]);
check(112,'2 rows e=0',m.email,0); check(113,'2 rows p=1',m.password,1);

// mixed empty cells
const sparse = [['a@g.com','pw1','JBSWY3DPEHPK3PXP'],['','',''],['c@g.com','pw3','KRSWY3DPEHPK3DEF']];
m = analyzeColumns(sparse);
check(114,'sparse e=0',m.email,0); check(115,'sparse t=2',m.totp,2);

// duplicate values in password column
const dupPw = ['same','same','same','same','same'];
m = analyzeColumns(cols2rows(E, dupPw, T));
check(116,'dup pw e=0',m.email,0); check(117,'dup pw p=1',m.password,1);

// trick: p@ss.wo looks like email but shouldn't steal email col
const trickPw = ['p@ss.wo','p@ss.wo','p@ss.wo','p@ss.wo','p@ss.wo'];
m = analyzeColumns(cols2rows(E, trickPw, T));
check(118,'trick pw email=0',m.email,0);

// 6+ columns
const misc = ['note1','note2','note3','note4','note5'];
m = analyzeColumns(cols2rows(E, P, T, R, Y, misc));
check(119,'6col all mapped', m.email===0 && m.password===1 && m.totp===2 && m.recovery===3 && m.youtube===4, true);
check(120,'6col extra col not mapped', m.extra, undefined);

// ═══════════════════════════════════════════
// SECTION 8: Vertical/stacked layout - single column (20 cases)
// ═══════════════════════════════════════════

// simple stacked: email then password then totp
var vRows = [['a@gmail.com'],['pass123'],['JBSWY3DPEHPK3PXP'],[''],['b@gmail.com'],['pass456'],['NBSWY3DPEHPK3ABC']];
var va = tryStackedExtract(vRows, 1, 'test.xlsx');
check(121,'stacked 1col count', va?.length, 2);
check(122,'stacked 1col email', va?.[0]?.email, 'a@gmail.com');
check(123,'stacked 1col pw', va?.[0]?.password, 'pass123');
check(124,'stacked 1col totp', va?.[0]?.totp_secret, 'JBSWY3DPEHPK3PXP');
check(125,'stacked 1col 2nd email', va?.[1]?.email, 'b@gmail.com');

// stacked: pw before email (pw gets assigned after email found in next account)
vRows = [['a@gmail.com'],['JBSWY3DPEHPK3PXP'],['mypass'],[''],['b@gmail.com'],['otherpass']];
va = tryStackedExtract(vRows, 1, 'test.xlsx');
check(126,'stacked totp-before-pw count', va?.length, 2);
check(127,'stacked a totp', va?.[0]?.totp_secret, 'JBSWY3DPEHPK3PXP');
check(128,'stacked a pw', va?.[0]?.password, 'mypass');
check(129,'stacked b pw', va?.[1]?.password, 'otherpass');

// stacked: no separator (emails back-to-back create new accounts)
vRows = [['a@gmail.com'],['pass1'],['b@gmail.com'],['pass2'],['c@gmail.com'],['pass3']];
va = tryStackedExtract(vRows, 1, 'test.xlsx');
check(130,'no-sep stacked count', va?.length, 3);
check(131,'no-sep 1st', va?.[0]?.email, 'a@gmail.com');
check(132,'no-sep 3rd', va?.[2]?.email, 'c@gmail.com');

// stacked with youtube URL
vRows = [['a@gmail.com'],['pass1'],['JBSWY3DPEHPK3PXP'],['https://youtube.com/chan']];
va = tryStackedExtract(vRows, 1, 'test.xlsx');
check(133,'stacked yt', va?.[0]?.youtube_url, 'https://youtube.com/chan');

// stacked with recovery email (blank-line-grouped)
vRows = [[''],['a@gmail.com'],['pass1'],['backup@yahoo.com']];
va = tryStackedExtract(vRows, 1, 'test.xlsx');
check(134,'stacked recovery', va?.[0]?.recovery_email, 'backup@yahoo.com');

// stacked 2 columns
vRows = [['a@gmail.com','pass1'],['JBSWY3DPEHPK3PXP',''],[''],['b@gmail.com','pass2']];
va = tryStackedExtract(vRows, 2, 'test.xlsx');
check(135,'stacked 2col count', va?.length, 2);
check(136,'stacked 2col email', va?.[0]?.email, 'a@gmail.com');
check(137,'stacked 2col pw', va?.[0]?.password, 'pass1');
check(138,'stacked 2col totp', va?.[0]?.totp_secret, 'JBSWY3DPEHPK3PXP');

// only email + password stacked
vRows = [['x@gmail.com'],['mypass']];
va = tryStackedExtract(vRows, 1, 'test.xlsx');
check(139,'stacked email+pw only', va?.[0]?.email, 'x@gmail.com');
check(140,'stacked email+pw pw', va?.[0]?.password, 'mypass');

// ═══════════════════════════════════════════
// SECTION 9: Label-value pair layout (20 cases)
// ═══════════════════════════════════════════

// 2-col label-value
vRows = [['Email','a@gmail.com'],['Password','pass123'],['TOTP','JBSWY3DPEHPK3PXP'],[''],['Email','b@gmail.com'],['Password','pass456']];
va = tryLabelValueExtract(vRows, 2, 'test.xlsx');
check(141,'lv 2col count', va?.length, 2);
check(142,'lv 2col email', va?.[0]?.email, 'a@gmail.com');
check(143,'lv 2col pw', va?.[0]?.password, 'pass123');
check(144,'lv 2col totp', va?.[0]?.totp_secret, 'JBSWY3DPEHPK3PXP');

// single-col label:value
vRows = [['Email: a@gmail.com'],['Password: pass123'],['2FA: JBSWY3DPEHPK3PXP'],[''],['Email: b@gmail.com'],['Password: pass456']];
va = tryLabelValueExtract(vRows, 1, 'test.xlsx');
check(145,'lv 1col count', va?.length, 2);
check(146,'lv 1col email', va?.[0]?.email, 'a@gmail.com');
check(147,'lv 1col pw', va?.[0]?.password, 'pass123');
check(148,'lv 1col totp', va?.[0]?.totp_secret, 'JBSWY3DPEHPK3PXP');

// korean labels
vRows = [['계정: a@gmail.com'],['비밀번호: pass1'],['인증: JBSWY3DPEHPK3PXP'],['복구: r@yahoo.com']];
va = tryLabelValueExtract(vRows, 1, 'test.xlsx');
check(149,'lv korean email', va?.[0]?.email, 'a@gmail.com');
check(150,'lv korean pw', va?.[0]?.password, 'pass1');
check(151,'lv korean totp', va?.[0]?.totp_secret, 'JBSWY3DPEHPK3PXP');
check(152,'lv korean recovery', va?.[0]?.recovery_email, 'r@yahoo.com');

// mixed colon styles
vRows = [['Email：a@gmail.com'],['PW: pass1']];
va = tryLabelValueExtract(vRows, 1, 'test.xlsx');
check(153,'lv fullwidth colon', va?.[0]?.email, 'a@gmail.com');
check(154,'lv PW label', va?.[0]?.password, 'pass1');

// 2-col label (no colon) + value
vRows = [['email','a@gmail.com'],['password','pass1'],['totp','JBSWY3DPEHPK3PXP']];
va = tryLabelValueExtract(vRows, 2, 'test.xlsx');
check(155,'lv no-colon label', va?.[0]?.email, 'a@gmail.com');
check(156,'lv no-colon pw', va?.[0]?.password, 'pass1');

// youtube label
vRows = [['Email: a@gmail.com'],['Password: pw'],['YouTube: https://youtube.com/ch']];
va = tryLabelValueExtract(vRows, 1, 'test.xlsx');
check(157,'lv youtube', va?.[0]?.youtube_url, 'https://youtube.com/ch');

// multiple accounts with labels no blank line separator
vRows = [['Email: a@gmail.com'],['Password: pw1'],['Email: b@gmail.com'],['Password: pw2']];
va = tryLabelValueExtract(vRows, 1, 'test.xlsx');
check(158,'lv no-gap multi count', va?.length, 2);
check(159,'lv no-gap 2nd', va?.[1]?.email, 'b@gmail.com');
check(160,'lv no-gap 2nd pw', va?.[1]?.password, 'pw2');

// ═══════════════════════════════════════════
// SECTION 10: tryVerticalExtract integration (15 cases)
// ═══════════════════════════════════════════

// should detect label-value first
vRows = [['Email: a@gmail.com'],['Password: pw1'],['TOTP: JBSWY3DPEHPK3PXP']];
va = tryVerticalExtract(vRows, 'test.xlsx');
check(161,'vertical lv pref count', va?.length, 1);
check(162,'vertical lv pref email', va?.[0]?.email, 'a@gmail.com');

// should fallback to stacked
vRows = [['a@gmail.com'],['pw1'],['JBSWY3DPEHPK3PXP']];
va = tryVerticalExtract(vRows, 'test.xlsx');
check(163,'vertical stacked fallback', va?.length, 1);
check(164,'vertical stacked email', va?.[0]?.email, 'a@gmail.com');
check(165,'vertical stacked pw', va?.[0]?.password, 'pw1');

// should return null for wide tables (>3 cols)
va = tryVerticalExtract([['a@g.com','pw','totp','extra']], 'test.xlsx');
check(166,'vertical null for wide', va, null);

// 3 col with stacked data
vRows = [['a@gmail.com','pw1','JBSWY3DPEHPK3PXP'],[''],['b@gmail.com','pw2','NBSWY3DPEHPK3ABC']];
va = tryVerticalExtract(vRows, 'test.xlsx');
// 3 cols → should use vertical if detected, but also could use horizontal
// tryVerticalExtract only runs for maxCols<=3, which includes this
check(167,'3col vertical count', va !== null, true);

// empty sheet
va = tryVerticalExtract([], 'test.xlsx');
check(168,'vertical empty', va, null);

// only passwords (no email) → should return null
vRows = [['pw1'],['pw2'],['pw3']];
va = tryVerticalExtract(vRows, 'test.xlsx');
check(169,'vertical no email', va, null);

// single account minimal
vRows = [['test@gmail.com'],['mypassword']];
va = tryVerticalExtract(vRows, 'test.xlsx');
check(170,'vertical minimal', va?.[0]?.email, 'test@gmail.com');

// ═══════════════════════════════════════════
// SECTION 11: Real-world scenarios (30 cases)
// ═══════════════════════════════════════════

// Scenario: someone puts email then password then 2FA in consecutive rows with no headers
vRows = [
  ['john@gmail.com'],['johnpass123'],['JBSWY3DPEHPK3PXP'],
  [''],
  ['mary@gmail.com'],['marypass'],['NBSWY3DPEHPK3ABC'],
  [''],
  ['kim@naver.com'],['kimpass!'],['KRSWY3DPEHPK3DEF'],
];
va = tryVerticalExtract(vRows, 'real.xlsx');
check(171,'real stacked 3 accounts', va?.length, 3);
check(172,'real stacked john email', va?.[0]?.email, 'john@gmail.com');
check(173,'real stacked john pw', va?.[0]?.password, 'johnpass123');
check(174,'real stacked john totp', va?.[0]?.totp_secret, 'JBSWY3DPEHPK3PXP');
check(175,'real stacked kim email', va?.[2]?.email, 'kim@naver.com');

// Scenario: password first, then email, then totp (columns)
const pwFirst = cols2rows(P, E, T);
m = analyzeColumns(pwFirst);
check(176,'pw-first col e=1', m.email, 1);
check(177,'pw-first col p=0', m.password, 0);
check(178,'pw-first col t=2', m.totp, 2);

// Scenario: totp-only with email (no password)
m = analyzeColumns(cols2rows(E, T));
check(179,'email+totp only e=0', m.email, 0);
check(180,'email+totp only t=1', m.totp, 1);

// Scenario: email only
m = analyzeColumns(cols2rows(E));
check(181,'email-only e=0', m.email, 0);
check(182,'email-only no pw', m.password, undefined);

// Scenario: 10 accounts with varying data completeness
const bigE = Array.from({length:10}, (_,i) => `user${i}@gmail.com`);
const bigP = Array.from({length:10}, (_,i) => `pass${i}`);
const bigT = Array.from({length:10}, () => 'JBSWY3DPEHPK3PXP');
const bigRows = cols2rows(bigE, bigP, bigT);
m = analyzeColumns(bigRows);
check(183,'10 row e=0', m.email, 0);
check(184,'10 row p=1', m.password, 1);
check(185,'10 row t=2', m.totp, 2);

// Scenario: spaced TOTP keys in column
const spacedT = ['JBSW Y3DP EHPK 3PXP','NBSW Y3DP EHPK 3ABC','KRSW Y3DP EHPK 3DEF','MMSW Y3DP EHPK 3GHI','LLSW Y3DP EHPK 3JKL'];
m = analyzeColumns(cols2rows(E, P, spacedT));
check(186,'spaced totp col t=2', m.totp, 2);

// Scenario: hyphenated TOTP keys
const hyphenT = ['JBSW-Y3DP-EHPK-3PXP','NBSW-Y3DP-EHPK-3ABC','KRSW-Y3DP-EHPK-3DEF','MMSW-Y3DP-EHPK-3GHI','LLSW-Y3DP-EHPK-3JKL'];
m = analyzeColumns(cols2rows(E, P, hyphenT));
check(187,'hyphen totp col t=2', m.totp, 2);

// Scenario: some rows have missing totp
const partialT = ['JBSWY3DPEHPK3PXP','','KRSWY3DPEHPK3DEF','','LLSWY3DPEHPK3JKL'];
m = analyzeColumns(cols2rows(E, P, partialT));
check(188,'partial totp still detected t=2', m.totp, 2);

// Scenario: very long passwords that look like random strings
const longPw = ['aB3$kL9#mN2@pQ5&','xY7!wZ4^tU8*rS1%','cD6+eF3=gH0-jK2(','lM5)nO8_qR1~sT4`','uV7<wX0>yZ3,aB6.'];
m = analyzeColumns(cols2rows(E, longPw, T));
check(189,'long pw not confused e=0', m.email, 0);
check(190,'long pw not confused t=2', m.totp, 2);

// Scenario: recovery + youtube + all fields in different order
m = analyzeColumns(cols2rows(Y, R, T, P, E));
check(191,'all-reversed email is first email col', m.email, 1);
check(192,'all-reversed has totp', m.totp !== undefined, true);
check(193,'all-reversed has yt', m.youtube !== undefined, true);

// Scenario: label-value with extra whitespace
vRows = [['  Email :  a@gmail.com  '],['  Password :  pw1  '],['  TOTP :  JBSWY3DPEHPK3PXP  ']];
va = tryVerticalExtract(vRows, 'test.xlsx');
check(194,'lv whitespace email', va?.[0]?.email, 'a@gmail.com');
check(195,'lv whitespace pw', va?.[0]?.password, 'pw1');

// Scenario: stacked with URL between accounts
vRows = [['a@gmail.com'],['pw1'],['https://youtube.com/a'],[''],['b@gmail.com'],['pw2']];
va = tryStackedExtract(vRows, 1, 'test.xlsx');
check(196,'stacked with url', va?.[0]?.youtube_url, 'https://youtube.com/a');
check(197,'stacked with url 2nd', va?.[1]?.email, 'b@gmail.com');

// Scenario: email + recovery stacked (blank-line-grouped, second email = recovery)
vRows = [[''],['main@gmail.com'],['pw1'],['backup@yahoo.com']];
va = tryStackedExtract(vRows, 1, 'test.xlsx');
check(198,'stacked dual email recovery', va?.[0]?.recovery_email, 'backup@yahoo.com');

// Scenario: stacked all fields
vRows = [['test@gmail.com'],['mypass'],['JBSWY3DPEHPK3PXP'],['recov@yahoo.com'],['https://youtube.com/ch']];
va = tryStackedExtract(vRows, 1, 'test.xlsx');
check(199,'stacked all fields', va?.[0]?.email, 'test@gmail.com');
check(200,'stacked all fields pw', va?.[0]?.password, 'mypass');

// ═══════════════════════════════════════════
console.log(`\n${'='.repeat(40)}`);
console.log(`결과: ${pass}/${total} 통과, ${fail}/${total} 실패`);
if (fail === 0) console.log('✅ 전체 통과');
else console.log('❌ 실패 항목 있음');
process.exit(fail > 0 ? 1 : 0);
