<?php
/* auth_check.php — 정산표 세션 확인 + role 게이트
 *
 * - 미인증 + 페이지 요청 → 302 → login.php
 * - 미인증 + API (POST 또는 *-data.php) → 401 JSON
 * - 인증 + role='ro' + POST → 403 JSON (읽기전용 계정은 저장 금지)
 * - 인증 + role='rw' 또는 GET → 통과
 */
require_once __DIR__ . '/session_conf.php';
session_start();

$authed = isset($_SESSION['jsp_auth']) && $_SESSION['jsp_auth'] === true;
$role   = $_SESSION['jsp_role'] ?? 'rw';

$script = $_SERVER['SCRIPT_NAME'] ?? '';
$isApi  = ($_SERVER['REQUEST_METHOD'] === 'POST')
       || (bool)preg_match('~(?:^|/)(?:[a-z]+-)?data\.php$~i', $script);

if (!$authed) {
    if ($isApi) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(
            ['ok' => false, 'err' => 'auth_required', 'login' => 'login.php'],
            JSON_UNESCAPED_UNICODE
        );
        exit;
    }
    header('Location: login.php');
    exit;
}

/* 읽기전용 계정 저장 시도 차단 */
if ($role === 'ro' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(
        ['ok' => false, 'err' => 'readonly', 'msg' => '읽기전용 계정입니다. 저장 불가.'],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

session_write_close();
