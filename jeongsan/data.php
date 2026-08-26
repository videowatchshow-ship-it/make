<?php
/* data.php — 회원별 정산 + 자금장부 저장/불러오기 API
 * 인증 필수 (미인증 시 auth_check 가 401 JSON 반환 후 exit)
 */
require __DIR__ . '/auth_check.php';

/* 캄보디아 시간 기준 (PHP 공식: date_default_timezone_set + date) */
date_default_timezone_set('Asia/Phnom_Penh');
header('Content-Type: application/json; charset=utf-8');

$dir    = '/var/www/sites/chamgyo/settlement-data';
$file   = $dir . '/data.json';
$bakdir = $dir . '/backups';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'err' => 'bad json']); exit;
    }
    /* 낙관적 잠금: 오래된 탭이 최신 데이터를 덮어쓰는 것 차단 */
    $base = $data['base_saved_at'] ?? null;
    unset($data['base_saved_at']);
    if (is_readable($file) && filesize($file) > 0) {
        $cur = json_decode(file_get_contents($file), true);
        $curSaved = is_array($cur) ? ($cur['saved_at'] ?? null) : null;
        if ($curSaved !== null && $base !== $curSaved) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'err' => 'stale',
                'server_saved_at' => $curSaved], JSON_UNESCAPED_UNICODE); exit;
        }
    }
    $now = date('Y-m-d H:i:s');
    $data['saved_at'] = $now;
    $data['saved_by'] = $_SESSION['jsp_user'] ?? '';
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

    /* 원자적 쓰기: 임시파일 → rename (PHP 공식: rename 은 동일 FS 에서 원자적) */
    $tmp = $file . '.' . getmypid() . '.tmp';
    if (file_put_contents($tmp, $json, LOCK_EX) === false || !rename($tmp, $file)) {
        @unlink($tmp);
        http_response_code(500);
        echo json_encode(['ok' => false, 'err' => 'write failed']); exit;
    }

    if (!is_dir($bakdir)) @mkdir($bakdir, 0775, true);
    @file_put_contents($bakdir . '/data-' . date('Ymd-His') . '.json', $json, LOCK_EX);

    echo json_encode(['ok' => true, 'saved_at' => $now, 'tz' => 'Asia/Phnom_Penh']); exit;
}

/* GET */
if (is_readable($file) && filesize($file) > 0) {
    readfile($file);
} else {
    echo json_encode(
        ['members' => [], 'ledger' => [], 'saved_at' => null],
        JSON_UNESCAPED_UNICODE
    );
}
