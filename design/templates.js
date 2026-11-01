'use strict';
// AMH Studio: themes, page sizes and planner / journal page templates.
// Templates are laid out on a 1000-unit-wide grid and scaled to the real page size.

const FONTS = [
  'Playfair Display', 'Cormorant Garamond', 'DM Serif Display', 'Lora', 'Cinzel',
  'Poppins', 'Montserrat', 'Josefin Sans', 'Nunito', 'Inter',
  'Caveat', 'Dancing Script', 'Patrick Hand', 'Amatic SC', 'Homemade Apple',
];

const THEMES = {
  sage:       { name: 'Sage',       bg: '#F5F2EA', paper: '#FFFDF8', ink: '#3E4A3D', muted: '#C9CFBF', accent: '#8FA383', accent2: '#E1E7D7', accent3: '#C9A27E', head: 'Playfair Display',  body: 'Poppins',      script: 'Caveat' },
  blush:      { name: 'Blush',      bg: '#FBF1EE', paper: '#FFFAF8', ink: '#5A3E3E', muted: '#E8CFCB', accent: '#D29A9A', accent2: '#F5E1DB', accent3: '#B5838D', head: 'Cormorant Garamond', body: 'Josefin Sans', script: 'Dancing Script' },
  lavender:   { name: 'Lavender',   bg: '#F4F0FA', paper: '#FCFAFF', ink: '#43386B', muted: '#D6CDEB', accent: '#9D8BD6', accent2: '#E8E1F7', accent3: '#E3A3C0', head: 'Lora',              body: 'Nunito',       script: 'Caveat' },
  terracotta: { name: 'Terracotta', bg: '#F8EFE6', paper: '#FFF9F3', ink: '#5B3B2A', muted: '#E4CDB8', accent: '#C97C5D', accent2: '#F1DECE', accent3: '#8A9A5B', head: 'DM Serif Display',  body: 'Josefin Sans', script: 'Patrick Hand' },
  ocean:      { name: 'Ocean',      bg: '#EEF4F6', paper: '#FAFDFE', ink: '#1F3D4D', muted: '#C3D6DD', accent: '#4F8FA6', accent2: '#DAE8EE', accent3: '#E2AE62', head: 'Cormorant Garamond', body: 'Montserrat',   script: 'Caveat' },
  midnight:   { name: 'Midnight',   bg: '#1F2433', paper: '#262C3D', ink: '#EDE6D6', muted: '#4A5168', accent: '#C9A66B', accent2: '#313950', accent3: '#8C9BC4', head: 'Playfair Display',  body: 'Montserrat',   script: 'Dancing Script' },
  minimal:    { name: 'Minimal',    bg: '#FFFFFF', paper: '#FFFFFF', ink: '#1F1F1F', muted: '#D9D9D9', accent: '#1F1F1F', accent2: '#F2F2F2', accent3: '#9A9A9A', head: 'DM Serif Display',  body: 'Inter',        script: 'Caveat' },
};
const THEME_COLOR_KEYS = ['bg', 'paper', 'ink', 'muted', 'accent', 'accent2', 'accent3'];
const THEME_FONT_KEYS = ['head', 'body', 'script'];

const SIZES = [
  { id: 'planner',   name: 'Digital planner (tablet)', w: 1620, h: 2160 },
  { id: 'letter',    name: 'Printable · US Letter',    w: 1275, h: 1650 },
  { id: 'a4',        name: 'Printable · A4',           w: 1240, h: 1754 },
  { id: 'ig',        name: 'Instagram post',           w: 1080, h: 1080 },
  { id: 'portrait',  name: 'Instagram portrait',       w: 1080, h: 1350 },
  { id: 'story',     name: 'Story / Reel cover',       w: 1080, h: 1920 },
  { id: 'phone',     name: 'Phone wallpaper',          w: 1170, h: 2532 },
  { id: 'desktop',   name: 'Desktop wallpaper',        w: 1920, h: 1080 },
  { id: 'poster',    name: 'Poster 18×24',             w: 1800, h: 2400 },
  { id: 'card',      name: 'Card 5×7',                 w: 1050, h: 1470 },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

const SCALE_KEYS = ['x', 'y', 'w', 'h', 'size', 'strokeW', 'radius', 'gap', 'letter'];

// Page builder in 1000-unit coordinates.
function builder(W, H, th, opt = {}) {
  const u = W / 1000, PH = H / u, items = [];
  const tabs = !!opt.tabs;
  const b = {
    u, PH, th, items,
    L: 60, R: 1000 - 60 - (tabs ? 50 : 0), T: 70, B: PH - 70,
    get CW() { return b.R - b.L; },
    add(o) {
      const it = Object.assign({ id: uid(), rot: 0, opacity: 1 }, o);
      for (const k of SCALE_KEYS) if (typeof it[k] === 'number') it[k] *= u;
      items.push(it);
      return it;
    },
    text(x, y, w, text, o = {}) {
      const size = o.size || 24;
      return b.add(Object.assign({ type: 'text', x, y, w, h: size * 1.3, text: String(text), font: th.body, size, color: th.ink, align: 'left', lineH: 1.3, weight: 400 }, o));
    },
    rect(x, y, w, h, o = {}) { return b.add(Object.assign({ type: 'rect', x, y, w, h, fill: null, stroke: th.muted, strokeW: 2, radius: 0 }, o)); },
    ell(x, y, w, h, o = {}) { return b.add(Object.assign({ type: 'ellipse', x, y, w, h, fill: null, stroke: th.muted, strokeW: 2 }, o)); },
    line(x, y, w, o = {}) { return b.add(Object.assign({ type: 'line', x, y: y - 6, w, h: 12, stroke: th.muted, strokeW: 2 }, o)); },
    lines(x, y, w, h, o = {}) { return b.add(Object.assign({ type: 'lines', x, y, w, h: Math.max(h, 10), style: 'lines', gap: 44, stroke: th.muted, strokeW: 1.5 }, o)); },
    grid(x, y, w, h, rows, cols, o = {}) { return b.add(Object.assign({ type: 'grid', x, y, w, h, rows, cols, cell: 'box', stroke: th.muted, strokeW: 1.5, fill: null }, o)); },
    check(x, y, s, o = {}) { return b.add(Object.assign({ type: 'check', x, y, w: s, h: s, stroke: th.accent, strokeW: 2.5, radius: s * 0.25, fill: null }, o)); },
    label(x, y, w, t, o = {}) { return b.text(x, y, w, t, Object.assign({ size: 18, letter: 3.5, caps: true, weight: 600, color: th.accent }, o)); },
    photo(x, y, w, h, o = {}) { return b.add(Object.assign({ type: 'photo', x, y, w, h, asset: null, shape: 'rect', radius: 0, fill: th.accent2, fx: null, zoom: 1, ox: 0, oy: 0 }, o)); },
  };
  return b;
}

function mkPage(b, extra = {}) { return Object.assign({ id: uid(), bg: b.th.bg, pattern: null, items: b.items }, extra); }

function header(b, title, sub, o = {}) {
  const th = b.th; let y = b.T;
  if (sub) { b.text(b.L, y, b.CW, sub, { font: th.script, size: 40, color: th.accent, lineH: 1.1 }); y += 50; }
  const size = o.size || 76;
  b.text(b.L, y, b.CW, title, { font: th.head, size, color: th.ink, lineH: 1.1 });
  y += size * 1.15 + 12;
  b.line(b.L, y, b.CW, { stroke: th.accent, strokeW: 2 });
  return y + 32;
}
function dateCorner(b, txt = 'date  ____ / ____ / ____') {
  b.text(b.R - 360, b.T + 12, 360, txt, { size: 19, align: 'right', color: b.th.ink, opacity: 0.75 });
}
function checks(b, x, y, w, n, gap = 48) {
  for (let i = 0; i < n; i++) {
    b.check(x, y + i * gap + gap / 2 - 13, 26);
    b.line(x + 42, y + (i + 1) * gap - 8, w - 42);
  }
  return y + n * gap;
}
function section(b, x, y, w, title, n, gap = 44) {
  b.label(x, y, w, title);
  b.lines(x, y + 30, w, n * gap, { gap });
  return y + 30 + n * gap + 30;
}

// ---------- templates ----------
function tCover(W, H, th, o = {}) {
  const b = builder(W, H, th, o); const { L, PH } = b; const CW = b.CW;
  b.ell(560, -140, 600, 600, { fill: th.accent2, stroke: null });
  b.ell(-180, PH - 440, 500, 500, { fill: th.accent2, stroke: null, opacity: 0.85 });
  b.ell(720, PH * 0.64, 150, 150, { fill: th.accent3, stroke: null, opacity: 0.35 });
  b.ell(130, PH * 0.16, 70, 70, { fill: th.accent, stroke: null, opacity: 0.25 });
  b.add({ type: 'sparkle', x: 170, y: PH * 0.26, w: 60, h: 60, fill: th.accent, stroke: null });
  b.add({ type: 'sparkle', x: 790, y: PH * 0.47, w: 40, h: 40, fill: th.accent3, stroke: null });
  b.add({ type: 'sparkle', x: 230, y: PH * 0.62, w: 28, h: 28, fill: th.accent, stroke: null });
  const cy = PH * 0.35;
  b.text(L, cy, CW, o.kicker || 'my', { font: th.script, size: 90, color: th.accent, align: 'center', lineH: 1 });
  b.text(L, cy + 92, CW, o.title || 'Planner', { font: th.head, size: 150, align: 'center', lineH: 1 });
  b.text(L, cy + 280, CW, o.sub || String(o.year || new Date().getFullYear()), { size: 30, letter: 14, align: 'center', weight: 600, caps: true });
  b.text(L, PH - 250, CW, 'this belongs to', { size: 18, letter: 5, caps: true, align: 'center', color: th.accent, weight: 600 });
  b.line(L + CW / 2 - 200, PH - 180, 400, { stroke: th.ink, strokeW: 1.5 });
  return mkPage(b);
}

function tIndex(W, H, th, o = {}) {
  const b = builder(W, H, th, o);
  const y0 = header(b, 'Contents', 'welcome');
  const entries = o.entries || [];
  const rowH = Math.min(62, (b.B - y0) / Math.max(1, entries.length));
  entries.forEach((e, i) => {
    const y = y0 + i * rowH;
    b.rect(b.L, y, b.CW, rowH, { stroke: null, link: e.page });
    b.text(b.L, y + rowH / 2 - 17, b.CW - 120, e.label, { font: th.head, size: 30, link: e.page });
    b.line(b.L, y + rowH - 4, b.CW, { stroke: th.muted, strokeW: 1, dash: true });
    b.text(b.R - 120, y + rowH / 2 - 13, 120, '→', { size: 24, align: 'right', color: th.accent, link: e.page });
  });
  return mkPage(b);
}

function tMonthly(W, H, th, o = {}) {
  const b = builder(W, H, th, o);
  const now = new Date();
  const year = o.year ?? now.getFullYear(), m = o.month ?? now.getMonth();
  const y0 = header(b, MONTHS[m], String(year));
  const CW = b.CW, cw = CW / 7, notesH = 230;
  const gridTop = y0 + 44, gridH = b.B - notesH - gridTop, ch = gridH / 6;
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  labels.forEach((l, c) => b.label(b.L + c * cw, y0 + 6, cw, l, { align: 'center', letter: 3 }));
  b.rect(b.L, gridTop, cw, gridH, { fill: th.accent2, stroke: null, opacity: 0.55 });
  b.rect(b.L + 6 * cw, gridTop, cw, gridH, { fill: th.accent2, stroke: null, opacity: 0.55 });
  b.grid(b.L, gridTop, CW, gridH, 6, 7, { cell: 'box' });
  const first = new Date(year, m, 1).getDay(), days = new Date(year, m + 1, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const idx = first + d - 1, r = Math.floor(idx / 7) % 6, c = idx % 7;
    b.text(b.L + c * cw + 10, gridTop + r * ch + 8, 60, d, { font: th.head, size: 22 });
  }
  const ny = b.B - notesH + 34;
  b.label(b.L, ny, 300, 'Focus this month');
  b.lines(b.L, ny + 26, CW, notesH - 66, { gap: 42 });
  return mkPage(b);
}

function tWeekly(W, H, th, o = {}) {
  const b = builder(W, H, th, o);
  const y0 = header(b, 'This Week', o.sub || 'plan your week');
  dateCorner(b, 'week of  ________________');
  const gx = 24, gy = 24, bw = (b.CW - gx) / 2, bh = (b.B - y0 - gy * 3) / 4;
  const names = [...WEEKDAYS, 'Priorities'];
  names.forEach((n, i) => {
    const x = b.L + (i % 2) * (bw + gx), y = y0 + Math.floor(i / 2) * (bh + gy);
    b.rect(x, y, bw, bh, { fill: i === 7 ? th.accent2 : th.paper, stroke: i === 7 ? null : th.muted, strokeW: 1.5, radius: 16 });
    b.label(x + 22, y + 18, bw - 44, n);
    if (i < 7) b.lines(x + 22, y + 46, bw - 44, bh - 60, { gap: 38 });
    else checks(b, x + 22, y + 44, bw - 44, Math.max(1, Math.floor((bh - 56) / 44)), 44);
  });
  return mkPage(b);
}

function tDaily(W, H, th, o = {}) {
  const b = builder(W, H, th, o);
  const y0 = header(b, 'Today', 'daily planner');
  dateCorner(b);
  const leftW = b.CW * 0.44, rx = b.L + leftW + 44, rw = b.CW - leftW - 44;
  b.label(b.L, y0, leftW, 'Schedule');
  const hours = 16, rowH = (b.B - y0 - 34) / hours;
  for (let i = 0; i < hours; i++) {
    const h = 6 + i, yy = y0 + 34 + i * rowH;
    const lbl = (h % 12 || 12) + (h < 12 ? ' am' : ' pm');
    b.text(b.L, yy + rowH - 30, 76, lbl, { size: 17, color: th.accent, weight: 600 });
    b.line(b.L + 84, yy + rowH - 6, leftW - 84, { strokeW: 1.5 });
  }
  let y = y0;
  b.label(rx, y, rw, 'Top three');
  b.rect(rx, y + 30, rw, 3 * 50 + 16, { fill: th.accent2, stroke: null, radius: 14 });
  checks(b, rx + 16, y + 38, rw - 32, 3, 50); y += 30 + 166 + 30;
  b.label(rx, y, rw, 'To do'); y = checks(b, rx, y + 26, rw, 7, 46) + 30;
  b.label(rx, y, rw, 'Water');
  for (let i = 0; i < 8; i++) b.add({ type: 'ellipse', x: rx + i * (rw / 8), y: y + 34, w: 34, h: 34, fill: null, stroke: th.accent, strokeW: 2 });
  y += 100;
  b.label(rx, y, rw, 'Notes');
  b.lines(rx, y + 26, rw, b.B - y - 26, { gap: 42 });
  return mkPage(b);
}

function tHabit(W, H, th, o = {}) {
  const b = builder(W, H, th, o);
  const y0 = header(b, 'Habit Tracker', o.sub || 'little by little');
  dateCorner(b, 'month  ________________');
  const nameW = 220, gw = b.CW - nameW, cw = gw / 31, rows = 14;
  b.label(b.L, y0, nameW, 'Habit');
  for (let d = 1; d <= 31; d++) b.text(b.L + nameW + (d - 1) * cw, y0 + 2, cw, d, { size: 13, align: 'center', color: th.accent, weight: 600 });
  const top = y0 + 36, rowH = Math.min(64, (b.B - top) / rows);
  for (let r = 0; r < rows; r++) b.line(b.L, top + (r + 1) * rowH - 10, nameW - 20, { strokeW: 1.5 });
  b.grid(b.L + nameW, top, gw, rows * rowH, rows, 31, { cell: 'circle', strokeW: 1.5 });
  return mkPage(b);
}

function tJournal(W, H, th, o = {}) {
  const b = builder(W, H, th, o);
  let y = header(b, o.title || 'Journal', o.sub || 'dear diary');
  dateCorner(b);
  b.label(b.L, y, b.CW, "Today I'm grateful for");
  for (let i = 0; i < 3; i++) b.text(b.L, y + 30 + i * 44 + 12, 30, (i + 1) + '.', { size: 20, color: th.accent, font: th.head });
  b.lines(b.L + 34, y + 30, b.CW - 34, 132, { gap: 44 }); y += 30 + 132 + 30;
  y = section(b, b.L, y, b.CW, 'Highlight of the day', 3);
  y = section(b, b.L, y, b.CW, 'Something I learned', 2);
  y = section(b, b.L, y, b.CW, 'Tomorrow I will', 2);
  const bh = Math.min(220, b.B - y);
  if (bh > 120) {
    b.rect(b.L, y, b.CW, bh, { fill: th.accent2, stroke: null, radius: 22 });
    b.text(b.L, y + 18, b.CW, 'affirmation', { font: th.script, size: 40, color: th.accent, align: 'center' });
    b.lines(b.L + 60, y + 70, b.CW - 120, Math.max(44, bh - 100), { gap: 44 });
  }
  return mkPage(b);
}

function tNotes(W, H, th, o = {}) {
  const b = builder(W, H, th, o);
  const y0 = header(b, o.title || 'Notes', o.sub || 'ideas & thoughts');
  dateCorner(b);
  const dots = o.style === 'dots';
  b.lines(b.L, y0, b.CW, b.B - y0, { gap: dots ? 38 : 46, style: dots ? 'dots' : 'lines', stroke: dots ? th.muted : th.muted, strokeW: dots ? 2 : 1.5 });
  return mkPage(b);
}

function tGoals(W, H, th, o = {}) {
  const b = builder(W, H, th, o);
  const y0 = header(b, 'Goals', 'dream big');
  const gap = 24, ch = (b.B - y0 - gap * 2) / 3;
  for (let i = 0; i < 3; i++) {
    const x = b.L, y = y0 + i * (ch + gap), w = b.CW;
    b.rect(x, y, w, ch, { fill: th.paper, stroke: th.muted, strokeW: 1.5, radius: 20 });
    b.text(x + 30, y + 26, 120, '0' + (i + 1), { font: th.head, size: 64, color: th.accent, lineH: 1 });
    const ix = x + 160, iw = w - 190;
    b.label(ix, y + 28, iw, 'Goal'); b.line(ix + 80, y + 50, iw - 80);
    b.label(ix, y + 82, iw, 'Why it matters'); b.line(ix + 200, y + 104, iw - 200);
    b.label(ix, y + 136, iw, 'Steps');
    checks(b, ix, y + 160, iw * 0.62, Math.max(1, Math.min(3, Math.floor((ch - 170) / 44))), 44);
    b.label(ix + iw * 0.68, y + 136, iw * 0.32, 'Deadline');
    b.line(ix + iw * 0.68, y + 196, iw * 0.32);
  }
  return mkPage(b);
}

function tPixels(W, H, th, o = {}) {
  const b = builder(W, H, th, o);
  const year = o.year || new Date().getFullYear();
  const y0 = header(b, 'Year in Pixels', String(year));
  const left = 44, gw = b.CW - left, cw = gw / 12, legendH = 90;
  'JFMAMJJASOND'.split('').forEach((l, i) => b.label(b.L + left + i * cw, y0, cw, l, { align: 'center', letter: 0 }));
  const top = y0 + 32, gh = b.B - legendH - top, rh = gh / 31;
  for (let d = 1; d <= 31; d++) b.text(b.L, top + (d - 1) * rh + rh / 2 - 9, 34, d, { size: 13, color: th.accent, align: 'right' });
  b.grid(b.L + left, top, gw, gh, 31, 12, { cell: 'square', strokeW: 1.5 });
  const moods = [['great', th.accent], ['good', th.accent3], ['okay', th.accent2], ['low', th.muted], ['rough', th.ink]];
  const lw = b.CW / 5;
  moods.forEach(([n, c], i) => {
    const x = b.L + i * lw, y = b.B - 48;
    b.rect(x, y, 30, 30, { fill: c, stroke: th.muted, strokeW: 1, radius: 7 });
    b.text(x + 42, y + 2, lw - 46, n, { size: 19 });
  });
  return mkPage(b);
}

function tReading(W, H, th, o = {}) {
  const b = builder(W, H, th, o);
  const y0 = header(b, 'Reading Log', 'currently reading');
  const cols = [['Title', 0.44], ['Author', 0.28], ['Rating', 0.2], ['Done', 0.08]];
  let x = b.L;
  const xs = cols.map(([n, f]) => { const cx = x; b.label(x, y0, b.CW * f, n); x += b.CW * f; return cx; });
  const top = y0 + 34, rowH = 68, rows = Math.floor((b.B - top) / rowH);
  b.lines(b.L, top, b.CW, rows * rowH, { gap: rowH });
  b.grid(xs[2], top, b.CW * 0.18, rows * rowH, rows, 5, { cell: 'star', stroke: th.accent, strokeW: 1.5 });
  b.grid(xs[3], top, b.CW * 0.08, rows * rowH, rows, 1, { cell: 'square', stroke: th.accent, strokeW: 2 });
  return mkPage(b);
}

function tBudget(W, H, th, o = {}) {
  const b = builder(W, H, th, o);
  const y0 = header(b, 'Monthly Budget', 'money matters');
  dateCorner(b, 'month  ________________');
  const gap = 24, cw = (b.CW - gap * 2) / 3;
  ['Income', 'Expenses', 'Saved'].forEach((n, i) => {
    const x = b.L + i * (cw + gap);
    b.rect(x, y0, cw, 130, { fill: th.accent2, stroke: null, radius: 18 });
    b.label(x + 22, y0 + 22, cw - 44, n);
    b.text(x + 22, y0 + 66, 30, '$', { font: th.head, size: 30, color: th.accent });
    b.line(x + 52, y0 + 100, cw - 80, { stroke: th.ink, strokeW: 1 });
  });
  const top = y0 + 170, colW = (b.CW - 40) / 2;
  [['Bills & expenses', 0], ['Savings & goals', 1]].forEach(([n, i]) => {
    const x = b.L + i * (colW + 40);
    b.label(x, top, colW, n);
    b.text(x + colW - 120, top, 120, 'amount', { size: 16, color: th.accent, align: 'right', caps: true, letter: 2 });
    b.lines(x, top + 30, colW, b.B - top - 30, { gap: 48 });
  });
  return mkPage(b);
}

function tVision(W, H, th, o = {}) {
  const b = builder(W, H, th, o);
  const y0 = header(b, 'Vision Board', o.sub || 'this year');
  const gap = 24, cols = 2, rows = 3, fw = (b.CW - gap) / cols, fh = (b.B - y0 - gap * 2) / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = b.L + c * (fw + gap), y = y0 + r * (fh + gap);
    b.photo(x, y, fw, fh, { radius: 18 });
    if ((r + c) % 2 === 0) b.add({ type: 'tape', x: x + fw / 2 - 80, y: y - 22, w: 160, h: 44, fill: th.accent3, pattern: 'stripes', opacity: 0.8, rot: (c ? 6 : -6) });
  }
  return mkPage(b);
}

function tCollage4(W, H, th, o = {}) {
  const b = builder(W, H, th, {});
  const m = 40, gap = 20, fw = (1000 - m * 2 - gap) / 2, fh = (b.PH - m * 2 - gap) / 2;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) b.photo(m + c * (fw + gap), m + r * (fh + gap), fw, fh, { radius: 12 });
  return mkPage(b, { bg: th.paper });
}
function tCollage3(W, H, th, o = {}) {
  const b = builder(W, H, th, {});
  const m = 40, gap = 20, PH = b.PH, bigH = (PH - m * 2 - gap) * 0.6, smH = PH - m * 2 - gap - bigH, sw = (1000 - m * 2 - gap) / 2;
  b.photo(m, m, 1000 - m * 2, bigH, { radius: 12 });
  b.photo(m, m + bigH + gap, sw, smH, { radius: 12 });
  b.photo(m + sw + gap, m + bigH + gap, sw, smH, { radius: 12 });
  return mkPage(b, { bg: th.paper });
}
function tQuote(W, H, th, o = {}) {
  const b = builder(W, H, th, {});
  const PH = b.PH;
  b.ell(-200, -200, 620, 620, { fill: th.accent2, stroke: null });
  b.ell(640, PH - 380, 560, 560, { fill: th.accent2, stroke: null, opacity: 0.8 });
  b.add({ type: 'sparkle', x: 780, y: 140, w: 70, h: 70, fill: th.accent, stroke: null });
  b.text(100, PH / 2 - 210, 800, 'gentle reminder', { font: th.script, size: 64, color: th.accent, align: 'center' });
  b.text(100, PH / 2 - 120, 800, 'Slow progress is still progress.', { font: th.head, size: 92, align: 'center', lineH: 1.15 });
  b.text(100, PH / 2 + 190, 800, 'your name', { size: 22, letter: 8, caps: true, align: 'center', weight: 600, color: th.accent });
  return mkPage(b);
}
function tBlank(W, H, th) { return mkPage(builder(W, H, th, {})); }

const TEMPLATES = [
  { id: 'cover', name: 'Cover', fn: tCover },
  { id: 'monthly', name: 'Monthly', fn: tMonthly },
  { id: 'weekly', name: 'Weekly', fn: tWeekly },
  { id: 'daily', name: 'Daily', fn: tDaily },
  { id: 'habit', name: 'Habit tracker', fn: tHabit },
  { id: 'journal', name: 'Journal', fn: tJournal },
  { id: 'notes', name: 'Lined notes', fn: (W, H, th, o) => tNotes(W, H, th, Object.assign({}, o, { style: 'lines' })) },
  { id: 'dots', name: 'Dot grid', fn: (W, H, th, o) => tNotes(W, H, th, Object.assign({}, o, { style: 'dots' })) },
  { id: 'goals', name: 'Goals', fn: tGoals },
  { id: 'pixels', name: 'Year in pixels', fn: tPixels },
  { id: 'reading', name: 'Reading log', fn: tReading },
  { id: 'budget', name: 'Budget', fn: tBudget },
  { id: 'vision', name: 'Vision board', fn: tVision },
  { id: 'collage4', name: 'Photo grid', fn: tCollage4 },
  { id: 'collage3', name: 'Feature collage', fn: tCollage3 },
  { id: 'quote', name: 'Quote post', fn: tQuote },
  { id: 'blank', name: 'Blank', fn: tBlank },
];
const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

// Side tabs that link to each month (for hyperlinked planners).
function addTabs(page, W, H, th, tabList, activeId) {
  const u = W / 1000, PH = H / u, x = 1000 - 50, top = 70, n = tabList.length;
  const tabH = (PH - 140) / n;
  tabList.forEach((t, i) => {
    const y = top + i * tabH, active = t.page === activeId;
    page.items.push({ id: uid(), tab: true, type: 'rect', x: x * u, y: (y + 2) * u, w: 50 * u, h: (tabH - 4) * u, rot: 0, opacity: 1, fill: active ? th.accent : th.accent2, stroke: null, strokeW: 0, radius: 10 * u, link: t.page });
    const tw = tabH - 4, size = Math.min(16, tw / 5);
    page.items.push({ id: uid(), tab: true, type: 'text', x: (x + 25 - tw / 2) * u, y: (y + tabH / 2 - size * 0.65) * u, w: tw * u, h: size * 1.3 * u, rot: 90, opacity: 1, text: t.label, font: th.body, size: size * u, color: active ? th.paper : th.ink, align: 'center', lineH: 1.3, weight: 600, caps: true, letter: 2 * u, link: t.page });
  });
}

// A full hyperlinked digital planner.
function buildPlanner(W, H, th, opts) {
  const year = opts.year, start = opts.startMonth, parts = opts.parts;
  const o = { tabs: true, year };
  const pages = [];
  const months = [];
  const sections = [];
  pages.push(tCover(W, H, th, { title: 'Planner', year: start === 0 ? year : year + '–' + String(year + 1).slice(2) }));
  const idxPos = pages.length;
  const add = (p, label, monthPage) => { p._month = monthPage; pages.push(p); if (label) sections.push({ label, page: p.id }); return p; };
  if (parts.goals) add(tGoals(W, H, th, o), 'Goals');
  if (parts.pixels) add(tPixels(W, H, th, o), 'Year in pixels');
  for (let i = 0; i < 12; i++) {
    const m = (start + i) % 12, y = year + Math.floor((start + i) / 12);
    const mp = tMonthly(W, H, th, Object.assign({}, o, { month: m, year: y }));
    add(mp, null, mp.id);
    months.push({ label: MONTHS[m].slice(0, 3), page: mp.id, full: MONTHS[m] + ' ' + y });
    if (parts.habit) add(tHabit(W, H, th, Object.assign({}, o, { sub: MONTHS[m].toLowerCase() })), null, mp.id);
    if (parts.weekly) add(tWeekly(W, H, th, Object.assign({}, o, { sub: MONTHS[m].toLowerCase() })), null, mp.id);
    if (parts.daily) add(tDaily(W, H, th, o), null, mp.id);
  }
  if (parts.journal) { add(tJournal(W, H, th, o), 'Journal'); for (let i = 0; i < 2; i++) add(tJournal(W, H, th, o)); }
  if (parts.reading) add(tReading(W, H, th, o), 'Reading log');
  if (parts.budget) add(tBudget(W, H, th, o), 'Budget');
  if (parts.vision) add(tVision(W, H, th, Object.assign({}, o, { sub: String(year) })), 'Vision board');
  add(tNotes(W, H, th, o), 'Notes'); add(tNotes(W, H, th, Object.assign({}, o, { style: 'dots' }))); add(tNotes(W, H, th, o));
  // Contents: goals / year in pixels, then the months, then everything else.
  const pre = sections.filter((s) => s.label === 'Goals' || s.label === 'Year in pixels');
  const post = sections.filter((s) => !pre.includes(s));
  const ordered = [...pre, ...months.map((m) => ({ label: m.full, page: m.page })), ...post];
  const index = tIndex(W, H, th, Object.assign({}, o, { entries: ordered }));
  pages.splice(idxPos, 0, index);
  const tabList = [{ label: 'Index', page: index.id }, ...months];
  for (const p of pages.slice(1)) {
    addTabs(p, W, H, th, tabList, p === index ? index.id : p._month);
    delete p._month;
  }
  return pages;
}

function buildJournal(W, H, th, opts) {
  const pages = [tCover(W, H, th, { title: 'Journal', kicker: 'my', sub: opts.sub || String(new Date().getFullYear()) })];
  for (let i = 0; i < (opts.count || 10); i++) pages.push(tJournal(W, H, th, {}));
  pages.push(tGoals(W, H, th, {}), tVision(W, H, th, {}));
  for (let i = 0; i < 3; i++) pages.push(tNotes(W, H, th, { style: i === 1 ? 'dots' : 'lines' }));
  return pages;
}
