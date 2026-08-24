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
const patchMarker = '/* LOGIN_ISSUE_PATCH_V3 */';
const oldServerMarkers = ['/* LOGIN_ISSUE_PATCH */', '/* LOGIN_ISSUE_PATCH_V2 */'];
const htmlMarker = '/* LOGIN_ISSUE_UI_V8 */';
const oldHtmlMarkers = ['/* LOGIN_ISSUE_UI */', '/* LOGIN_ISSUE_UI_V2 */', '/* LOGIN_ISSUE_UI_V3 */', '/* LOGIN_ISSUE_UI_V4 */', '/* LOGIN_ISSUE_UI_V5 */', '/* LOGIN_ISSUE_UI_V6 */', '/* LOGIN_ISSUE_UI_V7 */'];

const serverSrc = fs.readFileSync(serverPath, 'utf8');
let htmlSrc = fs.readFileSync(htmlPath, 'utf8');

// Strip previous versions of injected style+script so the new blocks
// actually replace the old ones instead of accumulating.
// ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Character_Classes
function reEscape(s) { return s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'); }
for (const oldM of [...oldHtmlMarkers, htmlMarker]) {
  const esc = reEscape(oldM);
  const styleRe = new RegExp('<style>\\s*' + esc + '[\\s\\S]*?</style>\\s*', 'g');
  const scriptRe = new RegExp('<script>\\s*' + esc + '[\\s\\S]*?</script>\\s*', 'g');
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
    '  if (req.path === "/" || req.path.endsWith("/index.html") || req.path.endsWith(".html")) {',
    '    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");',
    '  }',
    '  if (req.method === "OPTIONS") return res.sendStatus(204);',
    '  next();',
    '});',
    'app.patch(' + JSON.stringify(apiPrefix + 'accounts/:email/login-issue') + ', (req, res) => {',
    '  const { type, note, status, actor } = req.body || {};',
    '  const validTypes = ["phone","robot","password","other",null];',
    '  const validStatuses = ["pending","resolved","hold","unknown"];',
    '  const hasType = Object.prototype.hasOwnProperty.call(req.body || {}, "type");',
    '  if (hasType && !validTypes.includes(type)) return res.status(400).json({ ok:false, error:"invalid type" });',
    '  if (status !== undefined && !validStatuses.includes(status)) return res.status(400).json({ ok:false, error:"invalid status" });',
    '  const _fs = require("fs"); const _path = require("path");',
    '  const ACCT = _path.join(__dirname, "accounts.json");',
    '  let data = { accounts: [] };',
    '  try { data = JSON.parse(_fs.readFileSync(ACCT, "utf8")); } catch(e) {}',
    '  const arr = Array.isArray(data) ? data : (data.accounts || []);',
    '  const key = req.params.email.toLowerCase();',
    '  const acct = arr.find(a => (a.email || "").toLowerCase() === key);',
    '  if (!acct) return res.status(404).json({ ok:false, error:"not found" });',
    '  const now = new Date().toISOString();',
    '  if (hasType && type === null) { delete acct.login_issue; }',
    '  else if (hasType) {',
    '    const prev = acct.login_issue || {};',
    '    acct.login_issue = {',
    '      type,',
    '      note: (note||"").toString().slice(0,200),',
    '      marked_at: now,',
    '      status: prev.status || "pending",',
    '      history: Array.isArray(prev.history) ? prev.history.slice(-19) : []',
    '    };',
    '    acct.login_issue.history.push({ at: now, event: "reported", type, note: acct.login_issue.note, actor: (actor||"subsite").toString().slice(0,40) });',
    '  } else if (status !== undefined && acct.login_issue) {',
    '    acct.login_issue.status = status;',
    '    acct.login_issue.status_at = now;',
    '    if (!Array.isArray(acct.login_issue.history)) acct.login_issue.history = [];',
    '    acct.login_issue.history.push({ at: now, event: "status", status, actor: (actor||"gauth").toString().slice(0,40) });',
    '    acct.login_issue.history = acct.login_issue.history.slice(-20);',
    '  }',
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
    '.__li_badge{position:fixed;top:10px;right:14px;z-index:99999;background:#ff6b6b;color:#fff;font-size:12px;font-weight:800;padding:6px 12px;border-radius:14px;box-shadow:0 2px 6px rgba(0,0,0,0.4);font-family:-apple-system,sans-serif;pointer-events:none}',
    '.__li_badge.__zero{background:#3ddc84;color:#0b0d10}',
    '.__li_status{display:inline-block;font-size:10px;padding:2px 6px;border-radius:3px;margin-left:6px;font-weight:700}',
    '.__li_status.pending{background:#3d2f1a;color:#ffb84d}',
    '.__li_status.resolved{background:#1f3a24;color:#3ddc84}',
    '.__li_status.hold{background:#2a2a3d;color:#8a9dff}',
    '.__li_status.unknown{background:#3a2a2a;color:#c9a0a0}',
    '.__li_hist{margin-top:6px;padding:4px 6px;background:#07090c;border-radius:3px;max-height:80px;overflow-y:auto;font-size:10px;color:#8a95a5;font-family:ui-monospace,monospace}',
    '.__li_hist div{padding:1px 0;border-bottom:1px dotted #1a1f26}',
    '.__li_hist div:last-child{border-bottom:none}',
    '</style>',
    '',
  ].join('\n');

  const scriptLines = [
    '<script>' + htmlMarker,
    '(function(){',
    '  var _V = "V6";',
    '  try {',
    '    if (localStorage.getItem("__li_ui_v") !== _V) {',
    '      localStorage.setItem("__li_ui_v", _V);',
    '      if (!location.search.match("_liv=" + _V)) {',
    '        var sep = location.search ? "&" : "?";',
    '        location.replace(location.pathname + location.search + sep + "_liv=" + _V + location.hash);',
    '        return;',
    '      }',
    '    }',
    '  } catch(e){}',
    '  var apiPrefix = ' + JSON.stringify(apiPrefix) + ';',
    '  function esc(s){var d=document.createElement("div");d.textContent=String(s==null?"":s);return d.innerHTML;}',
    '  var STATUS_LABEL = { pending:"보류중", resolved:"해결됨", hold:"보류", unknown:"미확인" };',
    '  function renderStatus(issue) {',
    '    if (!issue || !issue.type) return "";',
    '    var s = issue.status || "pending";',
    '    return \'<span class="__li_status \' + s + \'">\' + (STATUS_LABEL[s] || s) + \'</span>\';',
    '  }',
    '  function renderHistory(issue) {',
    '    if (!issue || !Array.isArray(issue.history) || !issue.history.length) return "";',
    '    var rows = issue.history.slice().reverse().map(function(h){',
    '      var when = (h.at||"").replace("T"," ").slice(0,16);',
    '      var label = h.event === "status" ? ("→ " + (STATUS_LABEL[h.status]||h.status)) : ("▪ " + (h.type||""));',
    '      return \'<div>\' + esc(when) + \' \' + esc(label) + \' <span style="color:#5a6a7a">(\' + esc(h.actor||"") + \')</span></div>\';',
    '    }).join("");',
    '    return \'<div class="__li_hist">\' + rows + \'</div>\';',
    '  }',
    '  function buildPanel(email, issue) {',
    '    issue = issue || {}; var t = issue.type || "";',
    '    var e = esc(email), n = esc(issue.note || "");',
    '    var html = ""',
    '      + \'<div class="__li_panel" data-email="\' + e + \'">\'',
    '      + \'<div class="__li_t">로그인 문제\' + renderStatus(issue) + \'</div>\'',
    '      + \'<label><input type="radio" name="__li_\' + e + \'" value="phone" \' + (t==="phone"?"checked":"") + \'> 지정된 전화 입력</label>\'',
    '      + \'<label><input type="radio" name="__li_\' + e + \'" value="robot" \' + (t==="robot"?"checked":"") + \'> 로봇</label>\'',
    '      + \'<label><input type="radio" name="__li_\' + e + \'" value="password" \' + (t==="password"?"checked":"") + \'> 비밀번호 오류</label>\'',
    '      + \'<label><input type="radio" name="__li_\' + e + \'" value="other" \' + (t==="other"?"checked":"") + \'> 기타</label>\'',
    '      + \'<label style="color:#8a95a5"><input type="radio" name="__li_\' + e + \'" value="" \' + (!t?"checked":"") + \'> 없음</label>\'',
    '      + \'<input type="text" class="__li_note \' + (t==="other"?"show":"") + \'" placeholder="로그인 불편 사항 수동으로 기입해 주세요." value="\' + n + \'">\'',
    '      + \'<div><button type="button" class="__li_save">저장</button><span class="__li_saved"></span></div>\'',
    '      + renderHistory(issue)',
    '      + \'</div>\';',
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
    '  function refreshBadge() {',
    '    fetch(apiPrefix + "login-issues", { cache:"no-store" }).then(function(r){ return r.json(); }).then(function(d){',
    '      var n = (d && d.count) || 0;',
    '      var el = document.getElementById("__li_badge_el");',
    '      if (!el) { el = document.createElement("div"); el.id = "__li_badge_el"; el.className = "__li_badge"; document.body.appendChild(el); }',
    '      el.textContent = "크레임 " + n + "건";',
    '      if (n === 0) el.classList.add("__zero"); else el.classList.remove("__zero");',
    '    }).catch(function(){});',
    '  }',
    '  async function injectAll() {',
    '    var accounts = [];',
    '    try {',
    '      var r = await fetch(apiPrefix + "accounts", { cache:"no-store" });',
    '      var d = await r.json();',
    '      accounts = d.accounts || [];',
    '    } catch(e) { return; }',
    '    refreshBadge();',
    '    var byEmail = {};',
    '    accounts.forEach(function(a){ if (a.email) byEmail[a.email.toLowerCase()] = a; });',
    '    document.querySelectorAll("li,.account-card,.row,.card,.account,.acct,.item,[data-email],[data-account]").forEach(function(el){',
    '      try {',
    '      if (el.classList.contains("__li_panel") || el.closest(".__li_panel")) return;',
    '      var text = el.textContent || "";',
    '      var m = text.match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/);',
    '      if (!m) return;',
    '      var a = byEmail[m[0].toLowerCase()];',
    '      if (!a) return;',
    '      var sig = JSON.stringify(a.login_issue || null);',
    '      var existing = el.querySelector(":scope > .__li_panel");',
    '      if (existing && existing.getAttribute("data-sig") === sig) return;',
    '      if (existing) existing.remove();',
    '      var wrap = document.createElement("div");',
    '      wrap.innerHTML = buildPanel(a.email, a.login_issue);',
    '      var node = wrap.firstElementChild;',
    '      node.setAttribute("data-sig", sig);',
    '      el.appendChild(node);',
    '      if (a.login_issue && a.login_issue.type) el.classList.add("__li_has"); else el.classList.remove("__li_has");',
    '      } catch(err) { /* skip broken card, keep going */ }',
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
    '  var _pending = false, _mo = null, _injecting = false;',
    '  function scheduleInject(muts){',
    '    if (_injecting || _pending) return;',
    '    if (muts && muts.every(function(m){',
    '      var nodes = [].concat([].slice.call(m.addedNodes||[]), [].slice.call(m.removedNodes||[]));',
    '      return nodes.every(function(n){',
    '        return n && n.nodeType === 1 && (n.classList && (n.classList.contains("__li_panel") || n.classList.contains("__li_badge") || n.id === "__li_badge_el") || (n.closest && n.closest(".__li_panel")));',
    '      });',
    '    })) return;',
    '    _pending = true;',
    '    setTimeout(function(){ _pending = false; _injecting = true; try { injectAll(); } finally { _injecting = false; } }, 100);',
    '  }',
    '  function start(){',
    '    _injecting = true; try { injectAll(); } finally { _injecting = false; }',
    '    setInterval(function(){ _injecting = true; try { injectAll(); } finally { _injecting = false; } }, 3000);',
    '    try {',
    '      _mo = new MutationObserver(scheduleInject);',
    '      _mo.observe(document.body, { childList: true, subtree: true });',
    '    } catch(e){}',
    '  }',
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
