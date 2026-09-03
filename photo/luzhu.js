/* luzhu.js — gs.xtd6688.com/luzhu zou_base.js 알고리즘 1:1 포팅 (珠子/大路/大眼/小路/小强/三星/问路)
   입력: data/room_<key>.json 의 nums ["P00","B10","T00",...] → 원본 형식 {k0:{result,ext},...}
   result: 1 庄(B) 2 闲(P) 3 和(T)   ext: 0 없음 1 庄对(bp) 2 闲对(pp) 3 둘다 */
;(function () {
  'use strict';
  var NO = 'no_color';
  function arr2(x, y) { var a = new Array(x); for (var i = 0; i < x; i++) { a[i] = new Array(y); for (var j = 0; j < y; j++) a[i][j] = NO; } return a; }
  /* 싱지(fcj6) 원본 파서 그대로: /^[BPTbpt](\d{2,4})([A-Z]*)$/
       [0]   B 庄 / P 闲 / T 和               → FormatConvertor (앞 3자)
       [1]   1 = 庄对(뱅커 페어)
       [2]   1 = 闲对(플레이어 페어)
       [3..] 특수(OtherFormatConvertor: 첫글자+접미) 62 = 幸运六 2장, 63 = 幸运六 3장, 7 = 龙七(용7), 8 = 熊八(판다8)
     성천지(xtd) 는 collector 가 같은 문자열로 변환 (result 4 幸运6 → 'B..6') */
  var RX = /^([BPT])(\d{2,4})([A-Z]*)$/;
  function special(letter, suf) {
    if (!suf) return '';
    var k = letter + suf;
    if (k === 'B62') return '2장6'; if (k === 'B63') return '3장6'; if (k === 'B6') return '식스';   // 幸运六 (2장/3장)
    if (k === 'B7') return '용7'; if (k === 'P8') return '용8';                                        // 龙七 / 熊八
    return '';
  }
  function toOrg(nums) {
    var o = {}, i = 0;
    (nums || []).forEach(function (n) {
      var m = RX.exec(String(n || '').toUpperCase()); if (!m) return;
      var d = m[2], r = m[1] === 'B' ? 1 : m[1] === 'P' ? 2 : 3, e = (d[0] === '1' ? 1 : 0) + (d[1] === '1' ? 2 : 0);
      o['k' + (i++)] = { result: r, ext: e, sp: special(m[1], d.slice(2)) };
    });
    return o;
  }
  function imgName(r) { var b = r.result == 1 ? 1 : r.result == 2 ? 5 : r.result == 3 ? 9 : 13; return b + (parseInt(r.ext) || 0); }
  var RED = [1, 2, 3, 4], BLUE = [5, 6, 7, 8];
  function colorOf(v) { return RED.indexOf(v) >= 0 ? 'red' : BLUE.indexOf(v) >= 0 ? 'blue' : v; }

  function compute(org) {
    var S = {};
    // 珠子
    var zhuzi = {}; for (var p in org) zhuzi[p] = imgName(org[p]);
    // 大路 원본 + 和 카운트
    var dImg = {}, dNumRaw = {}, pos = 0;
    for (var p in org) {
      if (org[p].result != 3) dImg['k' + pos] = imgName(org[p]);
      else dNumRaw['k' + (pos - 1)] = 1;
      pos++;
    }
    // set_he_sum_by_he_num
    var dNum = {};
    for (var p in dNumRaw) if (dNumRaw[p] == 1) {
      var pn = parseInt(p.substr(1)), sum = 0, go = 1;
      for (var i = 0; i < 66; i++) { var q = 'k' + (pn + i); if (typeof dNumRaw[q] === 'undefined') go = 0; if (go && dNumRaw[q] == 1) sum++; }
      var s2 = 0, s3 = 0; for (var i = 0; i <= pn - 1; i++) { if (typeof dNumRaw['k' + i] !== 'undefined') s2 += dNumRaw['k' + i]; if (typeof dNum['k' + i] !== 'undefined') s3 += dNum['k' + i]; }
      if (s2 + sum > s3) dNum[p] = sum;
    }
    // 압축
    var cImg = {}, cNum = {}, ci = 0;
    for (var p in dImg) { if ([9, 10, 11, 12].indexOf(dImg[p]) < 0) { cImg['k' + ci] = dImg[p]; if (typeof dNum[p] !== 'undefined') cNum['k' + ci] = dNum[p]; ci++; } }
    // 三星
    var sx = {}; for (var p in cImg) sx[p] = colorOf(cImg[p]);
    // tmp dalu array (컬럼: 색 바뀌면 새 열)
    var T = arr2(66, 66), TN = arr2(66, 66), x = 0, y = 0;
    for (var p in cImg) {
      var pn = parseInt(p.substr(1));
      if (pn === 0) { T[0][0] = cImg[p]; if (typeof cNum[p] === 'number') TN[0][0] = cNum[p]; }
      else { if (colorOf(cImg['k' + (pn - 1)]) !== colorOf(cImg[p])) { x++; y = 0; } else y++; T[x][y] = cImg[p]; if (typeof cNum[p] === 'number') TN[x][y] = cNum[p]; }
    }
    function len(col) { var n = 0; for (var i = 0; i < col.length; i++) if (col[i] !== NO) n++; return n; }
    function useLie(x, y, step) { return len(T[x - step]) === len(T[x - 1]) ? 'red' : 'blue'; }
    function useDown(x, y, step) { var c = T[x - step]; if (c[y] !== NO) return 'red'; if (c[y] === NO && c[y - 1] === NO) return 'red'; return 'blue'; }
    function derive(x1, y1, x2, y2, hs, ls) {
      var o = {}; if (T[x1][y1] === NO && T[x2][y2] === NO) return o;
      var i = 0, sx0 = T[x1][y1] !== NO ? x1 : x2, sy0 = T[x1][y1] !== NO ? y1 : y2;
      for (var yy = sy0; yy < 66; yy++) if (T[sx0][yy] !== NO) o['k' + (i++)] = yy === 0 ? useLie(sx0, yy, ls) : useDown(sx0, yy, hs);
      for (var xx = sx0 + 1; xx < 66; xx++) for (var yy = 0; yy < 66; yy++) if (T[xx][yy] !== NO) o['k' + (i++)] = yy === 0 ? useLie(xx, yy, ls) : useDown(xx, yy, hs);
      return o;
    }
    var dayan = derive(1, 1, 2, 0, 1, 2), xiaolu = derive(2, 1, 3, 0, 2, 3), xiaoqiang = derive(3, 1, 4, 0, 3, 4);
    function objToArr(o) { var a = arr2(66, 66), x = 0, y = 0; for (var p in o) { var pn = parseInt(p.substr(1)); if (pn === 0) a[0][0] = o[p]; else { if (o['k' + (pn - 1)] !== o[p]) { x++; y = 0; } else y++; a[x][y] = o[p]; } } return a; }
    // set_show_by_array (용꼬리)
    function showArr(org, num) {
      var img = arr2(66, 6), nm = arr2(66, 6), cp = [], used = arr2(66, 66);
      for (var i = 0; i < 66; i++) {
        var change = 5;
        for (var j = 0; j < 66; j++) {
          if (org[i][j] !== NO && typeof org[i][j] !== 'undefined') {
            if (j <= change && used[i][j] === 'use') change = j - 1;
            if (j < change) { img[i][j] = org[i][j]; if (num && typeof num[i][j] === 'number') nm[i][j] = num[i][j]; used[i][j] = 'use'; }
            else { var ni = i + (j - change), nj = change; if (img[ni]) { img[ni][nj] = org[i][j]; if (num && typeof num[i][j] === 'number') nm[ni][nj] = num[i][j]; } if (used[ni]) used[ni][nj] = 'use'; used[i][j] = 'use'; }
          }
          cp[i] = change;
        }
      }
      return { img: img, num: nm, cp: cp };
    }
    var showZ = arr2(11, 6), showZS = arr2(11, 6), zi = 0;
    for (var p in zhuzi) { if (Math.floor(zi / 6) < 11) { showZ[Math.floor(zi / 6)][zi % 6] = zhuzi[p]; showZS[Math.floor(zi / 6)][zi % 6] = org[p].sp || ''; } zi++; }
    var showSX = arr2(66, 3), showSXN = arr2(66, 3), si = 0; for (var p in sx) { showSX[Math.floor(si / 3)][si % 3] = sx[p]; if (typeof cNum[p] === 'number') showSXN[Math.floor(si / 3)][si % 3] = cNum[p]; si++; }
    var tDY = objToArr(dayan), tXL = objToArr(xiaolu), tXQ = objToArr(xiaoqiang);
    var D = showArr(T, TN), DY = showArr(tDY), XL = showArr(tXL), XQ = showArr(tXQ);
    // 问路 (Next 庄/闲)
    function last(a) { var r = { x: 0, y: 0, color: 'no_find' }; for (var i = 0; i < a.length; i++) for (var j = 0; j < a[i].length; j++) if (typeof a[i][j] !== 'undefined' && a[i][j] !== NO) { r = { x: i, y: j, color: a[i][j] }; } return r; }
    function next(o, c) { return c === o.color ? { x: o.x, y: o.y + 1, color: c } : { x: o.x + 1, y: 0, color: c }; }
    var dl = last(T); dl.color = colorOf(dl.color);
    function nextXia(cur, c, step) {
      var nd = next(dl, c);
      if (nd.x - 1 < 0 || nd.x - 1 - step < 0 || nd.x - step < 0) return { x: -1, y: -1, color: 'no_find' };
      var col = nd.y === 0 ? useLie(nd.x, nd.y, step + 1) : useDown(nd.x, nd.y, step);
      return next(cur, col);
    }
    var wen = {
      red:  { dayan: nextXia(last(tDY), 'red', 1), xiaolu: nextXia(last(tXL), 'red', 2), xiaoqiang: nextXia(last(tXQ), 'red', 3) },
      blue: { dayan: nextXia(last(tDY), 'blue', 1), xiaolu: nextXia(last(tXL), 'blue', 2), xiaoqiang: nextXia(last(tXQ), 'blue', 3) }
    };
    return { zhuzi: showZ, zhuziSp: showZS, dalu: D.img, daluNum: D.num, dayan: DY.img, xiaolu: XL.img, xiaoqiang: XQ.img, sanxing: showSX, sanxingNum: showSXN, wenlu: wen, count: pos };
  }

  /* ---- 렌더 (원본 show_pulic_img_html / show_pulic_num_html 그대로) ---- */
  var STEP = { zhuzi: 39.9, dalu: 20.05, xiaolu: 10.05, dayan: 10.05, xiaoqiang: 10.05, sanxing: 20.05 };
  /* 뉴싱지(fcj6) 디자인: 원본 클라이언트가 이미지 대신 VectorCircle 로 그림
       珠子 BtnZhuzi : 채운 원 COLOR_Z rgb(156,0,0) / COLOR_X rgb(0,3,160) / COLOR_H rgb(0,94,0) + 글자 B/P/tie + 庄对·闲对 점
       大路 Btn_BigRoad : 테두리 원 color_zhuang rgb(255,0,0) / color_xian rgb(13,118,224)
       大眼/小路/小强 : 테두리 원 / 채운 원 / 빗금 (원본 BigEye·SmallRoad·YueYou) */
  var SJ = document.body.classList.contains('gold');
  function vec(path, v) {
    if (path === 'zhuzi') {   // 글자(B/P/T) 없이 원 + 페어 점만
      var c = v <= 4 ? 'B' : v <= 8 ? 'P' : 'T', e = (v - 1) % 4;
      return "<i class='vz v" + c + "'>" + (e & 1 ? "<u class='zd'></u>" : '') + (e & 2 ? "<u class='xd'></u>" : '') + "</i>";
    }
    if (path === 'dalu') return "<i class='vd " + (v <= 4 ? 'r' : 'b') + "'>" + ((v - 1) % 4 & 1 ? "<u class='zd'></u>" : '') + ((v - 1) % 4 & 2 ? "<u class='xd'></u>" : '') + "</i>";
    if (path === 'dayan') return "<i class='vy " + (v === 'red' ? 'r' : 'b') + "'></i>";
    if (path === 'xiaolu') return "<i class='vx " + (v === 'red' ? 'r' : 'b') + "'></i>";
    if (path === 'xiaoqiang') return "<i class='vq " + (v === 'red' ? 'r' : 'b') + "'></i>";
    if (path === 'sanxing') return "<i class='vs " + (v === 'red' ? 'r' : 'b') + "'></i>";
    return '';
  }
  function imgHtml(src, cls, step, rows, path, sp) {
    var h = '';
    for (var i = 0; i < src.length; i++) for (var j = 0; j < rows; j++) {
      var v = src[i][j]; if (v === NO || v === 'no_find' || typeof v === 'undefined') continue;
      var s = sp && sp[i] && sp[i][j] && sp[i][j] !== NO ? sp[i][j] : '';
      h += "<div class='content' style='left:" + (step * i) + "px;top:" + (step * j) + "px;width:" + step + "px;height:" + step + "px'>" +
           ((SJ || path === 'zhuzi') ? vec(path, v) : "<img src='luzhu_img/" + path + "/" + v + ".png'>") +   // 珠子는 항상 글자 없는 원
           (s ? "<span class='sp sp" + s.slice(-1) + "'>" + s + "</span>" : '') + "</div>";
    }
    return h;
  }
  function numHtml(src, step, rows) {
    var h = '';
    for (var i = 0; i < src.length; i++) for (var j = 0; j < rows; j++) {
      var v = src[i][j]; if (v === NO || v === 'no_find' || typeof v === 'undefined') continue;
      h += "<div class='content_num' style='left:" + (step * i) + "px;top:" + (step * j) + "px;width:" + step + "px;height:" + step + "px'>" + v + "</div>";
    }
    return h;
  }
  function render(R) {
    var q = function (c) { return document.querySelector('.' + c); };
    q('jingshan_zhuzi').innerHTML = imgHtml(R.zhuzi, 'jingshan_zhuzi', STEP.zhuzi, 6, 'zhuzi', R.zhuziSp);
    q('jingshan_dalu').innerHTML = imgHtml(R.dalu, 'jingshan_dalu', STEP.dalu, 66, 'dalu') + numHtml(R.daluNum, STEP.dalu, 66);
    q('jingshan_xiaolu').innerHTML = imgHtml(R.xiaolu, '', STEP.xiaolu, 66, 'xiaolu');
    q('jingshan_dayan').innerHTML = imgHtml(R.dayan, '', STEP.dayan, 66, 'dayan');
    q('jingshan_xiaoqiang').innerHTML = imgHtml(R.xiaoqiang, '', STEP.xiaoqiang, 66, 'xiaoqiang');
    q('jingshan_sanxing').innerHTML = imgHtml(R.sanxing, '', STEP.sanxing, 3, 'sanxing') + numHtml(R.sanxingNum, STEP.sanxing, 3);
    function wl(o) { return ['dayan', 'xiaolu', 'xiaoqiang'].map(function (k) { return "<img src='luzhu_img/wenlu_static/" + o[k].color + "_" + k + ".png' />"; }).join(''); }
    document.getElementById('wenlu_show_red').innerHTML = wl(R.wenlu.red);
    document.getElementById('wenlu_show_blue').innerHTML = wl(R.wenlu.blue);
  }

  /* ---- 시작: ?room=<key> (data/room_<key>.json) 1초 폴링 (원본 setInterval 1000) ---- */
  var BASE = location.pathname.replace(/[^\/]*$/, '');
  var room = new URLSearchParams(location.search).get('room') || '';
  var prevLen = 0, lastSig = null;
  function tick() {
    if (!room) return;
    fetch(BASE + 'data/room_' + room + '.json?_=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      var nums = d.nums || [], sig = nums.join('');
      if (nums.length < prevLen) location.reload();
      prevLen = nums.length;
      if (sig === lastSig) return; lastSig = sig;
      render(compute(toOrg(nums)));
      var t = document.querySelector('.top_title'); if (t) t.textContent = (d.venue_name || '') + ' ' + (d.label || '');
    }).catch(function () {});
  }
  // 배경 격자 (make_bg_for_pc.js 그대로: table_bg 252칸, zhuzi 66칸)
  document.querySelectorAll('.table_bg').forEach(function (el) { var h = ''; for (var i = 1; i <= 252; i++) h += '<div class="table_bg_td"></div>'; el.innerHTML = h; });
  document.querySelectorAll('.table_zhuzi_bg').forEach(function (el) { var h = ''; for (var i = 1; i <= 66; i++) h += '<div class="table_zhuzi_bg_td"></div>'; el.innerHTML = h; });
  tick(); setInterval(tick, 500);   // 결과→표시 1초 이내 (크롤 1초 + 표시 0.5초 폴링)
  window.LUZHU = { compute: compute, toOrg: toOrg, render: render };
})();
