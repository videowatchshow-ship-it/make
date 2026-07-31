<?php
/* logout.php — 세션 파기 → 로그인 페이지
 * 참조: https://www.php.net/manual/en/function.session-destroy.php
 */
require_once __DIR__ . '/session_conf.php';
session_start();
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(
        session_name(), '', time() - 42000,
        $p['path'], $p['domain'], $p['secure'], $p['httponly']
    );
}
session_destroy();
header('Location: login.php');
exit;
