<?php
// admin.php — 단일 파일 어드민 (로그인 / 목록 / 업로드 / 삭제 / 로그아웃)
// - 라우팅은 ?action=... 쿼리로만
// - DB 는 서브도메인마다 완전 분리 (config.php 참조)
// - 스타일은 GitHub Docs / Primer 라이트 톤 (원본 CSS, CDN 0개)
declare(strict_types=1);

$CFG = require __DIR__ . '/config.php';

// ---------- 세션 ----------
session_name($CFG['session_name']);
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'secure'   => (bool)$CFG['cookie_secure'],
    'httponly' => true,
    'samesite' => $CFG['cookie_samesite'],
]);
session_start();

if (!empty($_SESSION['manager_id'])) {
    $idleSec = (int)$CFG['idle_timeout_min'] * 60;
    if (!empty($_SESSION['last_seen']) && time() - $_SESSION['last_seen'] > $idleSec) {
        $_SESSION = []; session_destroy();
    } else {
        $_SESSION['last_seen'] = time();
    }
}

// ---------- 헬퍼 ----------
function h(?string $s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function bad_request(string $msg): void { http_response_code(400); echo h($msg); exit; }
function forbidden(): void { http_response_code(403); echo 'forbidden'; exit; }
function json_out($v): void { header('Content-Type: application/json; charset=utf-8'); echo json_encode($v, JSON_UNESCAPED_UNICODE); exit; }

function pdo(array $CFG): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . $CFG['db_host'] . ';dbname=' . $CFG['db_name'] . ';charset=utf8mb4';
        $pdo = new PDO($dsn, $CFG['db_user'], $CFG['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}

function crypto_key(array $CFG): string {
    $k = sodium_base642bin($CFG['crypto_key_b64'], SODIUM_BASE64_VARIANT_ORIGINAL);
    if (strlen($k) !== SODIUM_CRYPTO_SECRETBOX_KEYBYTES) {
        throw new RuntimeException('crypto_key_b64 must decode to 32 bytes');
    }
    return $k;
}
function enc(?string $plain, string $key): ?string {
    if ($plain === null || $plain === '') return null;
    $n = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    return $n . sodium_crypto_secretbox($plain, $n, $key);
}
function dec(?string $blob, string $key): ?string {
    if ($blob === null || $blob === '') return null;
    $n = substr($blob, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    $c = substr($blob, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    $p = sodium_crypto_secretbox_open($c, $n, $key);
    return $p === false ? null : $p;
}

function csrf_token(): string {
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}
function csrf_check(): void {
    $t = (string)($_POST['csrf'] ?? '');
    if (!hash_equals((string)($_SESSION['csrf'] ?? ''), $t)) forbidden();
}

function require_login(): int {
    if (empty($_SESSION['manager_id'])) {
        header('Location: ?action=login'); exit;
    }
    return (int)$_SESSION['manager_id'];
}

function audit(array $CFG, ?int $mid, string $action, ?string $detail = null): void {
    try {
        $stmt = pdo($CFG)->prepare('INSERT INTO audit_log (manager_id, action, detail, ip) VALUES (?, ?, ?, ?)');
        $stmt->execute([$mid, $action, $detail, $_SERVER['REMOTE_ADDR'] ?? null]);
    } catch (Throwable $e) { /* 감사 로그가 실패해도 서비스는 계속 */ }
}

// ---------- 라우팅 ----------
$action = (string)($_GET['action'] ?? 'dashboard');

try {
    switch ($action) {
        case 'login':      handle_login($CFG); break;
        case 'logout':     handle_logout(); break;
        case 'dashboard':  handle_dashboard($CFG); break;
        case 'api_list':   handle_api_list($CFG); break;
        case 'api_upload': handle_api_upload($CFG); break;
        case 'api_delete': handle_api_delete($CFG); break;
        default: http_response_code(404); echo 'not found';
    }
} catch (Throwable $e) {
    // 프로덕션은 error_log 로만; 화면엔 요약만
    error_log('[admin.php] ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    http_response_code(500);
    echo 'internal error';
}

// ---------- 페이지: 로그인 ----------
function handle_login(array $CFG): void {
    if (!empty($_SESSION['manager_id']) && $_SERVER['REQUEST_METHOD'] === 'GET') {
        header('Location: ?action=dashboard'); return;
    }
    $err = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        csrf_check();
        $u = (string)($_POST['username'] ?? '');
        $p = (string)($_POST['password'] ?? '');
        $stmt = pdo($CFG)->prepare('SELECT id, password_hash, display_name FROM managers WHERE username = ? LIMIT 1');
        $stmt->execute([$u]);
        $row = $stmt->fetch();
        if ($row && password_verify($p, $row['password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['manager_id']   = (int)$row['id'];
            $_SESSION['display_name'] = $row['display_name'];
            $_SESSION['last_seen']    = time();
            pdo($CFG)->prepare('UPDATE managers SET last_login = NOW() WHERE id = ?')->execute([$row['id']]);
            audit($CFG, (int)$row['id'], 'login');
            header('Location: ?action=dashboard'); return;
        }
        // 실패해도 타이밍 노출 방지용 짧은 지연
        usleep(random_int(200000, 500000));
        $err = '아이디 또는 비밀번호가 맞지 않습니다.';
        audit($CFG, null, 'login_fail', $u);
    }
    render_layout($CFG, 'login', ['err' => $err]);
}

function handle_logout(): void {
    $mid = $_SESSION['manager_id'] ?? null;
    $_SESSION = []; session_destroy();
    if ($mid) audit($GLOBALS['CFG'] ?? [], (int)$mid, 'logout');
    header('Location: ?action=login');
}

// ---------- 페이지: 대시보드 ----------
function handle_dashboard(array $CFG): void {
    require_login();
    render_layout($CFG, 'dashboard', []);
}

// ---------- API: 목록 ----------
function handle_api_list(array $CFG): void {
    require_login();
    $q = trim((string)($_GET['q'] ?? ''));
    $limit  = min(max((int)($_GET['limit']  ?? 100), 1), 500);
    $offset = max((int)($_GET['offset'] ?? 0), 0);

    $where = '1=1'; $params = [];
    if ($q !== '') {
        $where .= ' AND (email LIKE :q OR notes LIKE :q OR login_url LIKE :q)';
        $params[':q'] = '%' . $q . '%';
    }

    $sql = "SELECT id, email, year, month, login_url, notes, source_file, created_at
              FROM accounts WHERE $where
              ORDER BY IFNULL(year,0), IFNULL(month,0), id
              LIMIT $limit OFFSET $offset";
    $stmt = pdo($CFG)->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $countSql = "SELECT COUNT(*) FROM accounts WHERE $where";
    $countStmt = pdo($CFG)->prepare($countSql);
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    json_out(['total' => $total, 'rows' => $rows]);
}

// ---------- API: 업로드 (JSON POST) ----------
// 브라우저에서 xlsx/csv 를 파싱해 accounts 배열로 만들어 POST 함.
function handle_api_upload(array $CFG): void {
    $mid = require_login();
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') bad_request('POST only');
    if (($_SERVER['CONTENT_LENGTH'] ?? 0) > $CFG['max_upload_bytes']) bad_request('too large');

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true, 8);
    if (!is_array($data) || !isset($data['csrf'], $data['filename'], $data['rows'])) bad_request('bad body');
    if (!hash_equals((string)($_SESSION['csrf'] ?? ''), (string)$data['csrf'])) forbidden();
    $rows = $data['rows'];
    if (count($rows) > $CFG['max_rows_per_upload']) bad_request('too many rows');

    $key = crypto_key($CFG);
    $pdo = pdo($CFG);
    $pdo->beginTransaction();
    $ins = $pdo->prepare(
        'INSERT INTO accounts (email, password_enc, totp_secret_enc, year, month, login_url, notes, source_file)
         VALUES (:email, :pw, :tot, :y, :m, :u, :n, :src)
         ON DUPLICATE KEY UPDATE
           password_enc = VALUES(password_enc),
           totp_secret_enc = VALUES(totp_secret_enc),
           year = VALUES(year), month = VALUES(month),
           login_url = VALUES(login_url), notes = VALUES(notes),
           source_file = VALUES(source_file),
           updated_at = CURRENT_TIMESTAMP'
    );

    $count = 0;
    foreach ($rows as $r) {
        $email = trim((string)($r['email'] ?? ''));
        if ($email === '') continue;
        $ins->execute([
            ':email' => $email,
            ':pw'    => enc((string)($r['password'] ?? ''), $key),
            ':tot'   => enc((string)($r['twofa']    ?? ''), $key),
            ':y'     => is_numeric($r['year']  ?? null) ? (int)$r['year']  : null,
            ':m'     => is_numeric($r['month'] ?? null) ? (int)$r['month'] : null,
            ':u'     => (string)($r['url']   ?? 'https://accounts.google.com'),
            ':n'     => (string)($r['notes'] ?? ''),
            ':src'   => (string)($data['filename']),
        ]);
        $count++;
    }

    $bStmt = $pdo->prepare('INSERT INTO upload_batches (manager_id, filename, row_count) VALUES (?, ?, ?)');
    $bStmt->execute([$mid, $data['filename'], $count]);

    $pdo->commit();
    audit($CFG, $mid, 'upload', $data['filename'] . ' rows=' . $count);
    json_out(['ok' => true, 'inserted_or_updated' => $count]);
}

// ---------- API: 삭제 ----------
function handle_api_delete(array $CFG): void {
    $mid = require_login();
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') bad_request('POST only');
    csrf_check();
    $id = (int)($_POST['id'] ?? 0);
    if ($id < 1) bad_request('bad id');
    $stmt = pdo($CFG)->prepare('DELETE FROM accounts WHERE id = ?');
    $stmt->execute([$id]);
    audit($CFG, $mid, 'delete', 'id=' . $id);
    json_out(['ok' => true, 'deleted' => $stmt->rowCount()]);
}

// ---------- 렌더 ----------
function render_layout(array $CFG, string $page, array $ctx): void {
    $csrf = csrf_token();
    $label = h($CFG['label']);
    $displayName = h($_SESSION['display_name'] ?? '');
    ?><!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>makeid<?= h(sprintf('%02d', (int)$CFG['tenant'])) ?> · <?= $label ?></title>
<style>
  :root {
    --fg-default:#1f2328; --fg-muted:#59636e; --canvas-default:#ffffff;
    --canvas-subtle:#f6f8fa; --border-default:#d0d7de; --border-muted:#d8dee4;
    --accent-fg:#0969da; --accent-emphasis:#0969da; --success-fg:#1a7f37;
    --danger-fg:#cf222e;
    --font-mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace;
    --font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans","Apple SD Gothic Neo",sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root { --fg-default:#e6edf3; --fg-muted:#8b949e; --canvas-default:#0d1117;
      --canvas-subtle:#161b22; --border-default:#30363d; --border-muted:#21262d;
      --accent-fg:#2f81f7; --accent-emphasis:#2f81f7; --success-fg:#3fb950;
      --danger-fg:#f85149; }
  }
  * { box-sizing: border-box; }
  body { margin:0; font-family: var(--font-sans); color: var(--fg-default);
    background: var(--canvas-default); font-size:14px; line-height:1.5; }
  header { border-bottom:1px solid var(--border-default); background:var(--canvas-subtle);
    padding:14px 24px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
  header h1 { margin:0; font-size:18px; font-weight:600; }
  header .who { color: var(--fg-muted); font-size:13px; }
  header a { color: var(--accent-fg); text-decoration:none; }
  main { max-width: 1200px; margin: 0 auto; padding: 24px; }
  .badge { display:inline-block; padding:0 7px; border-radius:12px; background: var(--canvas-subtle);
    border:1px solid var(--border-default); color: var(--fg-muted); font-size:11px; }
  .toolbar { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; align-items:center; }
  input[type=search], input[type=text], input[type=password] {
    padding:5px 12px; border:1px solid var(--border-default); border-radius:6px;
    background: var(--canvas-default); color: var(--fg-default); font-size:14px; }
  input:focus { outline:none; border-color: var(--accent-emphasis); box-shadow:0 0 0 3px rgba(9,105,218,.3); }
  button, .btn {
    padding:5px 12px; border:1px solid var(--border-default); border-radius:6px;
    background: var(--canvas-subtle); color: var(--fg-default); font-size:14px;
    font-family: var(--font-sans); cursor:pointer; }
  button.primary { background: var(--accent-emphasis); border-color: transparent; color:#fff; }
  button.danger  { background: transparent; border-color: var(--danger-fg); color: var(--danger-fg); }
  button:hover { border-color: var(--accent-emphasis); }
  table { width:100%; border-collapse: collapse; border:1px solid var(--border-default);
    border-radius:6px; overflow:hidden; }
  th,td { padding:8px 12px; border-bottom:1px solid var(--border-muted); text-align:left; vertical-align:top; }
  th { background: var(--canvas-subtle); font-weight:600; font-size:12px;
    text-transform: uppercase; letter-spacing:.03em; color: var(--fg-muted); }
  tbody tr:last-child td { border-bottom:none; }
  tbody tr:hover { background: var(--canvas-subtle); }
  .mono { font-family: var(--font-mono); font-size:12px; }
  .card { border:1px solid var(--border-default); border-radius:6px; padding:24px; max-width: 380px; margin: 60px auto; }
  .card h2 { margin:0 0 16px; font-size:20px; }
  .card label { display:block; margin: 12px 0 4px; font-size:12px; color: var(--fg-muted); }
  .card input { width:100%; }
  .err { color: var(--danger-fg); font-size:13px; margin-top: 8px; }
  .drop { border: 2px dashed var(--border-default); padding: 24px; text-align:center; border-radius:8px;
    margin: 16px 0; color: var(--fg-muted); }
  .drop.drag { background: var(--canvas-subtle); border-color: var(--accent-emphasis); color: var(--accent-fg); }
  #toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
    background:#1f2328; color:#fff; padding: 10px 16px; border-radius:6px; opacity:0;
    pointer-events:none; transition: opacity .2s; z-index:10; }
  #toast.show { opacity:1; }
  #toast.err  { background: var(--danger-fg); }
  #toast.ok   { background: var(--success-fg); }
  footer { color: var(--fg-muted); font-size:12px; text-align:center; padding: 32px; }
</style>
</head>
<body>
    <?php if ($page === 'login'): ?>
        <main>
          <form class="card" method="POST" action="?action=login" autocomplete="off">
            <h2>🔐 makeid<?= h(sprintf('%02d', (int)$CFG['tenant'])) ?> 로그인</h2>
            <div class="badge"><?= $label ?></div>
            <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
            <label>아이디</label>
            <input type="text" name="username" required autocomplete="username">
            <label>비밀번호</label>
            <input type="password" name="password" required autocomplete="current-password">
            <div style="margin-top:16px"><button class="primary" type="submit">로그인</button></div>
            <?php if (!empty($ctx['err'])): ?><div class="err"><?= h($ctx['err']) ?></div><?php endif ?>
          </form>
        </main>
    <?php else: ?>
        <header>
          <h1>🔐 makeid<?= h(sprintf('%02d', (int)$CFG['tenant'])) ?> <span class="badge"><?= $label ?></span></h1>
          <div class="who">
            <?= $displayName ?> · <a href="?action=logout">로그아웃</a>
          </div>
        </header>
        <main>
          <div class="toolbar">
            <input type="search" id="q" placeholder="이메일·URL·메모 검색…" style="min-width:280px" autocomplete="off">
            <span id="cnt" class="badge">-</span>
            <button id="uploadBtn" class="primary">📤 엑셀/CSV 업로드</button>
          </div>
          <div class="drop" id="drop">
            이 영역에 <b>.xlsx</b> 또는 <b>.csv</b> 를 드래그하세요. 브라우저에서 파싱한 뒤 서버로 전송합니다.
            <input id="fileInput" type="file" accept=".xlsx,.xls,.csv" hidden>
          </div>
          <table>
            <thead><tr>
              <th>#</th><th>이메일</th><th>가입일</th><th>URL</th><th>메모</th><th>출처</th><th></th>
            </tr></thead>
            <tbody id="tb"><tr><td colspan="7" style="text-align:center;color:var(--fg-muted);padding:24px">로딩 중…</td></tr></tbody>
          </table>
          <footer>DB 완전 분리 · tenant <?= (int)$CFG['tenant'] ?> · <?= date('Y-m-d H:i') ?></footer>
        </main>
        <div id="toast"></div>
        <script src="xlsx.min.js"></script>
        <script>
          const CSRF = <?= json_encode($csrf) ?>;
          const $ = (id) => document.getElementById(id);
          function toast(msg, cls='ok') {
            const el = $('toast'); el.textContent = msg; el.className = 'show ' + cls;
            clearTimeout(toast._t); toast._t = setTimeout(()=> el.className='', 2500);
          }
          async function load(q='') {
            const url = '?action=api_list' + (q ? '&q=' + encodeURIComponent(q) : '');
            const r = await fetch(url); const data = await r.json();
            $('cnt').textContent = data.rows.length + ' / ' + data.total;
            $('tb').innerHTML = data.rows.length === 0
              ? '<tr><td colspan="7" style="text-align:center;color:var(--fg-muted);padding:24px">데이터 없음</td></tr>'
              : data.rows.map((r,i) => {
                  const esc = (s)=>String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
                  const date = (r.year || r.month) ? esc(r.year||'?')+'-'+String(r.month||'?').padStart(2,'0') : '<span style="color:var(--fg-muted)">—</span>';
                  const url = r.login_url ? '<a href="'+esc(r.login_url)+'" target="_blank" rel="noopener">링크</a>' : '';
                  return '<tr><td>'+(i+1)+'</td><td class="mono">'+esc(r.email)+'</td><td>'+date+'</td><td>'+url+'</td><td>'+esc(r.notes)+'</td><td><span class="badge">'+esc(r.source_file)+'</span></td>'+
                         '<td><button class="danger" data-id="'+r.id+'">삭제</button></td></tr>';
                }).join('');
          }
          $('q').addEventListener('input', (e)=>load(e.target.value));
          document.addEventListener('click', async (e)=>{
            const b = e.target.closest('button.danger'); if(!b) return;
            if (!confirm('이 계정을 삭제할까요?')) return;
            const fd = new FormData(); fd.append('csrf', CSRF); fd.append('id', b.dataset.id);
            const r = await fetch('?action=api_delete', {method:'POST', body: fd});
            const j = await r.json();
            if (j.ok) { toast('삭제됨'); load($('q').value); } else toast('삭제 실패','err');
          });

          // 업로드: 브라우저에서 파싱 → JSON POST
          const drop = $('drop'), fi = $('fileInput');
          $('uploadBtn').addEventListener('click', ()=>fi.click());
          drop.addEventListener('click', ()=>fi.click());
          drop.addEventListener('dragover', e=>{e.preventDefault(); drop.classList.add('drag');});
          drop.addEventListener('dragleave', ()=>drop.classList.remove('drag'));
          drop.addEventListener('drop', e=>{e.preventDefault(); drop.classList.remove('drag'); handleFile(e.dataTransfer.files[0]);});
          fi.addEventListener('change', e=>handleFile(e.target.files[0]));

          const ALIAS = {
            email:['email','e-mail','mail','id','이메일','아이디','계정'],
            password:['password','passwd','pass','pw','pwd','비밀번호','패스워드','비번'],
            twofa:['2fa','totp','otp','secret','2단계','시크릿','2차'],
            year:['year','yyyy','년','연도'],
            month:['month','mm','월'],
            url:['loginurl','url','login','link','주소','로그인주소'],
            notes:['notes','note','memo','remark','메모','비고'],
          };
          const norm = (s)=>String(s??'').toLowerCase().replace(/[\s_\-.\/]/g,'');
          function pick(row, field) {
            const wanted = ALIAS[field].map(norm);
            for (const k of Object.keys(row)) if (wanted.includes(norm(k))) return row[k];
            return '';
          }
          async function handleFile(f) {
            if (!f) return;
            try {
              let rows;
              if (/\.csv$/i.test(f.name)) {
                const t = await f.text();
                const wb = XLSX.read(t, {type:'string'});
                rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
              } else {
                const buf = await f.arrayBuffer();
                const wb = XLSX.read(new Uint8Array(buf), {type:'array'});
                rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
              }
              const norm_rows = rows.map(r => ({
                email: String(pick(r,'email')).trim(),
                password: String(pick(r,'password')).trim(),
                twofa: String(pick(r,'twofa')).replace(/\s+/g,''),
                year: parseInt(pick(r,'year'),10) || null,
                month: parseInt(pick(r,'month'),10) || null,
                url: String(pick(r,'url')||'https://accounts.google.com').trim(),
                notes: String(pick(r,'notes')).trim(),
              })).filter(r=>r.email);
              if (!norm_rows.length) { toast('email 컬럼을 못 찾았습니다','err'); return; }
              toast(norm_rows.length + '행 업로드 중…');
              const res = await fetch('?action=api_upload', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify({csrf: CSRF, filename: f.name, rows: norm_rows}),
              });
              const j = await res.json();
              if (j.ok) { toast(j.inserted_or_updated + '건 반영'); load($('q').value); }
              else toast('업로드 실패','err');
            } catch (e) { console.error(e); toast('파싱 실패: '+e.message,'err'); }
          }
          load();
        <\/script>
    <?php endif ?>
</body>
</html><?php
}
