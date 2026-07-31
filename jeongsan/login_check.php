<?php
/* login_check.php — POST id·passwd 검증 → 세션 세팅
 * 참조: https://www.php.net/manual/en/function.hash-equals.php (타이밍 안전 비교)
 */
require_once __DIR__ . '/session_conf.php';
session_start();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: login.php'); exit;
}

$id = isset($_POST['id'])     ? trim((string)$_POST['id'])   : '';
$pw = isset($_POST['passwd']) ? (string)$_POST['passwd']     : '';

if ($id === '' || $pw === '') {
    header('Location: login.php?err=empty'); exit;
}

/* 계정 목록 (웹루트 밖) */
$usersFile = '/var/www/sites/chamgyo/settlement-data/jeongsan_users.php';
$users = is_readable($usersFile) ? (require $usersFile) : [];

$entry = $users[$id] ?? null;
$storedPw   = is_array($entry) ? ($entry['pw']   ?? '') : (string)$entry;
$storedRole = is_array($entry) ? ($entry['role'] ?? 'rw') : 'rw';

if ($storedPw === '' || !hash_equals($storedPw, $pw)) {
    usleep(400 * 1000);
    header('Location: login.php?err=bad'); exit;
}

/* 세션 픽세이션 방지 */
session_regenerate_id(true);
$_SESSION['jsp_auth']     = true;
$_SESSION['jsp_user']     = $id;
$_SESSION['jsp_role']     = $storedRole;
$_SESSION['jsp_login_at'] = time();

header('Location: index.html');
exit;
