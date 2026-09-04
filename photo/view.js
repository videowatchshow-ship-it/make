/* view.js — 원본(캄보디아빈 CAW/CAH) 화면 공용 로직
   - ?ch=<계정>            : 계정별 설정(api_settings.php) + 선택 테이블(api_selected_room.php)
   - 채널A(table_num) / 채널B(table2_num) 가 설정돼 있으면 그 번호(성천지 xtd 테이블) 그림장 사용
   - 설정 없으면 select.html 에서 선택한 테이블 사용
   - 성천지(xtd_)  → gs.xtd6688.com luzhu iframe (원본과 동일)
   - 싱지(sj_)     → 자체 출목표 렌더(bgl.js)
   - 포추나(fd_)   → 원본 페이지 임베드 */
;(function () {
  'use strict';
  // 루트 별칭(/CAW_1.php 등)으로 열려도 <base href="/photo/"> 기준으로 API·데이터 경로 계산
  const BASE = new URL(document.baseURI).pathname.replace(/[^\/]*$/, '');
  const q = new URLSearchParams(location.search);
  const acc = q.get('ch') || '01';
  const XTD_MAP = {"10":10,"11":11,"12":12,"15":15,"16":16,"17":87,"18":18,"19":89,"20":20,"21":21,"22":22,"23":23,"25":25,"26":26,"27":27,"55":31,"66":32,"77":33,"88":34,"99":35};

  let settings = null, roomKey = null, lastSrc = null, lastSig = null;

  function luzhuUrl(tableId, lang) {
    return `https://gs.xtd6688.com/luzhu/${lang === 'zh' ? 'zh' : 'en'}/pc.html?tableId=${tableId}`;
  }

  function applyTexts(s, count) {
    const box = document.getElementById('texts'); if (!box) return;
    box.innerHTML = '';
    let n = 0;
    for (const i of ['01', '02', '03', '04']) {
      if (n >= count) break;
      if (s['write_check' + i] !== 'N' && (s['write_text' + i] || '').trim()) {
        const d = document.createElement('div'); d.className = 'text_box_text' + i; d.textContent = s['write_text' + i]; box.appendChild(d); n++;
      }
    }
  }

  function applyBanners(s) {
    // 원본: 카톡배너 N → "배너 기본"(images/Live_*_banner*.gif) 항상 표시, Y → 계정 업로드 배너(메신저) 표시. 배너 영역은 항상 보임.
    function pick(el, custom) {
      if (!el) return;
      if (!el.dataset.def) el.dataset.def = el.getAttribute('src');
      const want = (s.kakao === 'Y' && custom) ? BASE + custom : el.dataset.def;
      if (el.getAttribute('src') !== want) el.src = want;
    }
    pick(document.getElementById('banner_w'), s.banner_width);
    pick(document.getElementById('banner_h'), (document.body.dataset.theme === 'gold' && s.banner_height2) ? s.banner_height2 : s.banner_height);   // 세로2 는 세로2 배너 우선
    const kb = document.getElementById('kakao_banner'); if (kb) kb.style.display = '';
  }

  function tickClock() {
    const el = document.getElementById('ktime'); if (!el) return;
    if (!settings || settings.ktime !== 'Y') { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const d = new Date(Date.now() + (7 * 60 - d0()) * 60000); // 캄보디아(UTC+7) 시각
    el.textContent = d.toTimeString().slice(0, 8);
  }
  function d0() { return -new Date().getTimezoneOffset(); }

  function showXtd(tableId, lang) {
    const src = luzhuUrl(tableId, lang);
    if (src !== lastSrc) { document.querySelectorAll('iframe.lz').forEach(f => { f.src = src; }); lastSrc = src; }
    document.querySelectorAll('[data-xtd]').forEach(e => { e.style.display = ''; });
    const w = document.getElementById('bgl-wrap'); if (w) w.style.display = 'none';
    const r = document.getElementById('bgl-room'); if (r) r.textContent = '';
  }

  // Next.P / Next.B 신호: 원본 zou_base 问路 결과(대안·소로·소강 다음 색)를 페이지 안에서 직접 렌더 (확대 크롭 → 흐림·칸 어긋남 제거)
  let lastNx = null;
  async function renderNext(key) {
    const P = document.getElementById('nx-p'), B = document.getElementById('nx-b');
    if (!P || !B || !window.LUZHU) return;
    try {
      const r = await fetch(`${BASE}data/room_${key}.json?_=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json(); const sig = key + ':' + (d.nums || []).join('');
      if (sig === lastNx) return; lastNx = sig;
      const W = window.LUZHU.compute(window.LUZHU.toOrg(d.nums || [])).wenlu;
      const ic = side => ['dayan', 'xiaolu', 'xiaoqiang'].map(k => `<i class="${k} ${W[side][k].color}"></i>`).join('');
      B.innerHTML = ic('red'); P.innerHTML = ic('blue');
    } catch (_) {}
  }

  function showLuzhu(key, theme) {
    const src = `${BASE}luzhu.html?room=${key}${theme ? '&theme=' + theme : ''}`;
    if (src !== lastSrc) { document.querySelectorAll('iframe.lz').forEach(f => { f.src = src; }); lastSrc = src; lastNx = null; }
    renderNext(key);
    document.querySelectorAll('[data-xtd]').forEach(e => { e.style.display = ''; });
    const w = document.getElementById('bgl-wrap'); if (w) w.style.display = 'none';
    const r = document.getElementById('bgl-room'); if (r) r.textContent = '';
  }

  async function showBgl(key) {
    document.querySelectorAll('[data-xtd]').forEach(e => { e.style.display = 'none'; });
    const w = document.getElementById('bgl-wrap');
    if (w) { w.style.display = 'flex'; if (w.dataset.url) { delete w.dataset.url; w.innerHTML = '<div class="bgl-road"></div>'; lastSig = null; } }
    try {
      const r = await fetch(`${BASE}data/room_${key}.json?_=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const sig = key + ':' + (d.nums || []).join('');
      if (sig === lastSig) return; lastSig = sig;
      document.querySelectorAll('.bgl-road').forEach(el => window.BGL.renderBigRoad(window.BGL.buildBigRoad(d.nums || []), el));
      const nm = document.getElementById('bgl-room'); if (nm) nm.textContent = `${d.venue_name || ''} ${d.label || ''}`.trim();
    } catch (_) {}
  }

  async function poll(channel) {
    try {
      const [rs, rr] = await Promise.all([
        fetch(`${BASE}api_settings.php?ch=${acc}&_=${Date.now()}`, { cache: 'no-store' }),
        fetch(`${BASE}api_selected_room.php?ch=${acc}&_=${Date.now()}`, { cache: 'no-store' })]);
      settings = rs.ok ? await rs.json() : {};
      const sel = rr.ok ? await rr.json() : {};
      applyTexts(settings, document.body.dataset.texts ? +document.body.dataset.texts : 4);
      applyBanners(settings);
      tickClock();
      const fixed = channel === 'B' ? settings.table2_num : settings.table_num;   // 그림장 설정의 채널A/B 번호(성천지 테이블 라벨)
      const theme = document.body.dataset.theme || '';
      // 성천지·싱지 모두 자체 그림장(luzhu.html): 원본 zou_base 알고리즘 + 원본 PNG(글자 없음), 같은 1300px 규격 → 같은 크롭
      roomKey = (fixed ? 'xtd_' + String(+fixed) : null) || sel.room_id || null;
      if (!roomKey) { const nm = document.getElementById('bgl-room'); if (nm) nm.textContent = '테이블을 선택하세요 (select.html)'; return; }
      showLuzhu(roomKey, theme);
    } catch (_) {}
  }

  window.__view = function (opt) {
    const channel = (opt && opt.ch) || 'A';
    poll(channel); setInterval(() => poll(channel), 500); setInterval(tickClock, 1000);
  };

  /* (구) 원본 페이지 임베드 모드 — 현재 미사용 */
  let tables = null, lastEmbed = null;
  async function pollEmbed(mode) {
    try {
      if (!tables) { const rt = await fetch(`${BASE}data/tables.json?_=${Date.now()}`, { cache: 'no-store' }); tables = rt.ok ? await rt.json() : { venues: [] }; }
      const [rs, rr] = await Promise.all([
        fetch(`${BASE}api_settings.php?ch=${acc}&_=${Date.now()}`, { cache: 'no-store' }),
        fetch(`${BASE}api_selected_room.php?ch=${acc}&_=${Date.now()}`, { cache: 'no-store' })]);
      settings = rs.ok ? await rs.json() : {};
      const sel = rr.ok ? await rr.json() : {};
      applyTexts(settings, 4); tickClock();
      const key = sel.room_id || '';
      const frame = document.getElementById('frame'), msg = document.getElementById('msg'), nm = document.getElementById('bgl-room');
      let url = null, label = '';
      if (mode === 'fcj6' && key.startsWith('sj_')) { url = `https://fcj6.oqogyf.com/?room_id=${key.slice(3)}`; label = `싱지 ${key.slice(3)}`; }
      if (mode === 'foduna' && key.startsWith('fd_')) {
        const v = (tables.venues || []).find(v => v.key === 'fd'); const room = v && (v.rooms || []).find(r => String(r.id) === key.slice(3));
        if (room) { url = room.url; label = `포추나 ${room.name}`; }
      }
      if (!url) {
        frame.hidden = true; msg.hidden = false; nm.textContent = '';
        msg.textContent = key ? `이 화면은 ${mode === 'fcj6' ? '싱지' : '포추나'} 테이블 전용입니다. select.html 에서 ${mode === 'fcj6' ? '싱지' : '포추나'} 테이블을 선택하세요. (현재: ${key})` : '테이블을 선택하세요 (select.html)';
        lastEmbed = null; return;
      }
      if (url !== lastEmbed) { frame.src = url; lastEmbed = url; }
      frame.hidden = false; msg.hidden = true; nm.textContent = label;
    } catch (_) {}
  }
  window.__viewEmbed = function (opt) {
    const mode = (opt && opt.mode) || 'fcj6';
    pollEmbed(mode); setInterval(() => pollEmbed(mode), 3000); setInterval(tickClock, 1000);
  };
})();
