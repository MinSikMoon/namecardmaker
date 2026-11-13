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
    classic: { label: '클래식', c: ['#b2b3b7', '#008ace', '#004c85', '#0472bd'], ink: '#000000' },
    solid: { label: '단색', c: ['#0472bd', '#0472bd', '#0472bd', '#0472bd'], ink: '#000000' }, // 색은 solidColor로 대체
    plain: { label: '줄 없음', c: ['transparent', 'transparent', 'transparent', 'transparent'], ink: '#000000' },
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
  const SAMPLE = '회사\t이름\t직급\n오로라상사\t홍길동\t부장\n푸른솔전자\t김철수\t대리\n해든결금융\t이영희\t과장\n(주)별누리정밀화학\t남궁민수\t책임연구원';

  const state = {
    rows: [],
    opts: { theme: 'classic', solidColor: '#0472bd', mode: 'fold', joined: true, ruler: true, size: { w: 20, h: 6.5 }, scale: { all: 100, company: 100, position: 100, name: 100 }, posW: 30, spaced: true, showCompany: true, showPosition: true },
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
      const saved = d.opts || {};
      Object.assign(state.opts, saved);
      // 이전 버전(글자 크기 슬라이더 1개)에서 저장된 값은 '전체 크기'로 이어받기
      const old = Number.isFinite(saved.fontScale) ? saved.fontScale : 100;
      const sv = saved.scale && typeof saved.scale === 'object' ? saved.scale : {};
      const clamp = (v, lo, hi, dflt) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : dflt);
      state.opts.scale = {
        all: clamp(sv.all, 50, 150, old),
        company: clamp(sv.company, 50, 150, 100),
        position: clamp(sv.position, 50, 150, 100),
        name: clamp(sv.name, 50, 150, 100),
      };
      state.opts.posW = clamp(saved.posW, 20, 45, 30);
      const sz = saved.size && typeof saved.size === 'object' ? saved.size : {};
      state.opts.size = {
        w: Number.isFinite(+sz.w) && +sz.w > 0 ? +sz.w : 20,
        h: Number.isFinite(+sz.h) && +sz.h > 0 ? +sz.h : 6.5,
      };
      state.opts.ruler = saved.ruler !== false;
      state.opts.showCompany = saved.showCompany !== false;
      state.opts.showPosition = saved.showPosition !== false;
      delete state.opts.fontScale;
      if (!THEMES[state.opts.theme]) state.opts.theme = 'classic';
      if (!HEX.test(state.opts.solidColor)) state.opts.solidColor = '#0472bd';
    } catch (e) { /* 무시 */ }
  }

  /* ------------------------------------------------------------------ */
  /* 명단 표                                                              */
  /* ------------------------------------------------------------------ */
  const tbody = $('#rows');

  // 켜져 있는 항목만 표에 보임 (꺼도 입력값은 그대로 보존)
  const visibleFields = () => FIELDS.filter((f) =>
    (f !== 'company' || state.opts.showCompany) && (f !== 'position' || state.opts.showPosition));

  function renderTable(focusI, focusF) {
    tbody.textContent = '';
    const vf = visibleFields();
    document.querySelectorAll('#tbl th[data-f]').forEach((th) => { th.hidden = !vf.includes(th.dataset.f); });
    $('#bulkrow').hidden = !state.opts.showCompany;
    state.rows.forEach((r, i) => {
      const tr = el('tr');
      tr.append(el('td', 'idx', String(i + 1)));
      vf.forEach((f) => {
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
    const vf = visibleFields();
    const c0 = vf.indexOf(inp.dataset.f);
    grid.forEach((cells, di) => {
      while (state.rows.length <= i0 + di) state.rows.push(blank());
      cells.forEach((v, dc) => {
        const f = vf[c0 + dc];
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
    box.dataset.kind = cls;
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
    if (state.opts.showPosition && r.position) main.append(fitBox('position', r.position));
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

  // 글자를 칸 너비에 맞춰 자동 축소. 크기 비율은 칸(회사명/직급/이름)마다 따로 적용,
  // 긴 글자는 그 칸만 알아서 줄어들어 다른 칸에 영향을 주지 않음
  let fitK = 1; // 명패 크기 배율 (기준 20×6.5cm 대비)
  function fitAll() {
    document.querySelectorAll('#sheets .fit').forEach((box) => {
      const span = box.firstChild;
      const sc = state.opts.scale; // 최종 크기 = 기준 크기 × 명패 크기 배율 × 전체 × 칸별(상대값)
      const max = parseFloat(box.dataset.max) * fitK * (sc.all / 100) * (sc[box.dataset.kind] / 100);
      box.style.fontSize = max + 'px';
      const pad = parseFloat(getComputedStyle(box).paddingLeft) * 2;
      const avail = box.clientWidth - pad;
      const w = span.offsetWidth;
      if (avail > 0 && w > avail) {
        box.style.fontSize = Math.max(5, Math.floor((max * avail) / w)) + 'px';
      }
    });
  }

  function applyZoom() {
    const wrap = $('#preview');
    const pagePx = 21 * 37.7953; // 21cm
    const z = Math.min(1, Math.max(0.3, (wrap.clientWidth - 44) / pagePx)); // 좌우 패딩 40 + 여유
    $('#sheets').style.zoom = z;
  }

  /* ---- 명패 크기 / A4 배치 계산 ---- */
  const A4 = { w: 21, h: 29.6 }; // 세로 29.7cm 중 1mm 여유 (한 장이 두 장으로 넘어가지 않게)
  const BASE = { w: 20, h: 6.5 }; // 글자 크기·띠 두께의 기준이 되는 명패 크기(cm)
  const fmt = (n) => String(+n.toFixed(2));

  // 입력한 크기를 A4에 들어가는 범위로 보정하고 한 장에 몇 개가 들어가는지 계산
  function layout() {
    const fold = state.opts.mode === 'fold';
    const mul = fold ? 2 : 1; // 접이식: 펼친 높이 = 한 면 높이 × 2
    const gap = state.opts.joined ? 0 : 0.6;
    const warn = [];
    let { w, h } = state.opts.size;
    const lim = (v, lo, hi, label) => {
      if (v < lo) { warn.push(`${label}는 최소 ${fmt(lo)}cm`); return lo; }
      if (v > hi) { warn.push(`${label}는 최대 ${fmt(hi)}cm`); return hi; }
      return v;
    };
    w = lim(w, 3, A4.w, '가로');
    h = lim(h, 1.5, A4.h / mul, '세로');
    if (warn.length) warn.push('A4에 들어가는 크기로 맞춰서 표시 중이에요');
    const cols = Math.max(1, Math.floor((A4.w + gap + 1e-6) / (w + gap)));
    const rows = Math.max(1, Math.floor((A4.h + gap + 1e-6) / (h * mul + gap)));
    const bottomMargin = (A4.h - (rows * h * mul + (rows - 1) * gap)) / 2;
    return { w, h, mul, gap, cols, rows, per: cols * rows, warn, bottomMargin, rulerFits: bottomMargin >= 1.1 };
  }

  function showLayoutInfo(L, fold) {
    $('#fitinfo').textContent =
      `A4 1장에 가로 ${L.cols} × 세로 ${L.rows} = ${L.per}명` +
      (fold ? ` · 펼친 높이 ${fmt(L.h * 2)}cm` : '');
    const warn = $('#fitwarn');
    const msgs = L.warn.slice();
    if (state.opts.ruler && !L.rulerFits) msgs.push('아래 여백이 좁아 10cm 확인 눈금은 생략돼요');
    warn.textContent = msgs.join(' · ');
    warn.hidden = !msgs.length;
  }

  // 인쇄 후 자로 재서 10cm인지 확인하는 눈금 (여백 부분이라 자를 때 버려짐)
  function rulerEl() {
    const r = el('div', 'ruler');
    r.append(el('span', null, '이 선이 자로 10cm인지 확인하세요 (아니면 인쇄 배율 100%로)'));
    return r;
  }

  function renderCards() {
    const root = $('#sheets');
    root.textContent = '';
    const t = THEMES[state.opts.theme] || THEMES.classic;
    const colors = state.opts.theme === 'solid' ? Array(4).fill(state.opts.solidColor) : t.c;
    colors.forEach((c, i) => root.style.setProperty('--s' + (i + 1), c));
    root.classList.toggle('solid', state.opts.theme === 'solid'); // 단색: 띠 조각 사이 이음선 방지
    root.style.setProperty('--ink', t.ink);
    root.style.setProperty('--pos-w', state.opts.posW + '%');

    const L = layout();
    fitK = Math.min(L.w / BASE.w, L.h / BASE.h);
    root.style.setProperty('--pw', L.w + 'cm');
    root.style.setProperty('--ph', L.h + 'cm');
    root.style.setProperty('--cols', L.cols);
    root.style.setProperty('--gap', L.gap + 'cm');

    const rows = state.rows.filter((r) => r.name || r.company || r.position);
    const fold = state.opts.mode === 'fold';
    const per = L.per;
    for (let i = 0; i < rows.length; i += per) {
      const sheet = el('div', 'sheet');
      rows.slice(i, i + per).forEach((r, j) => {
        const node = fold ? card(r) : panel(r, false);
        if (state.opts.joined) { // 붙여서 배치: 맞닿는 경계선은 한 줄만 (첫 행/열 제외)
          if (Math.floor(j / L.cols) > 0) node.classList.add('nt');
          if (j % L.cols > 0) node.classList.add('nl');
        }
        sheet.append(node);
      });
      if (state.opts.ruler && L.rulerFits) sheet.append(rulerEl());
      root.append(sheet);
    }
    $('#empty').hidden = rows.length > 0;
    $('#btn-print').disabled = rows.length === 0;
    $('#count').textContent = rows.length
      ? `${rows.length}명 · A4 ${Math.ceil(rows.length / per)}장`
      : '0명';
    showLayoutInfo(L, fold);
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

  // 명패에 넣을 항목(회사명·직급) 칩: 이름은 항상 포함
  function syncFieldChips() {
    document.querySelectorAll('.fchip[data-field]').forEach((b) => {
      const on = b.dataset.field === 'company' ? state.opts.showCompany : state.opts.showPosition;
      b.setAttribute('aria-pressed', String(!!on));
    });
    const c = state.opts.showCompany, p = state.opts.showPosition;
    $('#fieldhint').textContent = '현재 조합: ' + [c && '회사명', p && '직급', '이름'].filter(Boolean).join(' + ');
  }
  $('#fieldchips').addEventListener('click', (e) => {
    const b = e.target.closest('.fchip[data-field]');
    if (!b) return;
    const k = b.dataset.field === 'company' ? 'showCompany' : 'showPosition';
    state.opts[k] = !state.opts[k];
    syncFieldChips();
    renderTable();
    scheduleCards();
  });

  // 방식(상단 툴바), 이름 자간
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'mode') state.opts.mode = t.value;
    else if (t.id === 'spaced') state.opts.spaced = t.checked;
    else if (t.id === 'joined') state.opts.joined = t.checked;
    else if (t.id === 'ruler') state.opts.ruler = t.checked;
    scheduleCards();
  });

  // 명패 크기(cm): 한 면 기준. 숫자가 아니거나 0 이하면 무시, 범위를 벗어나면 보정해서 표시(경고 문구)
  [['sizeW', 'w'], ['sizeH', 'h']].forEach(([id, key]) => {
    $('#' + id).addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (!Number.isFinite(v) || v <= 0) return;
      state.opts.size[key] = v;
      scheduleCards();
    });
  });
  $('#btn-size-reset').addEventListener('click', () => {
    state.opts.size = { w: BASE.w, h: BASE.h };
    syncUI();
    scheduleCards();
  });
  // 글자 크기: 회사명 / 직급 / 이름 따로, 직급 칸 너비
  document.querySelectorAll('input[data-scale]').forEach((inp) => {
    inp.addEventListener('input', () => {
      state.opts.scale[inp.dataset.scale] = +inp.value;
      syncSizes();
      scheduleCards();
    });
  });
  $('#posW').addEventListener('input', (e) => {
    state.opts.posW = +e.target.value;
    syncSizes();
    scheduleCards();
  });
  $('#btn-sizes-reset').addEventListener('click', () => {
    state.opts.scale = { all: 100, company: 100, position: 100, name: 100 };
    state.opts.posW = 30;
    syncSizes();
    scheduleCards();
  });
  function syncSizes() {
    document.querySelectorAll('input[data-scale]').forEach((inp) => {
      inp.value = state.opts.scale[inp.dataset.scale];
      $('#' + inp.id + 'Out').textContent = inp.value + '%';
    });
    $('#posW').value = state.opts.posW;
    $('#posWOut').textContent = state.opts.posW + '%';
  }

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
    syncSizes();
    $('#spaced').checked = !!state.opts.spaced;
    syncFieldChips();
    $('#joined').checked = !!state.opts.joined;
    $('#ruler').checked = !!state.opts.ruler;
    $('#sizeW').value = state.opts.size.w;
    $('#sizeH').value = state.opts.size.h;
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
