/* 명패봇 v2 — 엑셀 붙여넣기 → 명패 인쇄
 * 외부 라이브러리 없음 (폐쇄망/정적 호스팅 OK). 모든 처리는 브라우저 안에서만.
 */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 상수 / 상태                                                          */
  /* ------------------------------------------------------------------ */
  const STORE = 'namecardbot.v2';
  const FIELDS = ['company', 'name', 'position'];
  const LABEL = { company: '회사', name: '이름', position: '직급' };
  const ALIASES = {
    company: ['company', '회사', '회사명', '소속', '기관', '기관명', '업체', '업체명'],
    name: ['name', '이름', '성명', '성함'],
    position: ['position', '직급', '직책', '직위', '직함'],
  };
  const THEMES = {
    classic: { label: '클래식', c: ['#b2b3b7', '#008ace', '#004c85', '#0472bd'], ink: '#111111' },
    solid: { label: '단색', c: ['#0472bd', '#0472bd', '#0472bd', '#0472bd'], ink: '#111111' }, // 색은 solidColor로 대체
    plain: { label: '줄 없음', c: ['transparent', 'transparent', 'transparent', 'transparent'], ink: '#111111' },
  };
  // 단색 스타일용 팔레트
  const PALETTE = [
    ['#1f3a68', '남색'], ['#0472bd', '파랑'], ['#4aa3df', '하늘'], ['#1f8a8a', '청록'],
    ['#2e7d4f', '초록'], ['#8bc34a', '연두'], ['#f2b705', '노랑'], ['#f28c28', '주황'],
    ['#d64545', '빨강'], ['#8c2f45', '와인'], ['#7e57c2', '보라'], ['#e87aa4', '분홍'],
    ['#6b7280', '회색'], ['#1a1a1a', '검정'],
  ];
  const HEX = /^#[0-9a-f]{6}$/i;
  // 글자 최대 크기(px, 글자 크기 100% 기준). 칸에 안 들어가면 자동으로 줄어듭니다.
  const MAX_PX = { company: 36, position: 60, name: 120 };
  const SAMPLE = '회사\t이름\t직급\n갑을상사\t홍길동\t부장\n샘숭전자\t김철수\t대리\n한국은행연합회\t이영희\t과장\n(주)대한민국정밀화학\t남궁민수\t책임연구원';

  const state = {
    rows: [],
    opts: { theme: 'classic', solidColor: '#0472bd', mode: 'fold', fontScale: 100, spaced: true, showCompany: true },
  };

  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // textContent: 입력값을 HTML로 해석하지 않음 (XSS 방지)
    return n;
  };
  const blank = () => ({ company: '', name: '', position: '' });

  /* ------------------------------------------------------------------ */
  /* 파싱                                                                 */
  /* ------------------------------------------------------------------ */
  // 따옴표/셀 안 줄바꿈까지 처리하는 구분자 파서 (엑셀 복사본 = 탭 구분)
  function parseDelimited(text, delim) {
    const out = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
        } else cell += ch;
      } else if (ch === '"' && cell === '') {
        quoted = true;
      } else if (ch === delim) {
        row.push(cell); cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); out.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); out.push(row); }
    return out;
  }

  function toRecords(table) {
    table = table
      .map((r) => r.map((c) => c.replace(/\s*[\r\n]+\s*/g, ' ').trim()))
      .filter((r) => r.some((c) => c));
    if (!table.length) return [];

    // 첫 줄이 제목줄이면 제목으로 열 매핑, 아니면 위치로 매핑
    const head = table[0].map((c) => c.toLowerCase().replace(/\s/g, ''));
    const map = {};
    head.forEach((c, i) => {
      for (const k of FIELDS) if (ALIASES[k].includes(c) && !(k in map)) map[k] = i;
    });
    let body = table;
    if (Object.keys(map).length) {
      body = table.slice(1);
    } else {
      const n = Math.max(...table.map((r) => r.length));
      if (n >= 3) Object.assign(map, { company: 0, name: 1, position: 2 });
      else if (n === 2) Object.assign(map, { name: 0, position: 1 });
      else Object.assign(map, { name: 0 });
    }
    return body
      .map((r) => ({
        company: r[map.company] ?? '',
        name: r[map.name] ?? '',
        position: r[map.position] ?? '',
      }))
      .filter((r) => r.company || r.name || r.position);
  }

  function parseText(text) {
    text = text.replace(/^﻿/, '');
    if (!text.trim()) return [];
    const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
    let table;
    if (first.includes('\t')) table = parseDelimited(text, '\t'); // 엑셀 복사
    else if (first.includes(',')) table = parseDelimited(text, ','); // CSV
    else table = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.trim().split(/\s+/)); // 공백 구분
    return toRecords(table);
  }

  /* ------------------------------------------------------------------ */
  /* 저장 / 복원                                                          */
  /* ------------------------------------------------------------------ */
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ rows: state.rows, opts: state.opts })); } catch (e) { /* 무시 */ }
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!d) return;
      if (Array.isArray(d.rows)) {
        state.rows = d.rows.map((r) => ({
          company: String(r.company || ''), name: String(r.name || ''), position: String(r.position || ''),
        }));
      }
      Object.assign(state.opts, d.opts || {});
      if (!THEMES[state.opts.theme]) state.opts.theme = 'classic';
      if (!HEX.test(state.opts.solidColor)) state.opts.solidColor = '#0472bd';
    } catch (e) { /* 무시 */ }
  }

  /* ------------------------------------------------------------------ */
  /* 명단 표                                                              */
  /* ------------------------------------------------------------------ */
  const tbody = $('#rows');

  function renderTable(focusI, focusF) {
    tbody.textContent = '';
    state.rows.forEach((r, i) => {
      const tr = el('tr');
      tr.append(el('td', 'idx', String(i + 1)));
      FIELDS.forEach((f) => {
        const td = el('td');
        const inp = el('input');
        inp.type = 'text';
        inp.value = r[f];
        inp.placeholder = LABEL[f];
        inp.dataset.i = i;
        inp.dataset.f = f;
        inp.setAttribute('aria-label', `${i + 1}행 ${LABEL[f]}`);
        td.append(inp);
        tr.append(td);
      });
      const tdx = el('td', 'x');
      const del = el('button', 'del', '×');
      del.type = 'button';
      del.dataset.i = i;
      del.title = '이 행 삭제';
      del.setAttribute('aria-label', `${i + 1}행 삭제`);
      tdx.append(del);
      tr.append(tdx);
      tbody.append(tr);
    });
    if (focusI != null) focusCell(focusI, focusF);
  }

  function focusCell(i, f) {
    const n = tbody.querySelector(`input[data-i="${i}"][data-f="${f}"]`);
    if (n) { n.focus(); n.select(); }
  }

  tbody.addEventListener('input', (e) => {
    const inp = e.target.closest('input');
    if (!inp) return;
    state.rows[+inp.dataset.i][inp.dataset.f] = inp.value;
    scheduleCards();
  });

  tbody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const inp = e.target.closest('input');
    if (!inp) return;
    e.preventDefault();
    const i = +inp.dataset.i;
    if (i === state.rows.length - 1) {
      state.rows.push(blank());
      renderTable(i + 1, inp.dataset.f);
      scheduleCards();
    } else focusCell(i + 1, inp.dataset.f);
  });

  tbody.addEventListener('click', (e) => {
    const del = e.target.closest('.del');
    if (!del) return;
    state.rows.splice(+del.dataset.i, 1);
    renderTable();
    scheduleCards();
  });

  // 표 안에 여러 칸(엑셀 범위)을 붙여넣으면 해당 위치부터 채움
  tbody.addEventListener('paste', (e) => {
    const inp = e.target.closest('input');
    if (!inp) return;
    const text = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/[\r\n]+$/, '');
    if (!/[\t\r\n]/.test(text)) return; // 한 칸짜리는 기본 동작
    e.preventDefault();
    const grid = parseDelimited(text, '\t');
    const i0 = +inp.dataset.i;
    const c0 = FIELDS.indexOf(inp.dataset.f);
    grid.forEach((cells, di) => {
      while (state.rows.length <= i0 + di) state.rows.push(blank());
      cells.forEach((v, dc) => {
        const f = FIELDS[c0 + dc];
        if (f) state.rows[i0 + di][f] = v.replace(/\s*[\r\n]+\s*/g, ' ').trim();
      });
    });
    renderTable();
    scheduleCards();
  });

  /* ------------------------------------------------------------------ */
  /* 명패 렌더링                                                          */
  /* ------------------------------------------------------------------ */
  function fitBox(cls, text, extra) {
    const box = el('div', `fit ${cls}${extra ? ' ' + extra : ''}`);
    box.dataset.max = MAX_PX[cls];
    box.append(el('span', null, text));
    return box;
  }
  function stripe() {
    const s = el('div', 'stripe');
    for (let i = 0; i < 4; i++) s.append(el('i'));
    return s;
  }

  function panel(r, rotated) {
    const p = el('div', 'panel' + (rotated ? ' rot' : ''));
    const body = el('div', 'pbody');
    if (state.opts.showCompany && r.company) body.append(fitBox('company', r.company));
    const main = el('div', 'main');
    if (r.position) main.append(fitBox('position', r.position));
    main.append(fitBox('name', r.name, state.opts.spaced ? 'spaced' : ''));
    body.append(main);
    p.append(stripe(), body, stripe());
    return p;
  }
  // 접이식: 위쪽은 180° 회전 → 반으로 접어 세우면 양쪽에서 똑바로 읽힘
  function card(r) {
    const c = el('div', 'card');
    c.append(panel(r, true), panel(r, false));
    return c;
  }

  // 글자를 칸 너비에 맞춰 자동 축소 (비례 계산 1회 + 검증)
  function fitAll() {
    const scale = state.opts.fontScale / 100;
    document.querySelectorAll('#sheets .fit').forEach((box) => {
      const span = box.firstChild;
      const max = parseFloat(box.dataset.max) * scale;
      box.style.fontSize = max + 'px';
      const avail = box.clientWidth - 24;
      const w = span.offsetWidth;
      if (avail > 0 && w > avail) {
        box.style.fontSize = Math.max(10, Math.floor((max * avail) / w)) + 'px';
      }
    });
  }

  function applyZoom() {
    const wrap = $('#preview');
    const pagePx = 21 * 37.7953; // 21cm
    const z = Math.min(1, Math.max(0.3, (wrap.clientWidth - 44) / pagePx)); // 좌우 패딩 40 + 여유
    $('#sheets').style.zoom = z;
  }

  function renderCards() {
    const root = $('#sheets');
    root.textContent = '';
    const t = THEMES[state.opts.theme] || THEMES.classic;
    const colors = state.opts.theme === 'solid' ? Array(4).fill(state.opts.solidColor) : t.c;
    colors.forEach((c, i) => root.style.setProperty('--s' + (i + 1), c));
    root.classList.toggle('solid', state.opts.theme === 'solid'); // 단색: 띠 조각 사이 이음선 방지
    root.style.setProperty('--ink', t.ink);

    const rows = state.rows.filter((r) => r.name || r.company || r.position);
    const fold = state.opts.mode === 'fold';
    const per = fold ? 2 : 4;
    for (let i = 0; i < rows.length; i += per) {
      const sheet = el('div', 'sheet');
      rows.slice(i, i + per).forEach((r) => sheet.append(fold ? card(r) : panel(r, false)));
      root.append(sheet);
    }
    $('#empty').hidden = rows.length > 0;
    $('#btn-print').disabled = rows.length === 0;
    $('#count').textContent = rows.length
      ? `${rows.length}명 · A4 ${Math.ceil(rows.length / per)}장`
      : '0명';
    applyZoom();
    fitAll();
  }

  let raf = 0;
  function scheduleCards() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { renderCards(); save(); });
  }

  /* ------------------------------------------------------------------ */
  /* 입력: 붙여넣기 / 파일 / 버튼                                          */
  /* ------------------------------------------------------------------ */
  const ta = $('#paste');

  ta.addEventListener('input', () => {
    state.rows = parseText(ta.value);
    renderTable();
    scheduleCards();
  });

  function readFile(file) {
    file.arrayBuffer().then((buf) => {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } // UTF-8 시도
      catch (e) { text = new TextDecoder('euc-kr').decode(buf); } // 실패 시 EUC-KR(엑셀 기본 CSV)
      ta.value = text;
      ta.dispatchEvent(new Event('input'));
    });
  }
  $('#csvfile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) readFile(f);
    e.target.value = '';
  });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) readFile(f);
  });

  $('#btn-sample').addEventListener('click', () => {
    ta.value = SAMPLE;
    ta.dispatchEvent(new Event('input'));
  });
  $('#btn-clear').addEventListener('click', () => {
    if (state.rows.length && !confirm('입력한 명단을 모두 지울까요?')) return;
    ta.value = '';
    state.rows = [];
    renderTable();
    scheduleCards();
  });
  $('#btn-add').addEventListener('click', () => {
    state.rows.push(blank());
    renderTable(state.rows.length - 1, 'name');
    scheduleCards();
  });
  $('#btn-bulk').addEventListener('click', () => {
    const v = $('#bulkCompany').value.trim();
    if (!v) return;
    state.rows.forEach((r) => { r.company = v; });
    state.opts.showCompany = true;
    syncUI();
    renderTable();
    scheduleCards();
  });
  $('#btn-print').addEventListener('click', () => window.print());

  /* ------------------------------------------------------------------ */
  /* 디자인 옵션                                                          */
  /* ------------------------------------------------------------------ */
  const swatches = $('#swatches');
  Object.entries(THEMES).forEach(([key, t]) => {
    const b = el('button', 'swatch');
    b.type = 'button';
    b.dataset.theme = key;
    const bar = el('span', 'bar');
    t.c.forEach((c) => { const i = el('i'); i.style.background = c; bar.append(i); });
    b.append(bar, el('span', null, t.label));
    swatches.append(b);
  });
  swatches.addEventListener('click', (e) => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    state.opts.theme = b.dataset.theme;
    syncUI();
    scheduleCards();
  });

  // 단색 팔레트 + 직접 선택
  const palette = $('#palette');
  PALETTE.forEach(([hex, name]) => {
    const b = el('button', 'chip');
    b.type = 'button';
    b.dataset.color = hex;
    b.title = name;
    b.setAttribute('aria-label', name);
    b.style.background = hex;
    palette.append(b);
  });
  function setSolid(hex) {
    state.opts.solidColor = hex.toLowerCase();
    state.opts.theme = 'solid';
    syncUI();
    scheduleCards();
  }
  palette.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (b) setSolid(b.dataset.color);
  });
  $('#solidCustom').addEventListener('input', (e) => setSolid(e.target.value));

  // 왼쪽 패널 탭 (명단 / 스타일)
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) =>
        t.setAttribute('aria-selected', String(t === tab)));
      $('#pane-content').hidden = tab.dataset.tab !== 'content';
      $('#pane-style').hidden = tab.dataset.tab !== 'style';
    });
  });

  // 방식(상단 툴바), 이름 자간, 회사명 표시
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'mode') state.opts.mode = t.value;
    else if (t.id === 'spaced') state.opts.spaced = t.checked;
    else if (t.id === 'showCompany') state.opts.showCompany = t.checked;
    scheduleCards();
  });
  $('#fontScale').addEventListener('input', (e) => {
    state.opts.fontScale = +e.target.value;
    $('#fontScaleOut').textContent = state.opts.fontScale + '%';
    scheduleCards();
  });

  function syncUI() {
    document.querySelectorAll('.swatch').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.theme === state.opts.theme)));
    document.querySelectorAll('input[name="mode"]').forEach((r) => { r.checked = r.value === state.opts.mode; });
    // 단색 스타일: 팔레트 표시, 현재 색 반영
    const sc = state.opts.solidColor;
    $('#solidField').hidden = state.opts.theme !== 'solid';
    document.querySelectorAll('.swatch[data-theme="solid"] .bar i').forEach((i) => { i.style.background = sc; });
    document.querySelectorAll('.chip').forEach((c) =>
      c.setAttribute('aria-pressed', String(c.dataset.color === sc)));
    $('#solidCustom').value = sc;
    $('#fontScale').value = state.opts.fontScale;
    $('#fontScaleOut').textContent = state.opts.fontScale + '%';
    $('#spaced').checked = !!state.opts.spaced;
    $('#showCompany').checked = !!state.opts.showCompany;
  }

  /* ------------------------------------------------------------------ */
  /* 시작                                                                 */
  /* ------------------------------------------------------------------ */
  load();
  syncUI();
  renderTable();
  renderCards();

  window.addEventListener('resize', applyZoom);
  window.addEventListener('beforeprint', fitAll);
  if (document.fonts) {
    document.fonts.ready.then(fitAll);
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', fitAll);
  }
})();
