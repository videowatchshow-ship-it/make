/* Idempotent patcher that injects a login-issue feature into a subsite's
   server.js and public/index.html. Env: SITE, DIR.
   Markers guard against duplicate application.
   ref: https://nodejs.org/api/fs.html
   ref: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS */
const fs = require('fs');
const path = require('path');

const SITE = process.env.SITE;
const DIR = process.env.DIR;
if (!SITE || !DIR) { console.error('Missing SITE or DIR'); process.exit(2); }

const apiPrefix = '/api/' + SITE + '/';
const serverPath = path.join(DIR, 'server.js');
const htmlPath = path.join(DIR, 'public', 'index.html');
const patchMarker = '/* LOGIN_ISSUE_PATCH */';
const htmlMarker = '/* LOGIN_ISSUE_UI_V5 */';
const oldHtmlMarkers = ['/* LOGIN_ISSUE_UI */', '/* LOGIN_ISSUE_UI_V2 */', '/* LOGIN_ISSUE_UI_V3 */', '/* LOGIN_ISSUE_UI_V4 */'];

const serverSrc = fs.readFileSync(serverPath, 'utf8');
let htmlSrc = fs.readFileSync(htmlPath, 'utf8');

// Strip previous versions of injected style+script so the new widened
// selector actually replaces the old one instead of being skipped.
for (const oldM of oldHtmlMarkers) {
  const styleRe = new RegExp('<style>\\s*' + oldM.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '[\\s\\S]*?</style>\\s*', 'g');
  const scriptRe = new RegExp('<script>\\s*' + oldM.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '[\\s\\S]*?</script>\\s*', 'g');
  htmlSrc = htmlSrc.replace(styleRe, '').replace(scriptRe, '');
}

// ---------- server.js ----------
if (serverSrc.includes(patchMarker)) {
  console.log('  [' + SITE + '] server.js already patched');
} else {
  const injection = [
    '',
    patchMarker,
    'app.use((req, res, next) => {',
    '  res.setHeader("Access-Control-Allow-Origin", "*");',
    '  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");',
    '  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");',
    '  if (req.method === "OPTIONS") return res.sendStatus(204);',
    '  next();',
    '});',
    'app.patch(' + JSON.stringify(apiPrefix + 'accounts/:email/login-issue') + ', (req, res) => {',
    '  const { type, note } = req.body || {};',
    '  const validTypes = ["phone","robot","password","other",null];',
    '  if (!validTypes.includes(type)) return res.status(400).json({ ok:false, error:"invalid type" });',
    '  const _fs = require("fs"); const _path = require("path");',
    '  const ACCT = _path.join(__dirname, "accounts.json");',
    '  let data = { accounts: [] };',
    '  try { data = JSON.parse(_fs.readFileSync(ACCT, "utf8")); } catch(e) {}',
    '  const arr = Array.isArray(data) ? data : (data.accounts || []);',
    '  const key = req.params.email.toLowerCase();',
    '  const acct = arr.find(a => (a.email || "").toLowerCase() === key);',
    '  if (!acct) return res.status(404).json({ ok:false, error:"not found" });',
    '  if (type === null) { delete acct.login_issue; }',
    '  else { acct.login_issue = { type, note: (note||"").toString().slice(0,200), marked_at: new Date().toISOString() }; }',
    '  const tmp = ACCT + ".tmp." + process.pid + "." + Date.now();',
    '  _fs.writeFileSync(tmp, JSON.stringify(Array.isArray(data) ? arr : { accounts: arr }, null, 2));',
    '  _fs.renameSync(tmp, ACCT);',
    '  res.json({ ok:true, login_issue: acct.login_issue || null });',
    '});',
    'app.get(' + JSON.stringify(apiPrefix + 'login-issues') + ', (req, res) => {',
    '  const _fs = require("fs"); const _path = require("path");',
    '  const ACCT = _path.join(__dirname, "accounts.json");',
    '  let data = { accounts: [] };',
    '  try { data = JSON.parse(_fs.readFileSync(ACCT, "utf8")); } catch(e) {}',
    '  const arr = Array.isArray(data) ? data : (data.accounts || []);',
    '  const issues = arr.filter(a => a.login_issue && a.login_issue.type).map(a => ({',
    '    email:a.email, name:a.name||"", channel_title:a.channel_title||"",',
    '    login_issue:a.login_issue, site: ' + JSON.stringify(SITE),
    '  }));',
    '  res.json({ site: ' + JSON.stringify(SITE) + ', count:issues.length, issues });',
    '});',
    '',
  ].join('\n');

  let newServer = serverSrc;

  // Ensure express.json() body-parser is registered.
  if (!/express\.json\s*\(/.test(newServer)) {
    newServer = newServer.replace(
      /(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/,
      '$1\napp.use(require("express").json());'
    );
  }

  // Insert before the FIRST app.listen(
  const listenIdx = newServer.search(/app\.listen\s*\(/);
  if (listenIdx > 0) {
    newServer = newServer.slice(0, listenIdx) + injection + '\n' + newServer.slice(listenIdx);
  } else {
    newServer = newServer + '\n' + injection + '\napp.listen(process.env.PORT || 3000, () => console.log("[' + SITE + '] listening"));\n';
  }

  fs.writeFileSync(serverPath, newServer);
  console.log('  [' + SITE + '] server.js patched (+' + (newServer.length - serverSrc.length) + ' bytes)');
}

// ---------- public/index.html ----------
if (htmlSrc.includes(htmlMarker)) {
  console.log('  [' + SITE + '] index.html already patched');
} else {
  const style = [
    '<style>' + htmlMarker,
    '.__li_panel{border:1px solid #2a323c;border-radius:8px;padding:8px 10px;margin-top:6px;background:#0d1218;font-size:12px}',
    '.__li_panel .__li_t{color:#8a95a5;font-size:11px;margin-bottom:4px;font-weight:600}',
    '.__li_panel label{display:inline-flex;align-items:center;gap:4px;margin-right:8px;color:#e8ecef;cursor:pointer}',
    '.__li_panel input[type=text]{background:#0d1218;border:1px solid #22282f;color:#e8ecef;padding:3px 6px;border-radius:4px;font-size:11px;margin-top:4px;width:100%;display:none}',
    '.__li_panel input[type=text]::placeholder{color:rgba(232,236,239,0.45);opacity:1}',
    '.__li_panel input[type=text]::-webkit-input-placeholder{color:rgba(232,236,239,0.45)}',
    '.__li_panel input[type=text].show{display:block}',
    '.__li_panel .__li_saved{color:#3ddc84;font-size:10px;margin-left:6px}',
    '.__li_panel button.__li_save{background:#2b6cff;color:#fff;border:none;padding:5px 12px;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;margin-top:6px}',
    '.__li_panel button.__li_save:hover{background:#3d7cff}',
    '.__li_panel button.__li_save:disabled{background:#3d4550;cursor:not-allowed}',
    '.__li_has{border:1px solid #ff6b6b !important}',
    '</style>',
    '',
  ].join('\n');

  const scriptLines = [
    '<script>' + htmlMarker,
    '(function(){',
    '  var apiPrefix = ' + JSON.stringify(apiPrefix) + ';',
    '  function esc(s){var d=document.createElement("div");d.textContent=String(s==null?"":s);return d.innerHTML;}',
    '  function buildPanel(email, issue) {',
    '    issue = issue || {}; var t = issue.type || "";',
    '    var e = esc(email), n = esc(issue.note || "");',
    '    var html = ""',
    '      + \'<div class="__li_panel" data-email="\' + e + \'">\'',
    '      + \'<div class="__li_t">로그인 문제</div>\'',
    '      + \'<label><input type="radio" name="__li_\' + e + \'" value="phone" \' + (t==="phone"?"checked":"") + \'> 지정된 전화 입력</label>\'',
    '      + \'<label><input type="radio" name="__li_\' + e + \'" value="robot" \' + (t==="robot"?"checked":"") + \'> 로봇</label>\'',
    '      + \'<label><input type="radio" name="__li_\' + e + \'" value="password" \' + (t==="password"?"checked":"") + \'> 비밀번호 오류</label>\'',
    '      + \'<label><input type="radio" name="__li_\' + e + \'" value="other" \' + (t==="other"?"checked":"") + \'> 기타</label>\'',
    '      + \'<label style="color:#8a95a5"><input type="radio" name="__li_\' + e + \'" value="" \' + (!t?"checked":"") + \'> 없음</label>\'',
    '      + \'<input type="text" class="__li_note \' + (t==="other"?"show":"") + \'" placeholder="로그인 불편 사항 수동으로 기입해 주세요." value="\' + n + \'">\'',
    '      + \'<div><button type="button" class="__li_save">저장</button><span class="__li_saved"></span></div></div>\';',
    '    return html;',
    '  }',
    '  async function save(panel) {',
    '    var email = panel.getAttribute("data-email");',
    '    var noteEl = panel.querySelector("input[type=text]");',
    '    var savedEl = panel.querySelector(".__li_saved");',
    '    var checked = panel.querySelector("input[type=radio]:checked");',
    '    var type = checked && checked.value ? checked.value : null;',
    '    if (type === "other") noteEl.classList.add("show"); else noteEl.classList.remove("show");',
    '    try {',
    '      var r = await fetch(apiPrefix + "accounts/" + encodeURIComponent(email) + "/login-issue", {',
    '        method:"PATCH", headers:{"Content-Type":"application/json"},',
    '        body: JSON.stringify({ type: type, note: type === "other" ? (noteEl.value||"") : "" })',
    '      });',
    '      var d = await r.json();',
    '      if (d.ok) {',
    '        savedEl.textContent = "저장됨";',
    '        var card = panel.closest("li,.account-card,.row") || panel.parentElement;',
    '        if (card) { if (type) card.classList.add("__li_has"); else card.classList.remove("__li_has"); }',
    '        setTimeout(function(){ savedEl.textContent = ""; }, 1500);',
    '      } else { savedEl.textContent = "오류:" + (d.error||""); }',
    '    } catch(e) { savedEl.textContent = "오류:" + e.message; }',
    '  }',
    '  async function injectAll() {',
    '    var accounts = [];',
    '    try {',
    '      var r = await fetch(apiPrefix + "accounts", { cache:"no-store" });',
    '      var d = await r.json();',
    '      accounts = d.accounts || [];',
    '    } catch(e) { return; }',
    '    var byEmail = {};',
    '    accounts.forEach(function(a){ if (a.email) byEmail[a.email.toLowerCase()] = a; });',
    '    document.querySelectorAll("li,.account-card,.row,.card,.account,.acct,.item,[data-email],[data-account]").forEach(function(el){',
    '      if (el.querySelector(".__li_panel")) return;',
    '      var text = el.textContent || "";',
    '      var m = text.match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/);',
    '      if (!m) return;',
    '      var a = byEmail[m[0].toLowerCase()];',
    '      if (!a) return;',
    '      var wrap = document.createElement("div");',
    '      wrap.innerHTML = buildPanel(a.email, a.login_issue);',
    '      el.appendChild(wrap.firstElementChild);',
    '      if (a.login_issue && a.login_issue.type) el.classList.add("__li_has");',
    '    });',
    '    document.querySelectorAll(".__li_panel input[type=radio]").forEach(function(inp){',
    '      if (inp.__li_wired) return; inp.__li_wired = true;',
    '      inp.addEventListener("change", function(){',
    '        var panel = inp.closest(".__li_panel");',
    '        var noteEl = panel.querySelector("input[type=text]");',
    '        if (inp.value === "other") noteEl.classList.add("show"); else noteEl.classList.remove("show");',
    '      });',
    '    });',
    '    document.querySelectorAll(".__li_panel button.__li_save").forEach(function(btn){',
    '      if (btn.__li_wired) return; btn.__li_wired = true;',
    '      btn.addEventListener("click", function(){ save(btn.closest(".__li_panel")); });',
    '    });',
    '  }',
    '  function start(){ injectAll(); setInterval(injectAll, 5000); }',
    '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);',
    '  else start();',
    '})();',
    '</script>',
    '',
  ];
  const script = scriptLines.join('\n');

  let newHtml = htmlSrc;
  if (newHtml.includes('</body>')) newHtml = newHtml.replace('</body>', style + script + '</body>');
  else newHtml = newHtml + style + script;

  fs.writeFileSync(htmlPath, newHtml);
  console.log('  [' + SITE + '] index.html patched (+' + (newHtml.length - htmlSrc.length) + ' bytes)');
}
