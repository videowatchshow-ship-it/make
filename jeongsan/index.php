<?php
/* index.php — 인증 게이트 wrapper for index.html
 * .htaccess RewriteRule 로 /정산표/index.html 요청이 이 파일로 내부 리라이트 됨.
 */
require __DIR__ . '/auth_check.php';
header('Content-Type: text/html; charset=UTF-8');
readfile(__DIR__ . '/index.html');
