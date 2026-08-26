<?php
/* udongka-data.php — 일일정산 저장/불러오기 API (인증 필수) */
require __DIR__ . '/auth_check.php';

date_default_timezone_set('Asia/Phnom_Penh');
header('Content-Type: application/json; charset=utf-8');

$dir    = '/var/www/sites/chamgyo/settlement-data';
$file   = $dir . '/udongka.json';
$bakdir = $dir . '/backups';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'err' => 'bad json']); exit;
    }
    $now = date('Y-m-d H:i:s');
    $data['saved_at'] = $now;
    $data['saved_by'] = $_SESSION['jsp_user'] ?? '';
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

    $tmp = $file . '.' . getmypid() . '.tmp';
    if (file_put_contents($tmp, $json, LOCK_EX) === false || !rename($tmp, $file)) {
        @unlink($tmp);
        http_response_code(500);
        echo json_encode(['ok' => false, 'err' => 'write failed']); exit;
    }

    if (!is_dir($bakdir)) @mkdir($bakdir, 0775, true);
    @file_put_contents($bakdir . '/udongka-' . date('Ymd-His') . '.json', $json, LOCK_EX);

    echo json_encode(['ok' => true, 'saved_at' => $now, 'tz' => 'Asia/Phnom_Penh']); exit;
}

if (is_readable($file) && filesize($file) > 0) {
    readfile($file);
} else {
    echo json_encode(['rows' => [], 'fx' => 4000, 'saved_at' => null], JSON_UNESCAPED_UNICODE);
}
