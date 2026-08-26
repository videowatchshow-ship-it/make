<?php
/* udongka.php — 인증 게이트 wrapper for udongka.html */
require __DIR__ . '/auth_check.php';
header('Content-Type: text/html; charset=UTF-8');
readfile(__DIR__ . '/udongka.html');
