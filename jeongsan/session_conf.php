<?php
/* session_conf.php — 정산표 전용 세션 설정 (photo/photo2/photo3 세션과 완전 격리)
 * 참조: https://www.php.net/manual/en/session.configuration.php
 *       https://www.php.net/manual/en/function.session-set-cookie-params.php
 *       https://www.php.net/manual/en/function.session-name.php
 *
 * - session name: JSPSESSID (photo 계열 PHPSESSID 와 이름부터 분리)
 * - save_path:    정산표/data/sessions (다른 사이트 GC 로부터 세션 파일 격리)
 * - cookie path:  /정산표/  (다른 폴더로 세션 쿠키 새어나가지 않음)
 * - lifetime:     1년 (로그아웃 전까지 유지)
 */
$LIFETIME = 31536000;

$sess_dir = __DIR__ . '/data/sessions';
if (!is_dir($sess_dir)) @mkdir($sess_dir, 0700, true);
if (is_writable($sess_dir)) ini_set('session.save_path', $sess_dir);

ini_set('session.gc_maxlifetime', $LIFETIME);
ini_set('session.gc_probability', 1);
ini_set('session.gc_divisor',   100);
ini_set('session.use_strict_mode', 1);

session_name('JSPSESSID');

session_set_cookie_params([
    'lifetime' => $LIFETIME,
    'path'     => '/',
    'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    'httponly' => true,
    'samesite' => 'Lax',
]);
