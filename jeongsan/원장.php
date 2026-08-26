<?php
/* 원장.php — 인증 게이트 wrapper for 원장.html */
require __DIR__ . '/auth_check.php';
header('Content-Type: text/html; charset=UTF-8');
readfile(__DIR__ . '/원장.html');
