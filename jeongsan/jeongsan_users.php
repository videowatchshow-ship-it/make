<?php
/* 정산표 로그인 계정
 * 배포 위치: /var/www/sites/chamgyo/settlement-data/jeongsan_users.php  (웹루트 밖 · 600)
 *
 * 형식: 'id' => ['pw' => '비번', 'role' => 'rw'|'ro']
 *   rw = 읽기+쓰기 (저장 가능)
 *   ro = 읽기전용 (저장 시 403)
 */
return [
    'cent'    => ['pw' => '1147', 'role' => 'rw'],
    'ha'      => ['pw' => '0830', 'role' => 'rw'],
    'tak'     => ['pw' => '7272', 'role' => 'rw'],
    'jay'     => ['pw' => '8282', 'role' => 'rw'],
    '점프대표' => ['pw' => '1147', 'role' => 'ro'],
];
