<?php
// create-manager.php — 서브도메인마다 최초 담당자 계정을 만들 때 한 번만 실행하고 삭제하세요.
//
// 사용법 (CLI):
//   php create-manager.php <username> <display_name>
//   → 비밀번호는 프롬프트로 물어봅니다. 표준입력 미지원 서버라면 아래 stdin 부분 수정.
//
// 실행 후 반드시 이 파일을 웹루트에서 삭제하세요 (`rm create-manager.php`).
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$CFG = require __DIR__ . '/config.php';

$user  = $argv[1] ?? null;
$label = $argv[2] ?? null;
if (!$user || !$label) {
    fwrite(STDERR, "usage: php create-manager.php <username> <display_name>\n");
    exit(1);
}
echo "비밀번호(입력은 화면에 표시되지 않습니다): ";
system('stty -echo');
$pw = trim((string)fgets(STDIN));
system('stty echo');
echo "\n";
if (strlen($pw) < 12) { fwrite(STDERR, "비밀번호는 12자 이상이어야 합니다.\n"); exit(1); }

$dsn = "mysql:host={$CFG['db_host']};dbname={$CFG['db_name']};charset=utf8mb4";
$pdo = new PDO($dsn, $CFG['db_user'], $CFG['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$hash = password_hash($pw, PASSWORD_ARGON2ID);
$stmt = $pdo->prepare('INSERT INTO managers (username, password_hash, display_name) VALUES (?, ?, ?)');
$stmt->execute([$user, $hash, $label]);

echo "✅ 담당자 '{$user}' (id={$pdo->lastInsertId()}) 생성됨.\n";
echo "⚠️  create-manager.php 파일을 지금 웹루트에서 삭제하세요.\n";
