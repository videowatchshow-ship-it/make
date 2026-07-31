<?php
require_once __DIR__ . '/session_conf.php';
session_start();

/* 이미 로그인 되어 있으면 index 로 */
if (isset($_SESSION['jsp_auth']) && $_SESSION['jsp_auth'] === true) {
    header('Location: index.html');
    exit;
}

$err = isset($_GET['err']) ? $_GET['err'] : '';
?><!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>정산표 로그인</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    background: #0f1115; color: #e7e9ee;
  }
  .box {
    width: 320px; padding: 28px 26px; border: 1px solid #232936;
    border-radius: 14px; background: #12151c;
  }
  h1 { font-size: 18px; margin: 0 0 4px; text-align: center; }
  .sub { font-size: 12.5px; color: #9aa0ac; margin: 0 0 18px; text-align: center; }
  label { display: block; font-size: 12px; color: #9aa0ac; margin: 10px 0 6px; }
  input {
    width: 100%; padding: 10px 12px; border: 1px solid #2a2f3a;
    border-radius: 8px; background: #0f1115; color: #e7e9ee;
    font-size: 14px; outline: none;
  }
  input:focus { border-color: #2563eb; }
  button {
    width: 100%; margin-top: 18px; padding: 11px;
    border: none; border-radius: 8px; background: #2563eb; color: #fff;
    font-size: 14px; font-weight: 700; cursor: pointer;
  }
  button:hover { background: #1d4ed8; }
  .err {
    margin-top: 12px; font-size: 12.5px; color: #f87171;
    text-align: center; min-height: 16px;
  }
  .accounts {
    margin-top: 18px; padding-top: 14px; border-top: 1px solid #232936;
    font-size: 11.5px; color: #6b7280; text-align: center; line-height: 1.6;
  }
</style>
</head>
<body>
  <form class="box" method="post" action="login_check.php" autocomplete="off">
    <h1>정산표 로그인</h1>
    <p class="sub">참교육 정산 시스템 · 팀 전용</p>
    <label for="id">아이디</label>
    <input type="text" id="id" name="id" required autofocus maxlength="20">
    <label for="passwd">비밀번호</label>
    <input type="password" id="passwd" name="passwd" required maxlength="40">
    <button type="submit">L O G I N</button>
    <div class="err"><?= $err === 'bad' ? '아이디 또는 비밀번호가 올바르지 않습니다.' : ($err === 'empty' ? '아이디와 비밀번호를 입력하세요.' : '') ?></div>
    <div class="accounts">사용 계정: cent · jay · tak · jump · 대표</div>
  </form>
</body>
</html>
