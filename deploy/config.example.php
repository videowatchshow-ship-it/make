<?php
// config.example.php  →  각 서브도메인마다 복사해서 config.php 로 이름 바꾸고 값 채우기
// 이 파일은 웹루트 밖 또는 최소한 .htaccess 로 접근 차단하세요.

return [
    // ---- 이 서브도메인이 몇 번인지 ----
    'tenant'      => 1,                // 1..9  (makeid01 이면 1)
    'label'       => '1번 담당',       // 대시보드 헤더에 표시

    // ---- MySQL ----
    'db_host'     => 'localhost',
    'db_name'     => 'cpuser_makeid01_db',   // setup-databases.sh 출력값
    'db_user'     => 'cpuser_makeid01_u',
    'db_pass'     => 'PASTE_FROM_SCRIPT',

    // ---- libsodium 대칭 암호화 키 (32바이트, base64) ----
    // 생성:  php -r "echo sodium_bin2base64(random_bytes(32), SODIUM_BASE64_VARIANT_ORIGINAL);"
    // 아래 값은 예시 — 반드시 새로 만들어서 교체하세요.
    'crypto_key_b64' => 'REPLACE_ME_32B_BASE64==',

    // ---- 세션·CSRF ----
    'session_name' => 'makeidsid',
    'cookie_secure' => true,           // HTTPS 만 사용
    'cookie_samesite' => 'Strict',
    'idle_timeout_min' => 30,

    // ---- 업로드 한도 (엑셀은 offline 툴로 CSV 로 변환 후 올리는 걸 권장) ----
    'max_upload_bytes' => 100 * 1024 * 1024,    // 100 MB
    'max_rows_per_upload' => 200000,
];
