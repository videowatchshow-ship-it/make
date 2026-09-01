/* bgl.js — 바카라 출목표 엔진 v2 */
;(function () {
  'use strict';

  const API     = 'https://gauth.cent-solution.online/photo';
  const POLL_MS = 3000;
  const ROWS    = 6;

  const urlCh = new URLSearchParams(location.search).get('ch') || 'cent';
  window.__ch = urlCh;

  let currentRoomId = null;

  function buildBigRoad(nums) {
    const grid = [];
    let col = -1, row = 0, lastType = null;

    for (const n of nums) {
      if (!n || n.length < 3) continue;
      const type = n[0];
      const bp   = n[1] === '1';
      const pp   = n[2] === '1';

      if (type === 'T') {
        if (col >= 0 && grid[col].length > 0) {
          const last = grid[col][grid[col].length - 1];
          if (last) last.ties = (last.ties || 0) + 1;
        }
        continue;
      }

      if (type !== lastType || col < 0) {
        col++;
        grid[col] = [];
        row = 0;
        lastType = type;
      } else {
        row++;
        if (row >= ROWS) {
          col++;
          grid[col] = [];
          row = ROWS - 1;
        }
      }

      while (grid[col].length < row) grid[col].push(null);
      grid[col][row] = { type, bp, pp, ties: 0 };
    }

    return grid;
  }

  function renderBigRoad(grid, container) {
    const minCols = Math.max(grid.length + 4, 20);
    let html = '<table class="bgl-table"><tbody>';

    for (let r = 0; r < ROWS; r++) {
      html += '<tr>';
      for (let c = 0; c < minCols; c++) {
        const cell = grid[c] && grid[c][r];
        if (cell) {
          const cls  = cell.type === 'P' ? 'bgl-p' : 'bgl-b';
          const pair = (cell.bp ? '<i class="bp"></i>' : '')
                     + (cell.pp ? '<i class="pp"></i>' : '');
          const tie  = cell.ties > 0
            ? `<s>${cell.ties > 1 ? cell.ties : ''}</s>` : '';
          html += `<td><div class="${cls}">${pair}${tie}</div></td>`;
        } else {
          html += '<td></td>';
        }
      }
      html += '</tr>';
    }

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  async function loadRoom(roomId) {
    try {
      const r = await fetch(
        `${API}/data/room_${roomId}.json?_=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (!r.ok) return;
      const data = await r.json();
      const nums = data.nums || [];

      document.querySelectorAll('.bgl-road').forEach(el => {
        renderBigRoad(buildBigRoad(nums), el);
      });

      const nameEl = document.getElementById('bgl-room');
      if (nameEl) {
        const kind = data.kind || '';
        nameEl.textContent = `방 ${roomId}${kind ? ' (' + kind + ')' : ''}`;
      }
    } catch (_) {}
  }

  async function pollRoom() {
    try {
      const r = await fetch(
        `${API}/api_selected_room.php?ch=${urlCh}&_=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (!r.ok) return;
      const data = await r.json();
      const rid  = data.room_id;
      if (rid && rid !== currentRoomId) {
        currentRoomId = rid;
        await loadRoom(rid);
      }
    } catch (_) {}
  }

  function loadPerAccountImages() {
    fetch(`${API}/api_img_ver.php?ch=${urlCh}&_=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .then(ver => {
        document.querySelectorAll('img[src]').forEach(img => {
          const base = img.getAttribute('src');
          if (!base || base.startsWith('http')) return;
          const file = base.split('/').pop();
          const ts   = ver[file] || Date.now();
          img.src = `${API}/images/ch/${urlCh}/${file}?v=${ts}`;
          img.onerror = () => { img.src = `${API}/images/${file}?v=${ts}`; };
        });
      })
      .catch(() => {});
  }

  function start() {
    const hasRoad = document.querySelector('.bgl-road');
    if (hasRoad) {
      loadPerAccountImages();
      pollRoom();
      setInterval(pollRoom, POLL_MS);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.BGL = { buildBigRoad, renderBigRoad };
})();
