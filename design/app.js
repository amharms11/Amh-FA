'use strict';
// AMH Studio: editor UI, storage and export.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const deep = (o) => JSON.parse(JSON.stringify(o));

// ---------------- storage (IndexedDB, with in-memory fallback) ----------------
const DB = {
  db: null, mem: { projects: new Map(), meta: new Map() },
  async open() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('amh-studio', 1);
        r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('projects', { keyPath: 'id' }); d.createObjectStore('meta', { keyPath: 'id' }); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    } catch (e) { this.db = null; toast('Storage is unavailable here: designs will not be kept after closing.'); }
  },
  req(store, mode, fn) {
    if (!this.db) { return Promise.resolve(fn(null)); }
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode), r = fn(t.objectStore(store));
      t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  get(s, id) { return this.db ? this.req(s, 'readonly', (st) => st.get(id)) : Promise.resolve(this.mem[s].get(id)); },
  put(s, v) { return this.db ? this.req(s, 'readwrite', (st) => st.put(v)) : Promise.resolve(this.mem[s].set(v.id, v)); },
  del(s, id) { return this.db ? this.req(s, 'readwrite', (st) => st.delete(id)) : Promise.resolve(this.mem[s].delete(id)); },
  all(s) { return this.db ? this.req(s, 'readonly', (st) => st.getAll()) : Promise.resolve([...this.mem[s].values()]); },
};

// ---------------- state ----------------
let P = null;           // current project {id,name,w,h,theme,pages,assets}
let pi = 0;             // page index
let sel = null;         // selected item id
let tool = null;        // open sheet
let zoom = 1, view = 1, dprEff = 1;
const hist = { undo: [], redo: [] };
let saveTimer = null;

const stage = $('#stage'), sctx = stage.getContext('2d'), wrap = $('#stageWrap');
const page = () => P.pages[pi];
const selItem = () => (sel && page().items.find((i) => i.id === sel)) || null;
const theme = () => THEMES[P.theme] || THEMES.minimal;
const U = () => P.w / 1000; // template unit in px

Render.setOnAsync(() => { requestRender(); });

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------------- history ----------------
function snap(kind, i = pi) { return kind === 'all' ? { kind, pi, json: JSON.stringify(P.pages) } : { kind, i, json: JSON.stringify(P.pages[i]) }; }
function cp(kind = 'page') {
  hist.undo.push(snap(kind)); if (hist.undo.length > 60) hist.undo.shift();
  hist.redo.length = 0; updUndo();
}
function restore(e) {
  if (e.kind === 'all') { P.pages = JSON.parse(e.json); pi = clamp(e.pi, 0, P.pages.length - 1); }
  else { P.pages[e.i] = JSON.parse(e.json); pi = e.i; }
  if (!selItem()) sel = null;
  changed();
  if (tool && tool !== 'props') openTool(tool); else refreshProps();
}
function undo() { const e = hist.undo.pop(); if (!e) return; hist.redo.push(snap(e.kind, e.kind === 'all' ? pi : e.i)); restore(e); }
function redo() { const e = hist.redo.pop(); if (!e) return; hist.undo.push(snap(e.kind, e.kind === 'all' ? pi : e.i)); restore(e); }
function updUndo() { $('#undoBtn').disabled = !hist.undo.length; $('#redoBtn').disabled = !hist.redo.length; }

function changed() {
  requestRender(); updPagebar(); updUndo();
  clearTimeout(saveTimer); saveTimer = setTimeout(saveProject, 700);
}

async function saveProject() {
  if (!P) return;
  clearTimeout(saveTimer);
  P.updated = Date.now();
  try {
    await DB.put('projects', P);
    const t = Render.pageCanvas(P.pages[0], P.w, P.h, 260 / Math.max(P.w, P.h), {});
    await DB.put('meta', { id: P.id, name: P.name, updated: P.updated, pages: P.pages.length, w: P.w, h: P.h, thumb: t.toDataURL('image/jpeg', 0.8) });
  } catch (e) { console.error(e); toast('Could not save: your device may be out of space.'); }
}

// ---------------- rendering ----------------
let rq = false;
function requestRender() { if (!rq) { rq = true; requestAnimationFrame(() => { rq = false; render(); }); } }
let guides = [];

function layoutStage() {
  if (!P) return;
  const aw = Math.max(50, wrap.clientWidth - 36), ah = Math.max(50, wrap.clientHeight - 36);
  const fit = Math.min(aw / P.w, ah / P.h);
  view = fit * zoom;
  const cw = P.w * view, ch = P.h * view;
  let dpr = Math.min(window.devicePixelRatio || 1, 3);
  const maxPx = 14e6; if (cw * ch * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (cw * ch));
  dprEff = dpr;
  stage.style.width = cw + 'px'; stage.style.height = ch + 'px';
  stage.width = Math.round(cw * dpr); stage.height = Math.round(ch * dpr);
  $('#zoomLabel').textContent = zoom === 1 ? 'Fit' : Math.round(zoom * 100) + '%';
  render();
}

function render() {
  if (!P) return;
  Render.setAssets(P.assets);
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, stage.width, stage.height);
  Render.drawPage(sctx, page(), P.w, P.h, view, { dpr: dprEff, editor: true });
  // overlay
  const s = view * dprEff;
  sctx.save(); sctx.setTransform(s, 0, 0, s, 0, 0);
  const px = 1 / view;
  if (guides.length) {
    sctx.strokeStyle = '#e0457b'; sctx.lineWidth = px; sctx.setLineDash([4 * px, 4 * px]);
    for (const g of guides) { sctx.beginPath(); if (g.v != null) { sctx.moveTo(g.v, 0); sctx.lineTo(g.v, P.h); } else { sctx.moveTo(0, g.h); sctx.lineTo(P.w, g.h); } sctx.stroke(); }
    sctx.setLineDash([]);
  }
  const it = selItem();
  if (it) {
    sctx.save();
    sctx.translate(it.x + it.w / 2, it.y + it.h / 2); sctx.rotate((it.rot || 0) * Math.PI / 180);
    sctx.strokeStyle = '#8b5cf6'; sctx.lineWidth = 1.6 * px;
    sctx.strokeRect(-it.w / 2, -it.h / 2, it.w, it.h);
    if (!it.locked) {
      for (const [k, [hx, hy]] of Object.entries(handleLocal(it))) {
        if (k === 'rot') {
          sctx.beginPath(); sctx.moveTo(0, -it.h / 2); sctx.lineTo(hx, hy + 9 * px); sctx.stroke();
          sctx.beginPath(); sctx.arc(hx, hy, 9 * px, 0, Math.PI * 2); sctx.fillStyle = '#fff'; sctx.fill(); sctx.stroke();
          sctx.beginPath(); sctx.arc(hx, hy, 4 * px, -Math.PI * 0.9, Math.PI * 0.4); sctx.stroke();
        } else if (k === 'e' || k === 'w' || k === 'n' || k === 's') {
          const vert = k === 'e' || k === 'w';
          const w = (vert ? 6 : 18) * px, h = (vert ? 18 : 6) * px;
          Render.rrect(sctx, hx - w / 2, hy - h / 2, w, h, 3 * px); sctx.fillStyle = '#fff'; sctx.fill(); sctx.stroke();
        } else {
          sctx.beginPath(); sctx.arc(hx, hy, 7 * px, 0, Math.PI * 2); sctx.fillStyle = '#fff'; sctx.fill(); sctx.stroke();
        }
      }
    }
    if (it.locked) { sctx.font = `${14 * px}px system-ui`; sctx.fillStyle = '#8b5cf6'; sctx.fillText('🔒', -it.w / 2, -it.h / 2 - 6 * px); }
    sctx.restore();
  }
  sctx.restore();
}

// ---------------- geometry ----------------
function rotV(x, y, deg) { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return { x: x * c - y * s, y: x * s + y * c }; }
function center(it) { return { x: it.x + it.w / 2, y: it.y + it.h / 2 }; }
function toLocal(it, p) { const c = center(it); return rotV(p.x - c.x, p.y - c.y, -(it.rot || 0)); }
function toWorld(it, lx, ly) { const c = center(it), v = rotV(lx, ly, it.rot || 0); return { x: c.x + v.x, y: c.y + v.y }; }
function hitItem(it, p) {
  const l = toLocal(it, p), tol = 4 / view;
  const hh = Math.max(it.h / 2, ['line', 'text'].includes(it.type) ? 14 / view : 0);
  return Math.abs(l.x) <= it.w / 2 + tol && Math.abs(l.y) <= hh + tol;
}
function handleLocal(it) {
  const hw = it.w / 2, hh = it.h / 2, px = 1 / view, H = {};
  const t = it.type;
  if (t !== 'line') Object.assign(H, { nw: [-hw, -hh], ne: [hw, -hh], sw: [-hw, hh], se: [hw, hh] });
  if (t !== 'sticker') { H.e = [hw, 0]; H.w = [-hw, 0]; }
  if (!['text', 'line', 'sticker'].includes(t)) { H.n = [0, -hh]; H.s = [0, hh]; }
  H.rot = [0, -hh - 30 * px];
  // On small items drop the edge handles so corners stay grabbable.
  if (it.w * view < 60) { delete H.n; delete H.s; }
  if (it.h * view < 60 && t !== 'line' && t !== 'text') { delete H.e; delete H.w; }
  return H;
}
const HSIGN = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1], e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1] };
function handleAt(it, p) {
  const l = toLocal(it, p), r = 18 / view;
  let best = null, bd = r;
  for (const [k, [hx, hy]] of Object.entries(handleLocal(it))) {
    const d = Math.hypot(l.x - hx, l.y - hy);
    if (d <= bd) { bd = d; best = k; }
  }
  return best;
}
function pagePoint(e) { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / view, y: (e.clientY - r.top) / view }; }

// ---------------- pointer interaction ----------------
const pointers = new Map();
let drag = null, lastTap = { t: 0, id: null };

stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    drag = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: zoom, committed: drag && drag.committed };
    return;
  }
  const p = pagePoint(e);
  const cur = selItem();
  if (cur && !cur.locked) {
    const h = handleAt(cur, p);
    if (h) { startHandle(cur, h, p); return; }
  }
  const items = page().items;
  let hit = null;
  for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (!it.locked && !it.hidden && hitItem(it, p)) { hit = it; break; } }
  if (!hit && cur && cur.locked && hitItem(cur, p)) hit = cur;
  if (hit) {
    const was = sel; sel = hit.id;
    if (was !== sel) onSelect();
    drag = { mode: hit.locked ? 'none' : 'move', it: hit, p0: p, o: { x: hit.x, y: hit.y }, moved: false, sx: e.clientX, sy: e.clientY };
  } else {
    if (sel) { sel = null; onSelect(); }
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop, moved: false };
  }
  requestRender();
});

function startHandle(it, h, p) {
  if (h === 'rot') { drag = { mode: 'rot', it, moved: false }; return; }
  const [sx, sy] = HSIGN[h];
  const F = toWorld(it, -sx * it.w / 2, -sy * it.h / 2);
  drag = { mode: 'resize', it, h, sx, sy, F, o: { ...it }, moved: false };
}

stage.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!drag) return;
  if (drag.mode === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const nz = clamp(drag.z0 * d / drag.d0, 0.5, 6);
    if (Math.abs(nz - zoom) > 0.02) { zoom = nz; layoutStage(); }
    return;
  }
  const p = pagePoint(e);
  if (drag.mode === 'pan') {
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    wrap.scrollLeft = drag.sl - dx; wrap.scrollTop = drag.st - dy;
    return;
  }
  const it = drag.it; if (!it) return;
  if (!drag.moved) {
    if (drag.mode === 'move' && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
    if (drag.mode === 'none') return;
    cp(); drag.moved = true;
  }
  if (drag.mode === 'move') {
    let nx = drag.o.x + (p.x - drag.p0.x), ny = drag.o.y + (p.y - drag.p0.y);
    guides = [];
    const snap = 7 / view;
    const cx = nx + it.w / 2, cy = ny + it.h / 2;
    if (Math.abs(cx - P.w / 2) < snap) { nx = P.w / 2 - it.w / 2; guides.push({ v: P.w / 2 }); }
    if (Math.abs(cy - P.h / 2) < snap) { ny = P.h / 2 - it.h / 2; guides.push({ h: P.h / 2 }); }
    it.x = nx; it.y = ny;
  } else if (drag.mode === 'rot') {
    const c = center(it);
    let a = Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI + 90;
    a = ((a % 360) + 360) % 360;
    for (const t of [0, 90, 180, 270, 360]) if (Math.abs(a - t) < 4) a = t % 360;
    it.rot = Math.round(a * 10) / 10;
  } else if (drag.mode === 'resize') {
    const { sx, sy, F, o } = drag;
    const v = rotV(p.x - F.x, p.y - F.y, -(o.rot || 0));
    const min = 8;
    let nw = sx ? Math.max(min, sx * v.x) : o.w;
    let nh = sy ? Math.max(min, sy * v.y) : o.h;
    const keep = sx && sy && ['photo', 'sticker', 'text', 'star', 'heart', 'sparkle'].includes(it.type);
    if (keep) { const k = Math.max(nw / o.w, nh / o.h); nw = o.w * k; nh = o.h * k; }
    // F is the fixed point (opposite corner/edge); the new centre sits half the new size away from it.
    const cc = rotV(sx * nw / 2, sy * nh / 2, o.rot || 0);
    const C = { x: F.x + cc.x, y: F.y + cc.y };
    if (it.type === 'text' && sx && sy) { const k = nw / o.w; it.size = Math.max(4, o.size * k); if (o.letter) it.letter = o.letter * k; }
    it.w = nw; it.h = nh; it.x = C.x - nw / 2; it.y = C.y - nh / 2;
  }
  requestRender();
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!drag) return;
  if (drag.mode === 'pinch') { if (pointers.size === 0) drag = null; return; }
  const d = drag; drag = null; guides = [];
  if (d.moved) { changed(); refreshProps(); return; }
  // tap
  if (d.it) {
    const now = Date.now();
    if (now - lastTap.t < 350 && lastTap.id === d.it.id) onDoubleTap(d.it);
    else if (d.it.type === 'photo' && !d.it.asset && !d.it.locked) pickPhoto(d.it.id);
    lastTap = { t: now, id: d.it.id };
  }
  requestRender();
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);

function onDoubleTap(it) {
  if (it.type === 'text') { openTool('props'); setTimeout(() => { const ta = $('#propText'); if (ta) { ta.focus(); ta.select(); } }, 60); }
  else if (it.type === 'photo') pickPhoto(it.id);
}

function onSelect() {
  if (sel) openTool('props');
  else if (tool === 'props') closeSheet();
  if (tool === 'layers') openTool('layers');
}

// keyboard (desktop)
document.addEventListener('keydown', (e) => {
  if ($('#editor').classList.contains('hidden')) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  const it = selItem();
  if (!it) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delItem(); }
  else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); dupItem(); }
  else if (e.key.startsWith('Arrow') && !it.locked) {
    e.preventDefault(); cp();
    const st = (e.shiftKey ? 10 : 1) * U() * 2;
    if (e.key === 'ArrowLeft') it.x -= st; if (e.key === 'ArrowRight') it.x += st;
    if (e.key === 'ArrowUp') it.y -= st; if (e.key === 'ArrowDown') it.y += st;
    changed();
  } else if (e.key === 'Escape') { sel = null; onSelect(); requestRender(); }
});

// ---------------- item operations ----------------
function addItem(o, { select = true } = {}) {
  cp();
  const it = Object.assign({ id: uid(), rot: 0, opacity: 1 }, o);
  // place in view centre if not positioned
  if (it.x == null) { it.x = (P.w - it.w) / 2; it.y = (P.h - it.h) / 2; }
  page().items.push(it);
  if (select) { sel = it.id; openTool('props'); }
  changed();
  return it;
}
function delItem() { const it = selItem(); if (!it) return; cp(); page().items = page().items.filter((i) => i.id !== it.id); sel = null; closeSheet(); changed(); }
function dupItem() {
  const it = selItem(); if (!it) return; cp();
  const c = deep(it); c.id = uid(); c.x += 24 * U(); c.y += 24 * U(); c.locked = false; delete c.tab;
  page().items.splice(page().items.indexOf(it) + 1, 0, c); sel = c.id; changed(); refreshProps();
}
function arrange(dir) {
  const it = selItem(); if (!it) return; cp();
  const a = page().items, i = a.indexOf(it); a.splice(i, 1);
  const j = dir === 'front' ? a.length : dir === 'back' ? 0 : dir === 'up' ? Math.min(a.length, i + 1) : Math.max(0, i - 1);
  a.splice(j, 0, it); changed();
  if (tool === 'layers') openTool('layers');
}
function setProp(k, v, { commit = true } = {}) {
  const it = selItem(); if (!it) return;
  if (commit) cp();
  it[k] = v; changed();
}

// ---------------- photos ----------------
let photoTarget = null;
function pickPhoto(targetId = null) { photoTarget = targetId; const f = $('#photoFile'); f.value = ''; f.click(); }
$('#photoFile').addEventListener('change', async (e) => {
  const files = [...e.target.files]; if (!files.length) return;
  toast('Adding photo…', 1200);
  let first = true;
  for (const file of files) {
    try {
      const { data, w, h } = await loadPhoto(file);
      const id = 'a' + uid(); P.assets[id] = data; Render.setAssets(P.assets);
      const tgt = first && photoTarget && page().items.find((i) => i.id === photoTarget);
      if (tgt) { cp(); tgt.asset = id; tgt.fx = null; tgt.zoom = 1; tgt.ox = 0; tgt.oy = 0; sel = tgt.id; changed(); openTool('props'); }
      else {
        const maxW = P.w * 0.6, maxH = P.h * 0.5, s = Math.min(maxW / w, maxH / h);
        const iw = w * s, ih = h * s, off = first ? 0 : 30 * U();
        addItem({ type: 'photo', asset: id, x: (P.w - iw) / 2 + off, y: (P.h - ih) / 2 + off, w: iw, h: ih, shape: 'rect', radius: 0, fx: null, zoom: 1, ox: 0, oy: 0 });
      }
    } catch (err) { console.error(err); toast('That photo could not be opened.'); }
    first = false;
  }
  photoTarget = null;
  saveProject();
});
function loadPhoto(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const max = 2200, s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const png = /png|gif|webp/.test(file.type);
      res({ data: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), w: c.width, h: c.height });
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    im.src = url;
  });
}

// ---------------- sheet / tools ----------------
function openTool(name) {
  tool = name;
  $$('#toolbar button').forEach((b) => b.classList.toggle('on', b.dataset.tool === name));
  const sheet = $('#sheet'); sheet.classList.remove('hidden');
  const body = $('#sheetBody'); body.innerHTML = '';
  const titles = { templates: 'Templates', text: 'Text', elements: 'Elements', stickers: 'Stickers', photos: 'Photos', background: 'Page', layers: 'Layers', pages: 'Pages', props: 'Edit' };
  $('#sheetTitle').textContent = titles[name] || '';
  (TOOLS[name] || (() => {}))(body);
  requestAnimationFrame(layoutStage);
}
function closeSheet() {
  tool = null; $('#sheet').classList.add('hidden');
  $$('#toolbar button').forEach((b) => b.classList.remove('on'));
  requestAnimationFrame(layoutStage);
}
function refreshProps() { if (tool === 'props') { const st = $('#sheetBody').scrollTop; openTool('props'); $('#sheetBody').scrollTop = st; } }
$('#sheetClose').onclick = () => { if (tool === 'props') { sel = null; requestRender(); } closeSheet(); };
$$('#toolbar button').forEach((b) => b.onclick = () => { if (tool === b.dataset.tool && innerWidth < 900) closeSheet(); else { if (b.dataset.tool !== 'layers') { sel = null; requestRender(); } openTool(b.dataset.tool); } });

function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
function sec(body, title) { body.appendChild(el(`<div class="sec">${esc(title)}</div>`)); }

function paletteColors() {
  const th = theme();
  const set = [th.ink, th.accent, th.accent3, th.accent2, th.muted, th.paper, th.bg, '#FFFFFF', '#000000', '#E9C46A', '#F4A261', '#E76F51', '#2A9D8F', '#A8DADC', '#F7CAD0', '#CDB4DB'];
  return [...new Set(set.map((c) => c.toUpperCase()))];
}
function swatches(cur, onPick, { none = false } = {}) {
  const w = el('<div class="swatches"></div>');
  if (none) { const b = el(`<button class="sw none ${!cur ? 'on' : ''}" aria-label="None"></button>`); b.onclick = () => onPick(null); w.appendChild(b); }
  for (const c of paletteColors()) {
    const b = el(`<button class="sw ${cur && cur.toUpperCase() === c ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`);
    b.onclick = () => onPick(c); w.appendChild(b);
  }
  const inp = el(`<input type="color" class="sw-input" aria-label="Custom colour" value="${/^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#888888'}">`);
  let started = false;
  inp.oninput = () => { if (!started) { cp(); started = true; } const it = selItem(); onPick(inp.value, true, it); };
  inp.onchange = () => { started = false; };
  w.appendChild(inp);
  return w;
}
function range(label, min, max, step, val, onInput, fmt = (v) => v) {
  const f = el(`<label class="field"><span>${esc(label)}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><output>${fmt(val)}</output></label>`);
  const r = $('input', f), o = $('output', f);
  let started = false;
  r.oninput = () => { if (!started) { cp(); started = true; } const v = +r.value; o.textContent = fmt(v); onInput(v); requestRender(); };
  r.onchange = () => { started = false; changed(); };
  return f;
}
function btns(list) {
  const w = el('<div class="btns"></div>');
  for (const [label, fn, on] of list) { const b = el(`<button class="${on ? 'on' : ''}">${label}</button>`); b.onclick = fn; w.appendChild(b); }
  return w;
}
function pickColor(k) { return (c, live) => { const it = selItem(); if (!it) return; if (!live) cp(); it[k] = c; changed(); if (!live) refreshProps(); }; }

// thumbnails of an item/page into a small canvas
function miniCanvas(pg, W, H, width) {
  Render.setAssets(P.assets);
  const c = Render.pageCanvas(pg, W, H, (width * 2) / W, {});
  return c;
}

const TOOLS = {};

TOOLS.templates = (body) => {
  sec(body, 'Theme');
  const tw = el('<div class="themes"></div>');
  for (const [id, th] of Object.entries(THEMES)) {
    const b = el(`<button class="theme ${P.theme === id ? 'on' : ''}"><span class="chips">${['bg', 'accent2', 'accent', 'accent3', 'ink'].map((k) => `<i style="background:${th[k]}"></i>`).join('')}</span>${th.name}</button>`);
    b.onclick = () => restyle(id); tw.appendChild(b);
  }
  body.appendChild(tw);
  body.appendChild(el('<p class="fine" style="margin:6px 0 0">Tap a theme to recolour every page and change its fonts.</p>'));
  sec(body, 'Add a page');
  const tiles = el('<div class="tiles"></div>');
  const hasTabs = page().items.some((i) => i.tab);
  const opts = { year: new Date().getFullYear(), tabs: hasTabs };
  const list = TEMPLATES.slice();
  let i = 0;
  const addTile = () => {
    const t = list[i++]; if (!t) return;
    const pg = t.fn(P.w, P.h, theme(), opts);
    const tile = el(`<button class="tile"></button>`);
    tile.appendChild(miniCanvas(pg, P.w, P.h, 84));
    tile.appendChild(el(`<span>${esc(t.name)}</span>`));
    tile.onclick = () => insertTemplate(t);
    tiles.appendChild(tile);
    setTimeout(addTile, 0);
  };
  body.appendChild(tiles);
  addTile();
};

function insertTemplate(t) {
  cp('all');
  const hasTabs = page().items.some((i) => i.tab);
  const pg = t.fn(P.w, P.h, theme(), { year: new Date().getFullYear(), tabs: hasTabs });
  if (hasTabs) for (const it of page().items.filter((i) => i.tab)) { const c = deep(it); c.id = uid(); pg.items.push(c); }
  P.pages.splice(pi + 1, 0, pg); pi++; sel = null;
  changed(); toast(`${t.name} page added`);
}

function restyle(id) {
  const from = theme(), to = THEMES[id];
  if (!to || id === P.theme) return;
  cp('all');
  const cmap = {}, fmap = {};
  for (const k of THEME_COLOR_KEYS) cmap[from[k].toUpperCase()] = to[k];
  for (const k of THEME_FONT_KEYS) fmap[from[k]] = to[k];
  const mc = (c) => (c && cmap[String(c).toUpperCase()]) || c;
  for (const pg of P.pages) {
    pg.bg = mc(pg.bg);
    if (pg.pattern) pg.pattern.stroke = mc(pg.pattern.stroke);
    for (const it of pg.items) {
      it.fill = mc(it.fill); it.stroke = mc(it.stroke); it.color = mc(it.color);
      if (it.font && fmap[it.font]) it.font = fmap[it.font];
    }
  }
  P.theme = id; changed(); openTool('templates');
}

TOOLS.text = (body) => {
  const th = theme(), u = U();
  const presets = [
    ['Add a heading', { font: th.head, size: 80, weight: 400, text: 'Heading' }, `font-family:'${th.head}';font-size:26px`],
    ['Add a script accent', { font: th.script, size: 64, color: th.accent, text: 'something lovely' }, `font-family:'${th.script}';font-size:24px;color:${th.accent}`],
    ['SPACED SUBHEADING', { font: th.body, size: 26, weight: 600, caps: true, letter: 7, color: th.accent, text: 'Subheading' }, `font-family:'${th.body}';font-size:13px;letter-spacing:.3em;font-weight:600`],
    ['Add body text', { font: th.body, size: 28, text: 'Write something here. Double-tap to edit.' }, `font-family:'${th.body}';font-size:15px`],
    ['“A quote, in italics”', { font: th.head, size: 44, italic: true, align: 'center', text: '“Make it simple, but significant.”' }, `font-family:'${th.head}';font-style:italic;font-size:18px`],
    ['☐ Checklist', { font: th.body, size: 28, lineH: 1.7, text: '☐  First thing\n☐  Second thing\n☐  Third thing' }, `font-family:'${th.body}';font-size:15px`],
  ];
  const w = el('<div class="text-presets"></div>');
  for (const [label, o, css] of presets) {
    const b = el(`<button style="${css}">${esc(label)}</button>`);
    b.onclick = () => {
      const width = Math.min(P.w * 0.8, Math.max(300, o.size * 10) * u);
      addItem(Object.assign({ type: 'text', w: width, h: o.size * u * 1.3, color: th.ink, align: 'left', lineH: 1.25, weight: 400 }, o, { size: o.size * u, letter: (o.letter || 0) * u }));
    };
    w.appendChild(b);
  }
  body.appendChild(w);
  sec(body, 'Font pairings');
  const pairs = Object.values(THEMES).map((t) => [t.head, t.body]).filter((p, i, a) => a.findIndex((q) => q[0] === p[0] && q[1] === p[1]) === i);
  const pw = el('<div class="text-presets"></div>');
  for (const [h, b2] of pairs) {
    const b = el(`<button><div style="font-family:'${h}';font-size:22px">${esc(h)}</div><div style="font-family:'${b2}';font-size:13px;opacity:.75">paired with ${esc(b2)}</div></button>`);
    b.onclick = () => {
      const x = (P.w - 600 * u) / 2, y = P.h * 0.4;
      cp();
      const a = { id: uid(), type: 'text', x, y, w: 600 * u, h: 90 * u, text: 'Title text', font: h, size: 72 * u, color: th.ink, align: 'center', lineH: 1.15, weight: 400, rot: 0, opacity: 1 };
      const c = { id: uid(), type: 'text', x, y: y + 100 * u, w: 600 * u, h: 40 * u, text: 'a little supporting line', font: b2, size: 26 * u, color: th.accent, align: 'center', lineH: 1.3, weight: 400, rot: 0, opacity: 1, letter: 2 * u };
      page().items.push(a, c); sel = a.id; changed(); openTool('props');
    };
    pw.appendChild(b);
  }
  body.appendChild(pw);
};

function elementDefs() {
  const th = theme(), u = U();
  const S = (n) => n * u;
  return [
    ['Shapes', [
      ['Square', { type: 'rect', w: S(260), h: S(260), fill: th.accent2, stroke: null, strokeW: S(3), radius: 0 }],
      ['Rounded', { type: 'rect', w: S(300), h: S(200), fill: th.accent2, stroke: null, strokeW: S(3), radius: S(32) }],
      ['Circle', { type: 'ellipse', w: S(240), h: S(240), fill: th.accent, stroke: null, strokeW: S(3) }],
      ['Outline', { type: 'rect', w: S(300), h: S(200), fill: null, stroke: th.ink, strokeW: S(3), radius: S(18) }],
      ['Blob', { type: 'blob', w: S(300), h: S(260), fill: th.accent2, stroke: null, strokeW: S(3) }],
      ['Star', { type: 'star', w: S(180), h: S(180), fill: th.accent3, stroke: null, strokeW: S(3) }],
      ['Heart', { type: 'heart', w: S(180), h: S(170), fill: th.accent, stroke: null, strokeW: S(3) }],
      ['Sparkle', { type: 'sparkle', w: S(120), h: S(120), fill: th.accent, stroke: null, strokeW: S(3) }],
      ['Arrow', { type: 'arrow', w: S(240), h: S(80), fill: th.ink, stroke: null, strokeW: S(3) }],
    ]],
    ['Lines', [
      ['Line', { type: 'line', w: S(500), h: S(14), stroke: th.ink, strokeW: S(3) }],
      ['Dotted', { type: 'line', w: S(500), h: S(14), stroke: th.ink, strokeW: S(4), dash: true }],
      ['Dashed', { type: 'line', w: S(500), h: S(14), stroke: th.ink, strokeW: S(3), dash: 'dash' }],
    ]],
    ['Planner bits', [
      ['Checkbox', { type: 'check', w: S(36), h: S(36), fill: null, stroke: th.accent, strokeW: S(3), radius: S(9) }],
      ['Lined area', { type: 'lines', w: S(600), h: S(300), style: 'lines', gap: S(44), stroke: th.muted, strokeW: S(1.5) }],
      ['Dot grid', { type: 'lines', w: S(600), h: S(300), style: 'dots', gap: S(36), stroke: th.muted, strokeW: S(2) }],
      ['Graph grid', { type: 'lines', w: S(600), h: S(300), style: 'grid', gap: S(30), stroke: th.muted, strokeW: S(1) }],
      ['Tracker row', { type: 'grid', w: S(620), h: S(40), rows: 1, cols: 7, cell: 'circle', stroke: th.accent, strokeW: S(2), fill: null }],
      ['Table', { type: 'grid', w: S(600), h: S(300), rows: 5, cols: 3, cell: 'box', stroke: th.muted, strokeW: S(1.5), fill: null }],
      ['Rating stars', { type: 'grid', w: S(250), h: S(50), rows: 1, cols: 5, cell: 'star', stroke: th.accent, strokeW: S(2), fill: null }],
      ['Sticky note', { type: 'rect', w: S(300), h: S(300), fill: '#FFF1A8', stroke: null, strokeW: S(2), radius: S(4), shadow: true, rot: -3 }],
      ['Label', { type: 'rect', w: S(320), h: S(70), fill: th.accent2, stroke: null, strokeW: S(2), radius: S(35) }],
    ]],
    ['Washi tape', [
      ['Plain', { type: 'tape', w: S(320), h: S(70), fill: th.accent, pattern: null, opacity: 0.8, rot: -4 }],
      ['Stripes', { type: 'tape', w: S(320), h: S(70), fill: th.accent3, pattern: 'stripes', opacity: 0.85, rot: 3 }],
      ['Dots', { type: 'tape', w: S(320), h: S(70), fill: th.accent2, pattern: 'dots', opacity: 0.9, rot: -2 }],
      ['Grid', { type: 'tape', w: S(320), h: S(70), fill: th.muted, pattern: 'grid', opacity: 0.85, rot: 5 }],
    ]],
    ['Photo frames', [
      ['Rectangle', { type: 'photo', w: S(500), h: S(380), asset: null, shape: 'rect', radius: 0, fill: th.accent2 }],
      ['Rounded', { type: 'photo', w: S(420), h: S(420), asset: null, shape: 'rect', radius: S(40), fill: th.accent2 }],
      ['Circle', { type: 'photo', w: S(380), h: S(380), asset: null, shape: 'circle', fill: th.accent2 }],
      ['Arch', { type: 'photo', w: S(360), h: S(480), asset: null, shape: 'arch', fill: th.accent2 }],
      ['Polaroid', null],
    ]],
  ];
}
TOOLS.elements = (body) => {
  for (const [group, defs] of elementDefs()) {
    sec(body, group);
    const tiles = el('<div class="tiles"></div>');
    for (const [name, def] of defs) {
      const tile = el(`<button class="tile"></button>`);
      const c = document.createElement('canvas'); c.width = 168; c.height = 120;
      const ctx = c.getContext('2d');
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface2') || '#f3efe8'; ctx.fillRect(0, 0, 168, 120);
      if (def) {
        const it = Object.assign({ x: 0, y: 0, rot: 0, opacity: 1 }, deep(def));
        const s = Math.min(130 / it.w, 80 / it.h);
        ctx.save(); ctx.translate(84 - it.w * s / 2, 60 - it.h * s / 2); ctx.scale(s, s);
        Render.drawItem(ctx, it, { editor: true }); ctx.restore();
      } else {
        ctx.save(); ctx.translate(84, 60); ctx.rotate(-0.06); ctx.shadowColor = 'rgba(0,0,0,.2)'; ctx.shadowBlur = 6; ctx.fillStyle = '#fff'; ctx.fillRect(-32, -42, 64, 80); ctx.shadowColor = 'transparent'; ctx.fillStyle = theme().accent2; ctx.fillRect(-27, -37, 54, 54); ctx.restore();
      }
      tile.appendChild(c); tile.appendChild(el(`<span>${esc(name)}</span>`));
      tile.onclick = () => def ? addItem(deep(def)) : addPolaroid();
      tiles.appendChild(tile);
    }
    body.appendChild(tiles);
  }
};
function addPolaroid() {
  const u = U(), w = 420 * u, h = 500 * u, x = (P.w - w) / 2, y = (P.h - h) / 2;
  cp();
  const frame = { id: uid(), type: 'rect', x, y, w, h, fill: '#FFFFFF', stroke: null, strokeW: 0, radius: 4 * u, shadow: true, rot: 0, opacity: 1 };
  const ph = { id: uid(), type: 'photo', x: x + 24 * u, y: y + 24 * u, w: w - 48 * u, h: w - 48 * u, asset: null, shape: 'rect', radius: 0, fill: theme().accent2, rot: 0, opacity: 1 };
  const cap = { id: uid(), type: 'text', x: x + 24 * u, y: y + w - 10 * u, w: w - 48 * u, h: 50 * u, text: 'memories', font: theme().script, size: 40 * u, color: '#333333', align: 'center', lineH: 1.2, rot: 0, opacity: 1 };
  page().items.push(frame, ph, cap); sel = ph.id; changed(); openTool('props');
  toast('Tap the grey square to add your photo');
}

const STICKERS = {
  'Nature': '🌸 🌷 🌹 🌻 🌼 💐 🌿 🍃 🌱 🪴 🌵 🍂 🍁 🌙 ☀️ ⭐ 🌟 ✨ ☁️ 🌈 ❄️ 🌊 🦋 🐝 🐞 🍄',
  'Cozy': '☕ 🍵 🧋 🍓 🍒 🍋 🍑 🥐 🍰 🧁 🍪 🍩 🍕 🥗 🕯️ 🧸 🎀 🛁 🧺 🪞',
  'Planner': '📌 📍 📎 ✏️ 🖊️ 🖍️ 📚 📖 📝 📅 🗓️ ⏰ 💡 🎧 📷 💌 ✉️ 🎁 🏷️ 💰 💳 🏠 🚗 ✈️ 🧳 🏋️ 🧘 🏃 💊 🩺',
  'Hearts & symbols': '❤️ 🩷 🧡 💛 💚 🩵 💙 💜 🤎 🖤 🤍 💖 💕 💫 🔥 ✅ ✔️ ❌ ❗ ❓ ➕ 🔔 💯 ♡ ☆',
  'Mood': '😊 😌 🥰 😍 🤩 😎 🙂 😐 😕 😢 😭 😤 😡 😴 🤒 🥳 🤔 🫶 👏 🙌 💪',
};
TOOLS.stickers = (body) => {
  for (const [g, list] of Object.entries(STICKERS)) {
    sec(body, g);
    const w = el('<div class="stickers"></div>');
    for (const s of list.split(' ')) {
      const b = el(`<button>${s}</button>`);
      b.onclick = () => { const z = 180 * U(); addItem({ type: 'sticker', text: s, w: z, h: z }); };
      w.appendChild(b);
    }
    body.appendChild(w);
  }
};

TOOLS.photos = (body) => {
  body.appendChild(btns([['📷 Upload photos', () => pickPhoto(null)]]));
  const ids = Object.keys(P.assets);
  if (ids.length) {
    sec(body, 'Used in this design');
    const tiles = el('<div class="tiles"></div>');
    for (const id of ids.reverse()) {
      const b = el(`<button class="tile"><img src="${P.assets[id]}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px"></button>`);
      b.onclick = () => {
        const im = Render.getImg(id); const iw = im ? im.naturalWidth : 1000, ih = im ? im.naturalHeight : 1000;
        const s = Math.min(P.w * 0.6 / iw, P.h * 0.5 / ih);
        addItem({ type: 'photo', asset: id, w: iw * s, h: ih * s, shape: 'rect', radius: 0, fx: null, zoom: 1, ox: 0, oy: 0 });
      };
      tiles.appendChild(b);
    }
    body.appendChild(tiles);
  }
  sec(body, 'Photo frames');
  body.appendChild(el('<p class="fine" style="margin:0">Add a frame from <b>Elements</b> or a collage page from <b>Templates</b>, then tap the frame to fill it with a photo.</p>'));
};

TOOLS.background = (body) => {
  const pg = page();
  sec(body, 'Page colour');
  body.appendChild(swatches(pg.bg, (c, live) => { if (!live) cp(); pg.bg = c; changed(); if (!live) openTool('background'); }));
  sec(body, 'Paper');
  const cur = (pg.pattern && pg.pattern.style) || 'none';
  const setPat = (style) => { cp(); pg.pattern = style === 'none' ? null : { style, gap: (style === 'dots' ? 40 : 44) * U(), stroke: theme().muted, strokeW: (style === 'dots' ? 2.2 : 1.5) * U() }; changed(); openTool('background'); };
  body.appendChild(btns([['Plain', () => setPat('none'), cur === 'none'], ['Lined', () => setPat('lines'), cur === 'lines'], ['Dot grid', () => setPat('dots'), cur === 'dots'], ['Graph', () => setPat('grid'), cur === 'grid']]));
  if (pg.pattern) {
    body.appendChild(range('Spacing', 16, 120, 1, Math.round(pg.pattern.gap / U()), (v) => { pg.pattern.gap = v * U(); }));
    body.appendChild(el('<div class="sec">Line colour</div>'));
    body.appendChild(swatches(pg.pattern.stroke, (c, live) => { if (!live) cp(); pg.pattern.stroke = c; changed(); if (!live) openTool('background'); }));
  }
  sec(body, 'Pages');
  body.appendChild(btns([
    ['Apply to all pages', () => { cp('all'); for (const p of P.pages) { p.bg = pg.bg; p.pattern = pg.pattern ? deep(pg.pattern) : null; } changed(); toast('Applied to every page'); }],
    ['＋ Blank page', () => { cp('all'); P.pages.splice(pi + 1, 0, { id: uid(), bg: pg.bg, pattern: null, items: [] }); pi++; sel = null; changed(); }],
    ['⧉ Duplicate page', dupPage],
    ['All pages…', () => openTool('pages')],
  ]));
};

function dupPage() {
  cp('all');
  const c = deep(page()); c.id = uid(); for (const it of c.items) it.id = uid();
  P.pages.splice(pi + 1, 0, c); pi++; sel = null; changed(); toast('Page duplicated');
}
function delPage() {
  if (P.pages.length < 2) { toast('A design needs at least one page'); return; }
  if (!confirm('Delete this page?')) return;
  cp('all'); P.pages.splice(pi, 1); pi = Math.min(pi, P.pages.length - 1); sel = null; changed();
  if (tool === 'pages') openTool('pages');
}
function movePage(d) {
  const j = pi + d; if (j < 0 || j >= P.pages.length) return;
  cp('all'); const [p] = P.pages.splice(pi, 1); P.pages.splice(j, 0, p); pi = j; changed(); openTool('pages');
}

TOOLS.pages = (body) => {
  body.appendChild(btns([['⧉ Duplicate', dupPage], ['↑ Move earlier', () => movePage(-1)], ['↓ Move later', () => movePage(1)], ['<span class="danger">Delete page</span>', delPage]]));
  sec(body, `${P.pages.length} pages`);
  const grid = el('<div class="page-thumbs"></div>');
  body.appendChild(grid);
  let i = 0;
  const next = () => {
    if (i >= P.pages.length || tool !== 'pages') return;
    const k = i++;
    const b = el(`<button class="pth ${k === pi ? 'on' : ''}"></button>`);
    b.appendChild(miniCanvas(P.pages[k], P.w, P.h, 78)); b.appendChild(el(`<span>${k + 1}</span>`));
    b.onclick = () => goPage(k, true);
    grid.appendChild(b);
    if (k === pi) setTimeout(() => b.scrollIntoView({ block: 'nearest' }), 0);
    setTimeout(next, 0);
  };
  next();
};

const TYPE_NAMES = { text: 'Text', rect: 'Shape', ellipse: 'Circle', line: 'Line', star: 'Star', heart: 'Heart', sparkle: 'Sparkle', arrow: 'Arrow', blob: 'Blob', tape: 'Washi tape', check: 'Checkbox', lines: 'Lined area', grid: 'Grid', sticker: 'Sticker', photo: 'Photo' };
const TYPE_ICONS = { text: 'T', rect: '▭', ellipse: '◯', line: '—', star: '★', heart: '♥', sparkle: '✦', arrow: '➜', blob: '⬬', tape: '▤', check: '☐', lines: '☰', grid: '▦', photo: '🖼' };
TOOLS.layers = (body) => {
  const items = page().items.slice().reverse();
  if (!items.length) { body.appendChild(el('<p class="fine">This page is empty.</p>')); return; }
  if (selItem()) body.appendChild(btns([['Bring to front', () => arrange('front')], ['Forward', () => arrange('up')], ['Backward', () => arrange('down')], ['Send to back', () => arrange('back')]]));
  sec(body, 'Top to bottom');
  for (const it of items) {
    const name = it.type === 'text' ? String(it.text).split('\n')[0].slice(0, 40) : it.type === 'sticker' ? it.text + ' Sticker' : TYPE_NAMES[it.type] || it.type;
    const row = el(`<div class="layer ${it.id === sel ? 'on' : ''}"><span class="lic">${TYPE_ICONS[it.type] || ''}</span><span class="lname">${esc(name)}${it.tab ? ' <small>(tab)</small>' : ''}</span><button class="icon sm" aria-label="${it.locked ? 'Unlock' : 'Lock'}">${it.locked ? '🔒' : '🔓'}</button></div>`);
    row.onclick = (e) => {
      if (e.target.closest('button')) { cp(); it.locked = !it.locked; changed(); openTool('layers'); return; }
      sel = it.id; requestRender(); openTool('layers');
    };
    body.appendChild(row);
  }
};

TOOLS.props = (body) => {
  const it = selItem();
  if (!it) { closeSheet(); return; }
  $('#sheetTitle').textContent = (TYPE_NAMES[it.type] || 'Element') + (it.locked ? ' (locked)' : '');
  const u = U();
  if (it.locked) {
    body.appendChild(btns([['🔓 Unlock', () => { setProp('locked', false); refreshProps(); }]]));
    body.appendChild(el('<p class="fine">Locked items can’t be moved by accident. Unlock to edit.</p>'));
    return;
  }

  if (it.type === 'text') {
    const ta = el(`<textarea id="propText" rows="2"></textarea>`); ta.value = it.text;
    let started = false;
    ta.oninput = () => { if (!started) { cp(); started = true; } it.text = ta.value; requestRender(); };
    ta.onchange = () => { started = false; changed(); };
    ta.onblur = () => { if (started) { started = false; changed(); } };
    body.appendChild(ta);
    sec(body, 'Font');
    const fs = el(`<select aria-label="Font">${FONTS.map((f) => `<option ${f === it.font ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}</select>`);
    fs.onchange = () => setProp('font', fs.value);
    body.appendChild(fs);
    body.appendChild(range('Size', 6, 400, 1, Math.round(it.size / u), (v) => { it.size = v * u; }));
    body.appendChild(btns([
      ['<b>B</b>', () => { setProp('bold', !it.bold); refreshProps(); }, it.bold],
      ['<i>I</i>', () => { setProp('italic', !it.italic); refreshProps(); }, it.italic],
      ['<u>U</u>', () => { setProp('underline', !it.underline); refreshProps(); }, it.underline],
      ['AA', () => { setProp('caps', !it.caps); refreshProps(); }, it.caps],
      ['Left', () => { setProp('align', 'left'); refreshProps(); }, it.align === 'left'],
      ['Centre', () => { setProp('align', 'center'); refreshProps(); }, it.align === 'center'],
      ['Right', () => { setProp('align', 'right'); refreshProps(); }, it.align === 'right'],
    ]));
    body.appendChild(range('Spacing', 0, 30, 0.5, Math.round((it.letter || 0) / u * 2) / 2, (v) => { it.letter = v * u; }));
    body.appendChild(range('Line height', 0.8, 2.5, 0.05, it.lineH || 1.3, (v) => { it.lineH = v; }, (v) => v.toFixed(2)));
    sec(body, 'Colour');
    body.appendChild(swatches(it.color, pickColor('color')));
  }

  if (['rect', 'ellipse', 'star', 'heart', 'sparkle', 'arrow', 'blob', 'check', 'tape'].includes(it.type)) {
    sec(body, it.type === 'tape' ? 'Tape colour' : 'Fill');
    body.appendChild(swatches(it.fill, pickColor('fill'), { none: it.type !== 'tape' }));
  }
  if (it.type === 'tape') {
    sec(body, 'Pattern');
    body.appendChild(btns([['Plain', () => { setProp('pattern', null); refreshProps(); }, !it.pattern], ['Stripes', () => { setProp('pattern', 'stripes'); refreshProps(); }, it.pattern === 'stripes'], ['Dots', () => { setProp('pattern', 'dots'); refreshProps(); }, it.pattern === 'dots'], ['Grid', () => { setProp('pattern', 'grid'); refreshProps(); }, it.pattern === 'grid']]));
  }
  if (['rect', 'ellipse', 'star', 'heart', 'sparkle', 'arrow', 'blob', 'check', 'line', 'lines', 'grid', 'photo'].includes(it.type)) {
    sec(body, it.type === 'line' || it.type === 'lines' || it.type === 'grid' ? 'Line colour' : 'Border');
    body.appendChild(swatches(it.stroke, pickColor('stroke'), { none: !['line', 'lines', 'grid'].includes(it.type) }));
    body.appendChild(range('Thickness', 0, 30, 0.5, Math.round((it.strokeW || 0) / u * 2) / 2, (v) => { it.strokeW = v * u; }));
  }
  if (it.type === 'line') body.appendChild(btns([['Solid', () => { setProp('dash', false); refreshProps(); }, !it.dash], ['Dotted', () => { setProp('dash', true); refreshProps(); }, it.dash === true], ['Dashed', () => { setProp('dash', 'dash'); refreshProps(); }, it.dash === 'dash']]));
  if (it.type === 'rect' || (it.type === 'photo' && it.shape === 'rect')) body.appendChild(range('Corners', 0, 300, 1, Math.round((it.radius || 0) / u), (v) => { it.radius = v * u; }));
  if (it.type === 'lines') {
    body.appendChild(btns([['Lined', () => { setProp('style', 'lines'); refreshProps(); }, it.style === 'lines'], ['Dots', () => { setProp('style', 'dots'); refreshProps(); }, it.style === 'dots'], ['Graph', () => { setProp('style', 'grid'); refreshProps(); }, it.style === 'grid']]));
    body.appendChild(range('Spacing', 10, 150, 1, Math.round(it.gap / u), (v) => { it.gap = v * u; }));
  }
  if (it.type === 'grid') {
    body.appendChild(btns([['Boxes', () => { setProp('cell', 'box'); refreshProps(); }, it.cell === 'box'], ['Circles', () => { setProp('cell', 'circle'); refreshProps(); }, it.cell === 'circle'], ['Squares', () => { setProp('cell', 'square'); refreshProps(); }, it.cell === 'square'], ['Stars', () => { setProp('cell', 'star'); refreshProps(); }, it.cell === 'star']]));
    body.appendChild(range('Rows', 1, 40, 1, it.rows, (v) => { it.rows = v; }));
    body.appendChild(range('Columns', 1, 40, 1, it.cols, (v) => { it.cols = v; }));
    sec(body, 'Cell fill'); body.appendChild(swatches(it.fill, pickColor('fill'), { none: true }));
  }

  if (it.type === 'photo') {
    body.appendChild(btns([[it.asset ? '🔁 Replace photo' : '📷 Add photo', () => pickPhoto(it.id)], ...(it.asset ? [['Remove photo', () => { setProp('asset', null); refreshProps(); }]] : [])]));
    sec(body, 'Shape');
    body.appendChild(btns([['Rectangle', () => { setProp('shape', 'rect'); refreshProps(); }, it.shape === 'rect'], ['Circle', () => { setProp('shape', 'circle'); refreshProps(); }, it.shape === 'circle'], ['Arch', () => { setProp('shape', 'arch'); refreshProps(); }, it.shape === 'arch']]));
    if (it.asset) {
      sec(body, 'Filters');
      const presets = [
        ['Original', null], ['Warm', { b: 4, c: 6, s: 10, w: 22, v: 0 }], ['Cool', { b: 2, c: 4, s: -5, w: -20, v: 0 }],
        ['Fade', { b: 12, c: -22, s: -18, w: 6, v: 0 }], ['Vivid', { b: 3, c: 18, s: 35, w: 0, v: 0 }], ['B&W', { b: 2, c: 14, s: -100, w: 0, v: 0 }],
        ['Film', { b: -2, c: 10, s: -12, w: 12, v: 45 }],
      ];
      const cur = JSON.stringify(it.fx || null);
      body.appendChild(btns(presets.map(([n, f]) => [n, () => { setProp('fx', f ? { ...f } : null); refreshProps(); }, JSON.stringify(f) === cur])));
      const fx = it.fx || { ...Render.FX0 };
      const fxr = (label, k, min = -100, max = 100) => range(label, min, max, 1, fx[k] || 0, (v) => { it.fx = Object.assign({ ...Render.FX0 }, it.fx || {}, { [k]: v }); });
      body.appendChild(fxr('Brightness', 'b'));
      body.appendChild(fxr('Contrast', 'c'));
      body.appendChild(fxr('Saturation', 's'));
      body.appendChild(fxr('Warmth', 'w'));
      body.appendChild(fxr('Vignette', 'v', 0, 100));
      sec(body, 'Crop');
      body.appendChild(range('Zoom', 1, 4, 0.05, it.zoom || 1, (v) => { it.zoom = v; }, (v) => v.toFixed(2) + '×'));
      body.appendChild(range('Left ↔ right', -1, 1, 0.02, it.ox || 0, (v) => { it.ox = v; }, (v) => v.toFixed(2)));
      body.appendChild(range('Up ↕ down', -1, 1, 0.02, it.oy || 0, (v) => { it.oy = v; }, (v) => v.toFixed(2)));
    }
  }

  sec(body, 'Arrange');
  body.appendChild(range('Opacity', 0, 100, 1, Math.round((it.opacity ?? 1) * 100), (v) => { it.opacity = v / 100; }, (v) => v + '%'));
  body.appendChild(range('Rotate', -180, 180, 1, Math.round(((it.rot || 0) + 540) % 360 - 180), (v) => { it.rot = v; }, (v) => v + '°'));
  body.appendChild(btns([
    ['⧉ Duplicate', dupItem], ['Front', () => arrange('front')], ['Forward', () => arrange('up')], ['Backward', () => arrange('down')], ['Back', () => arrange('back')],
    ['Shadow', () => { setProp('shadow', !it.shadow); refreshProps(); }, it.shadow],
    ['⇋ Flip', () => { setProp('flip', !it.flip); }, it.flip],
    ['Centre', () => { cp(); it.x = (P.w - it.w) / 2; changed(); }],
    ['🔒 Lock', () => { setProp('locked', true); refreshProps(); }],
    ['<span class="danger">Delete</span>', delItem],
  ]));
  sec(body, 'Link to page (works in preview and exported PDF)');
  const ls = el(`<select aria-label="Link to page"><option value="">No link</option>${P.pages.map((p, i) => `<option value="${p.id}" ${it.link === p.id ? 'selected' : ''}>Page ${i + 1}${pageTitle(p) ? ' · ' + esc(pageTitle(p)) : ''}</option>`).join('')}</select>`);
  ls.onchange = () => setProp('link', ls.value || null);
  body.appendChild(ls);
};

function pageTitle(p) {
  const big = p.items.filter((i) => i.type === 'text' && !i.tab).sort((a, b) => b.size - a.size)[0];
  return big ? String(big.text).split('\n')[0].slice(0, 28) : '';
}

// ---------------- page bar ----------------
function updPagebar() {
  if (!P) return;
  $('#pageLabel').textContent = `Page ${pi + 1} / ${P.pages.length}`;
  $('#prevPage').disabled = pi === 0; $('#nextPage').disabled = pi === P.pages.length - 1;
}
function goPage(i, keepSheet = false) {
  pi = clamp(i, 0, P.pages.length - 1); sel = null;
  if (!keepSheet && tool === 'props') closeSheet();
  if (tool === 'pages') openTool('pages');
  if (tool === 'background') openTool('background');
  if (tool === 'layers') openTool('layers');
  updPagebar(); requestRender();
}
$('#prevPage').onclick = () => goPage(pi - 1);
$('#nextPage').onclick = () => goPage(pi + 1);
$('#pageLabel').onclick = () => (tool === 'pages' ? closeSheet() : openTool('pages'));
$('#zoomIn').onclick = () => { zoom = Math.min(6, zoom * 1.25); layoutStage(); };
$('#zoomOut').onclick = () => { zoom = Math.max(0.5, zoom / 1.25); layoutStage(); };
$('#zoomLabel').onclick = () => { zoom = 1; layoutStage(); };
$('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo;
$('#projName').addEventListener('change', () => { P.name = $('#projName').value.trim() || 'Untitled'; saveProject(); });
$('#backBtn').onclick = async () => { await saveProject(); showHome(); };
new ResizeObserver(() => layoutStage()).observe(wrap);

// ---------------- preview (tap links like in GoodNotes) ----------------
let pvi = 0;
function pageIndexById(id) { return P.pages.findIndex((p) => p.id === id); }
function renderPreview() {
  const c = $('#previewCanvas');
  const s = Math.min(innerWidth / P.w, (innerHeight - 70) / P.h), dpr = Math.min(devicePixelRatio || 1, 2);
  c.style.width = P.w * s + 'px'; c.style.height = P.h * s + 'px';
  c.width = Math.round(P.w * s * dpr); c.height = Math.round(P.h * s * dpr);
  Render.drawPage(c.getContext('2d'), P.pages[pvi], P.w, P.h, s, { dpr });
  c._s = s;
  $('#pvLabel').textContent = `${pvi + 1} / ${P.pages.length}`;
}
$('#previewBtn').onclick = () => { pvi = pi; sel = null; $('#preview').classList.remove('hidden'); renderPreview(); };
$('#pvClose').onclick = () => { $('#preview').classList.add('hidden'); goPage(pvi); };
$('#pvPrev').onclick = () => { pvi = Math.max(0, pvi - 1); renderPreview(); };
$('#pvNext').onclick = () => { pvi = Math.min(P.pages.length - 1, pvi + 1); renderPreview(); };
$('#previewCanvas').addEventListener('click', (e) => {
  const c = e.currentTarget, r = c.getBoundingClientRect(), s = c._s;
  const p = { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  const items = P.pages[pvi].items;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.link && hitItem(it, p)) { const j = pageIndexById(it.link); if (j >= 0) { pvi = j; renderPreview(); return; } }
  }
  if (p.x > P.w * 0.6) $('#pvNext').click(); else if (p.x < P.w * 0.4) $('#pvPrev').click();
});
addEventListener('resize', () => { if (!$('#preview').classList.contains('hidden')) renderPreview(); });

// ---------------- export ----------------
function modal(html, onMount) {
  const root = $('#modalRoot');
  const b = el(`<div class="backdrop"><div class="modal">${html}</div></div>`);
  b.addEventListener('click', (e) => { if (e.target === b) b.remove(); });
  root.appendChild(b);
  if (onMount) onMount(b, () => b.remove());
  return b;
}
const safeName = () => (P.name || 'design').replace(/[^\w\- ]+/g, '').trim() || 'design';

async function prepareExport() {
  Render.setAssets(P.assets);
  await Render.loadFonts(P.pages);
  const ids = new Set(); for (const p of P.pages) for (const it of p.items) if (it.asset) ids.add(it.asset);
  await Render.loadImages([...ids]);
}
function exportScale() { return clamp(2400 / Math.max(P.w, P.h), 1, 2); }

function deliver(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  const url = URL.createObjectURL(blob);
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  modal(`<h3>Ready ✨</h3><p>${esc(filename)} · ${(blob.size / 1048576).toFixed(1)} MB</p>
    <div class="list">
      ${canShare ? '<button data-a="share"><span>Share / Save to Files / Open in app</span><small>›</small></button>' : ''}
      <a class="ghost" style="text-align:center;padding:12px;text-decoration:none" href="${url}" download="${esc(filename)}">Download</a>
    </div>
    <div class="actions"><button class="ghost" data-a="close">Close</button></div>`, (m, close) => {
    m.querySelector('[data-a=close]').onclick = close;
    const sb = m.querySelector('[data-a=share]');
    if (sb) sb.onclick = async () => { try { await navigator.share({ files: [file], title: filename }); close(); } catch (e) { if (e.name !== 'AbortError') toast('Sharing failed: try Download'); } };
  });
}

async function exportImage(type) {
  toast('Preparing…', 1500);
  await prepareExport();
  const c = Render.pageCanvas(page(), P.w, P.h, exportScale(), {});
  c.toBlob((b) => deliver(b, `${safeName()}${P.pages.length > 1 ? '-p' + (pi + 1) : ''}.${type === 'image/png' ? 'png' : 'jpg'}`), type, 0.93);
}

let jsPDFPromise = null;
function loadJsPDF() {
  if (window.jspdf) return Promise.resolve();
  if (!jsPDFPromise) jsPDFPromise = new Promise((res, rej) => {
    // Bundled copy first (works offline), CDN as a fallback.
    const load = (src, next) => {
      const s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = () => { s.remove(); if (next) load(next); else { jsPDFPromise = null; rej(new Error('Could not load the PDF tool (are you offline?)')); } };
      document.head.appendChild(s);
    };
    load('vendor/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  });
  return jsPDFPromise;
}
function bbox(it) {
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => toWorld(it, a * it.w / 2, b * it.h / 2));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
async function exportPDF(quality) {
  try {
    toast('Loading PDF tool…', 1500);
    await loadJsPDF();
    await prepareExport();
    const { jsPDF } = window.jspdf;
    const orient = P.w > P.h ? 'l' : 'p';
    const pdf = new jsPDF({ unit: 'px', format: [P.w, P.h], orientation: orient, hotfixes: ['px_scaling'], compress: true });
    const scale = quality === 'print' ? exportScale() : Math.min(1, 1800 / Math.max(P.w, P.h));
    // measure text boxes first so link areas are right
    const mctx = document.createElement('canvas').getContext('2d');
    for (let i = 0; i < P.pages.length; i++) {
      if (i) pdf.addPage([P.w, P.h], orient);
      const pg = P.pages[i];
      for (const it of pg.items) if (it.type === 'text') Render.measureText(mctx, it);
      const c = Render.pageCanvas(pg, P.w, P.h, scale, {});
      pdf.addImage(c.toDataURL('image/jpeg', quality === 'print' ? 0.92 : 0.85), 'JPEG', 0, 0, P.w, P.h, undefined, 'FAST');
      for (const it of pg.items) {
        if (!it.link) continue;
        const j = pageIndexById(it.link); if (j < 0) continue;
        const b = bbox(it);
        pdf.link(b.x, b.y, b.w, b.h, { pageNumber: j + 1 });
      }
      if (i % 4 === 3) { toast(`Making PDF… page ${i + 1} of ${P.pages.length}`, 4000); await new Promise((r) => setTimeout(r, 0)); }
    }
    deliver(pdf.output('blob'), safeName() + '.pdf');
  } catch (e) { console.error(e); toast(e.message || 'PDF export failed'); }
}

function backupBlob(proj) { return new Blob([JSON.stringify({ app: 'amh-studio', v: 1, project: proj })], { type: 'application/json' }); }

$('#exportBtn').onclick = async () => {
  await saveProject();
  modal(`<h3>Export</h3><p>${P.pages.length} page${P.pages.length > 1 ? 's' : ''} · ${P.w}×${P.h}px</p>
   <div class="list">
     <button data-x="pdf"><span><b>PDF</b> · all pages, links work<br><small>Best for GoodNotes, Notability, Xodo</small></span><small>›</small></button>
     <button data-x="pdfprint"><span><b>PDF · high quality</b><br><small>Sharper for printing, bigger file</small></span><small>›</small></button>
     <button data-x="png"><span><b>PNG</b> · this page<br><small>Best quality image</small></span><small>›</small></button>
     <button data-x="jpg"><span><b>JPG</b> · this page<br><small>Smaller file, good for posting</small></span><small>›</small></button>
     <button data-x="backup"><span><b>Backup file</b><br><small>Re-open and keep editing later or on another device</small></span><small>›</small></button>
   </div><div class="actions"><button class="ghost" data-x="close">Cancel</button></div>`, (m, close) => {
    m.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => {
      const x = b.dataset.x; close();
      if (x === 'pdf') exportPDF('screen'); else if (x === 'pdfprint') exportPDF('print');
      else if (x === 'png') exportImage('image/png'); else if (x === 'jpg') exportImage('image/jpeg');
      else if (x === 'backup') deliver(backupBlob(P), safeName() + '.amhstudio.json');
    });
  });
};

// ---------------- home ----------------
async function showHome() {
  P = null; sel = null; tool = null;
  $('#editor').classList.add('hidden'); $('#home').classList.remove('hidden');
  const list = (await DB.all('meta')).sort((a, b) => b.updated - a.updated);
  const box = $('#projectList'); box.innerHTML = '';
  if (!list.length) { box.appendChild(el('<div class="empty">Nothing here yet. Pick something to create above ✨</div>')); return; }
  for (const m of list) {
    const d = el(`<div class="proj"><button class="open" style="display:contents"><span class="thumb" style="background-image:url('${m.thumb || ''}');aspect-ratio:${m.w}/${m.h}"></span><b>${esc(m.name)}</b><small>${m.pages} page${m.pages > 1 ? 's' : ''} · ${new Date(m.updated).toLocaleDateString()}</small></button><button class="more" aria-label="More">⋯</button></div>`);
    $('.open', d).onclick = () => openProject(m.id);
    $('.more', d).onclick = () => projectMenu(m);
    box.appendChild(d);
  }
}
function projectMenu(m) {
  modal(`<h3>${esc(m.name)}</h3><div class="list">
    <button data-a="open"><span>Open</span><small>›</small></button>
    <button data-a="copy"><span>Make a copy</span><small>›</small></button>
    <button data-a="backup"><span>Back up (save file)</span><small>›</small></button>
    <button data-a="del"><span class="danger">Delete</span><small>›</small></button></div>
    <div class="actions"><button class="ghost" data-a="close">Close</button></div>`, (mm, close) => {
    mm.querySelectorAll('[data-a]').forEach((b) => b.onclick = async () => {
      const a = b.dataset.a; close();
      if (a === 'open') openProject(m.id);
      if (a === 'copy') { const p = await DB.get('projects', m.id); p.id = uid(); p.name += ' (copy)'; P = p; await saveProject(); showHome(); }
      if (a === 'backup') { const p = await DB.get('projects', m.id); deliver(backupBlob(p), (p.name || 'design').replace(/[^\w\- ]+/g, '') + '.amhstudio.json'); }
      if (a === 'del' && confirm(`Delete “${m.name}”? This can’t be undone.`)) { await DB.del('projects', m.id); await DB.del('meta', m.id); showHome(); }
    });
  });
}
async function openProject(id) {
  const p = await DB.get('projects', id); if (!p) return toast('Could not open that design');
  startEditor(p);
}
function startEditor(p) {
  P = p; P.assets = P.assets || {}; pi = 0; sel = null; zoom = 1; hist.undo = []; hist.redo = [];
  Render.setAssets(P.assets);
  $('#home').classList.add('hidden'); $('#editor').classList.remove('hidden');
  $('#projName').value = P.name;
  closeSheet(); updPagebar(); updUndo();
  requestAnimationFrame(layoutStage);
}
function newProject(name, w, h, themeId, pages) {
  const p = { id: uid(), name, w, h, theme: themeId, pages, assets: {}, created: Date.now(), updated: Date.now() };
  startEditor(p); saveProject();
}

function themePicker(cur) {
  return `<div class="themes" data-themes>${Object.entries(THEMES).map(([id, th]) => `<button type="button" class="theme ${id === cur ? 'on' : ''}" data-theme="${id}"><span class="chips">${['bg', 'accent2', 'accent', 'accent3', 'ink'].map((k) => `<i style="background:${th[k]}"></i>`).join('')}</span>${th.name}</button>`).join('')}</div>`;
}
function wireThemes(m, state) {
  m.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { state.theme = b.dataset.theme; m.querySelectorAll('[data-theme]').forEach((x) => x.classList.toggle('on', x === b)); });
}
const sizeOptions = (ids, cur) => SIZES.filter((s) => !ids || ids.includes(s.id)).map((s) => `<option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${s.name} (${s.w}×${s.h})</option>`).join('');

$$('[data-new]').forEach((b) => b.onclick = () => NEW[b.dataset.new]());
const NEW = {
  planner() {
    const now = new Date(), st = { theme: 'sage' };
    modal(`<h3>Digital planner</h3><p>A full year with a contents page and month tabs that jump between pages in GoodNotes, Notability and other PDF apps.</p>
      ${themePicker(st.theme)}
      <div class="two" style="margin-top:12px">
        <label>Starts<select id="npMonth">${MONTHS.map((m, i) => `<option value="${i}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label>Year<input class="inp" id="npYear" type="number" value="${now.getFullYear()}"></label>
      </div>
      <label style="display:block;margin-top:10px;font-size:13px;color:var(--muted)">Size<select id="npSize">${sizeOptions(['planner', 'letter', 'a4'], 'planner')}</select></label>
      <div class="sec">Include</div>
      <div class="checks">
        ${[['weekly', 'Weekly page / month', 1], ['daily', 'Daily page / month', 1], ['habit', 'Habit tracker / month', 1], ['goals', 'Goals', 1], ['pixels', 'Year in pixels', 1], ['journal', 'Journal pages', 1], ['reading', 'Reading log', 1], ['budget', 'Budget', 1], ['vision', 'Vision board', 1]].map(([k, l, on]) => `<label><input type="checkbox" data-part="${k}" ${on ? 'checked' : ''}>${l}</label>`).join('')}
      </div>
      <p class="fine">Tip: in GoodNotes, duplicate a weekly or daily page whenever you need another.</p>
      <div class="actions"><button class="ghost" data-a="close">Cancel</button><button class="primary" data-a="go">Create planner</button></div>`, (m, close) => {
      wireThemes(m, st);
      m.querySelector('[data-a=close]').onclick = close;
      m.querySelector('[data-a=go]').onclick = () => {
        const parts = {}; m.querySelectorAll('[data-part]').forEach((c) => parts[c.dataset.part] = c.checked);
        const year = +$('#npYear', m).value || now.getFullYear(), startMonth = +$('#npMonth', m).value;
        const size = SIZES.find((s) => s.id === $('#npSize', m).value);
        const pages = buildPlanner(size.w, size.h, THEMES[st.theme], { year, startMonth, parts });
        close(); newProject(`${year} Planner`, size.w, size.h, st.theme, pages);
        toast(`${pages.length} pages created. Tap ⬆ Export → PDF when ready.`, 4000);
      };
    });
  },
  journal() {
    const st = { theme: 'blush' };
    modal(`<h3>Journal</h3><p>A cover, guided daily journal pages, goals, a vision board and notes.</p>
      ${themePicker(st.theme)}
      <div class="two" style="margin-top:12px">
        <label>Size<select id="njSize">${sizeOptions(['planner', 'letter', 'a4', 'card'], 'planner')}</select></label>
        <label>Journal pages<input class="inp" id="njCount" type="number" min="1" max="60" value="10"></label>
      </div>
      <div class="actions"><button class="ghost" data-a="close">Cancel</button><button class="primary" data-a="go">Create journal</button></div>`, (m, close) => {
      wireThemes(m, st);
      m.querySelector('[data-a=close]').onclick = close;
      m.querySelector('[data-a=go]').onclick = () => {
        const size = SIZES.find((s) => s.id === $('#njSize', m).value);
        const pages = buildJournal(size.w, size.h, THEMES[st.theme], { count: clamp(+$('#njCount', m).value || 10, 1, 60) });
        close(); newProject('My Journal', size.w, size.h, st.theme, pages);
      };
    });
  },
  page() {
    const st = { theme: 'sage' };
    const pageTemplates = TEMPLATES.filter((t) => !['collage4', 'collage3', 'blank', 'quote'].includes(t.id));
    modal(`<h3>Single page</h3><p>Pick a theme and a page. You can add more pages later.</p>
      ${themePicker(st.theme)}
      <label style="display:block;margin-top:10px;font-size:13px;color:var(--muted)">Size<select id="nsSize">${sizeOptions(['planner', 'letter', 'a4', 'portrait', 'story'], 'letter')}</select></label>
      <div class="sec">Page</div>
      <div class="list">${pageTemplates.map((t) => `<button data-t="${t.id}"><span>${t.name}</span><small>›</small></button>`).join('')}</div>`, (m, close) => {
      wireThemes(m, st);
      m.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
        const size = SIZES.find((s) => s.id === $('#nsSize', m).value), t = TEMPLATE_BY_ID[b.dataset.t];
        const pg = t.fn(size.w, size.h, THEMES[st.theme], { year: new Date().getFullYear() });
        close(); newProject(t.name, size.w, size.h, st.theme, [pg]);
      });
    });
  },
  blank() {
    modal(`<h3>Blank design</h3><div class="list">${SIZES.map((s) => `<button data-s="${s.id}"><span>${s.name}</span><small>${s.w}×${s.h}</small></button>`).join('')}
      <button data-s="custom"><span>Custom size…</span><small>›</small></button></div>`, (m, close) => {
      m.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => {
        let s = SIZES.find((x) => x.id === b.dataset.s);
        if (!s) {
          const w = parseInt(prompt('Width in pixels', '1080'), 10), h = parseInt(prompt('Height in pixels', '1080'), 10);
          if (!(w > 50 && h > 50 && w <= 8000 && h <= 8000)) return toast('Enter sizes between 50 and 8000');
          s = { name: 'Custom design', w, h };
        }
        close(); newProject(s.name, s.w, s.h, 'minimal', [{ id: uid(), bg: '#FFFFFF', pattern: null, items: [] }]);
        setTimeout(() => openTool('templates'), 50);
      });
    });
  },
  collage() {
    modal(`<h3>Photo collage</h3><div class="list">
      ${[['ig', 'collage4', 'Square photo grid'], ['portrait', 'collage3', 'Portrait feature collage'], ['story', 'collage3', 'Story collage'], ['ig', 'quote', 'Quote post']].map(([s, t, n]) => `<button data-s="${s}" data-t="${t}"><span>${n}</span><small>›</small></button>`).join('')}</div>`, (m, close) => {
      m.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => {
        const s = SIZES.find((x) => x.id === b.dataset.s), t = TEMPLATE_BY_ID[b.dataset.t];
        close(); newProject(t.name, s.w, s.h, 'blush', [t.fn(s.w, s.h, THEMES.blush, {})]);
        if (t.id !== 'quote') toast('Tap each grey frame to add a photo', 3500);
      });
    });
  },
};

$('#importBtn').onclick = () => { const f = $('#importFile'); f.value = ''; f.click(); };
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const p = data.project; if (!p || !p.pages) throw new Error('bad');
    p.id = uid(); P = p; await saveProject(); P = null; showHome(); toast('Design imported');
  } catch (err) { toast('That file is not an AMH Studio backup'); }
});

// ---------------- start ----------------
(async () => {
  await DB.open();
  showHome();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
addEventListener('visibilitychange', () => { if (document.hidden && P) saveProject(); });
