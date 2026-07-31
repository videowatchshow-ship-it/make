<?php
/* auth_check.php — 정산표 세션 확인 공통 include
 * .htaccess 의 auto_prepend_file 로 보호 대상 파일에 자동 포함됨.
 *
 * 참조: https://www.php.net/manual/en/function.session-start.php
 *
 * - 인증 되어 있으면 통과 (그리고 $_SESSION['jsp_user'] 를 사용 가능)
 * - 미인증 & 페이지 요청(GET .html)  → 302 Location: login.php
 * - 미인증 & API 요청(POST 또는 -data.php 계열) → 401 JSON
 * - 로그인 관련 파일 (login.php · login_check.php · logout.php) 은 이 include 대상에서 정규식으로 제외됨.
 */
require_once __DIR__ . '/session_conf.php';
session_start();

if (!isset($_SESSION['jsp_auth']) || $_SESSION['jsp_auth'] !== true) {
    /* API 요청 판별: POST 이거나 파일 이름이 *-data.php 로 끝남 */
    $script = $_SERVER['SCRIPT_NAME'] ?? '';
    $isApi  = ($_SERVER['REQUEST_METHOD'] === 'POST')
           || (bool)preg_match('~(?:^|/)(?:[a-z]+-)?data\.php$~i', $script);

    if ($isApi) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(
            ['ok' => false, 'err' => 'auth_required', 'login' => 'login.php'],
            JSON_UNESCAPED_UNICODE
        );
        exit;
    }

    /* 일반 페이지: 로그인 페이지로 리다이렉트 */
    header('Location: login.php');
    exit;
}

/* 인증 완료 - 세션 잠금 즉시 해제 (동시 요청 직렬화 방지) */
session_write_close();
