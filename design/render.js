'use strict';
// AMH Studio: canvas drawing for every element type. Used by the editor, thumbnails and export.

const Render = (() => {
  let assets = {};               // assetId -> dataURL (current project)
  const imgCache = new Map();     // assetId -> HTMLImageElement
  const fxCache = new Map();      // assetId|filters -> canvas
  const fontsRequested = new Set();
  let onAsync = () => {};         // called when a font or image finishes loading

  function setAssets(a) { assets = a || {}; }
  function setOnAsync(fn) { onAsync = fn; }

  function getImg(id) {
    if (!id || !assets[id]) return null;
    let im = imgCache.get(id);
    if (!im) {
      im = new Image();
      im.onload = () => onAsync();
      im.src = assets[id];
      imgCache.set(id, im);
    }
    return im.complete && im.naturalWidth ? im : null;
  }
  function loadImages(ids) {
    return Promise.all(ids.map((id) => new Promise((res) => {
      if (!assets[id]) return res();
      const im = getImg(id); if (im) return res();
      const el = imgCache.get(id); el.addEventListener('load', res, { once: true }); el.addEventListener('error', res, { once: true });
    })));
  }

  // ---- photo filters (pixel based, so they work in every browser) ----
  const FX0 = { b: 0, c: 0, s: 0, w: 0, v: 0 };
  function fxIdentity(f) { return !f || (!f.b && !f.c && !f.s && !f.w && !f.v); }
  function filtered(id, img, f) {
    if (fxIdentity(f)) return img;
    const key = id + '|' + [f.b, f.c, f.s, f.w, f.v].map((n) => n || 0).join(',');
    let c = fxCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    const br = (f.b || 0) * 1.6, ct = (f.c || 0) * 2.2, sat = 1 + (f.s || 0) / 100, wm = (f.w || 0) * 0.5;
    const cf = (259 * (ct + 255)) / (255 * (259 - ct));
    const vig = (f.v || 0) / 100, W = c.width, Hh = c.height, cx = W / 2, cy = Hh / 2, maxD = Math.hypot(cx, cy);
    for (let i = 0; i < p.length; i += 4) {
      let r = p[i], g = p[i + 1], b = p[i + 2];
      r += br; g += br; b += br;
      r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; b = cf * (b - 128) + 128;
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * sat; g = gray + (g - gray) * sat; b = gray + (b - gray) * sat;
      r += wm; b -= wm;
      if (vig) {
        const k = (i / 4), px = k % W, py = (k / W) | 0;
        const dd = Math.hypot(px - cx, py - cy) / maxD, m = 1 - vig * Math.max(0, dd - 0.35) * 1.4;
        r *= m; g *= m; b *= m;
      }
      p[i] = r; p[i + 1] = g; p[i + 2] = b;
    }
    x.putImageData(d, 0, 0);
    fxCache.set(key, c);
    if (fxCache.size > 24) fxCache.delete(fxCache.keys().next().value);
    return c;
  }

  // ---- text ----
  function fontStr(it, size) {
    return `${it.italic ? 'italic ' : ''}${it.bold ? 700 : (it.weight || 400)} ${size}px "${it.font}", system-ui, sans-serif`;
  }
  function ensureFont(it) {
    const k = fontStr(it, 40);
    if (fontsRequested.has(k)) return;
    fontsRequested.add(k);
    if (document.fonts && document.fonts.load) document.fonts.load(k, 'Aa').then(() => onAsync()).catch(() => {});
  }
  async function loadFonts(pages) {
    if (!document.fonts || !document.fonts.load) return;
    const keys = new Set();
    for (const p of pages) for (const it of p.items) if (it.type === 'text') keys.add(fontStr(it, 40));
    await Promise.all([...keys].map((k) => document.fonts.load(k, 'Aa').catch(() => {})));
  }
  function layoutText(ctx, it) {
    ctx.font = fontStr(it, it.size);
    const sp = it.letter || 0;
    const txt = it.caps ? String(it.text).toUpperCase() : String(it.text);
    const meas = (s) => ctx.measureText(s).width + sp * Math.max(0, [...s].length - 1);
    const lines = [];
    for (const para of txt.split('\n')) {
      const words = para.split(' ');
      let cur = '';
      for (const wd of words) {
        const t = cur ? cur + ' ' + wd : wd;
        if (cur && meas(t) > it.w + 0.5) { lines.push(cur); cur = wd; } else cur = t;
      }
      lines.push(cur);
    }
    return { lines, meas, sp };
  }
  function measureText(ctx, it) {
    ensureFont(it);
    const { lines } = layoutText(ctx, it);
    it.h = Math.max(it.size * (it.lineH || 1.3) * lines.length, it.size);
  }
  function drawText(ctx, it) {
    const { lines, meas, sp } = layoutText(ctx, it);
    const lh = it.size * (it.lineH || 1.3);
    ctx.fillStyle = it.color || '#000';
    ctx.textBaseline = 'middle';
    lines.forEach((ln, i) => {
      const y = i * lh + lh / 2;
      const w = meas(ln);
      let x = it.align === 'center' ? (it.w - w) / 2 : it.align === 'right' ? it.w - w : 0;
      if (!sp) { ctx.textAlign = 'left'; ctx.fillText(ln, x, y); return; }
      ctx.textAlign = 'left';
      for (const ch of ln) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + sp; }
    });
    if (it.underline) {
      ctx.fillRect(0, lines.length * lh - lh * 0.12, it.w, Math.max(1, it.size * 0.05));
    }
  }

  // ---- shapes ----
  function rrect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  function fillStroke(ctx, it) {
    if (it.fill) { ctx.fillStyle = it.fill; ctx.fill(); }
    if (it.stroke && it.strokeW > 0) {
      if (it.fill) ctx.shadowColor = 'transparent';
      ctx.lineWidth = it.strokeW; ctx.strokeStyle = it.stroke;
      ctx.lineJoin = 'round';
      if (it.dash) ctx.setLineDash([it.strokeW * 3, it.strokeW * 2.5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  function starPath(ctx, cx, cy, rx, ry, pts = 5, inner = 0.45) {
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const r = i % 2 ? inner : 1, a = -Math.PI / 2 + (i * Math.PI) / pts;
      const px = cx + Math.cos(a) * rx * r, py = cy + Math.sin(a) * ry * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  function heartPath(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.28);
    ctx.bezierCurveTo(w * 0.5, h * 0.02, 0, h * 0.0, 0, h * 0.32);
    ctx.bezierCurveTo(0, h * 0.6, w * 0.35, h * 0.76, w * 0.5, h);
    ctx.bezierCurveTo(w * 0.65, h * 0.76, w, h * 0.6, w, h * 0.32);
    ctx.bezierCurveTo(w, h * 0.0, w * 0.5, h * 0.02, w * 0.5, h * 0.28);
    ctx.closePath();
  }
  function sparklePath(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.quadraticCurveTo(w * 0.56, h * 0.44, w, h / 2);
    ctx.quadraticCurveTo(w * 0.56, h * 0.56, w / 2, h);
    ctx.quadraticCurveTo(w * 0.44, h * 0.56, 0, h / 2);
    ctx.quadraticCurveTo(w * 0.44, h * 0.44, w / 2, 0);
    ctx.closePath();
  }
  function tapePath(ctx, w, h) {
    const teeth = Math.max(3, Math.round(h / 9)), d = Math.min(w * 0.06, h * 0.18);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(w, 0);
    for (let i = 1; i <= teeth; i++) ctx.lineTo(w - (i % 2 ? d : 0), (h * i) / teeth);
    ctx.lineTo(0, h);
    for (let i = 1; i <= teeth; i++) ctx.lineTo(i % 2 ? d : 0, h - (h * i) / teeth);
    ctx.closePath();
  }
  function drawCover(ctx, src, w, h, it) {
    const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
    const s = Math.max(w / iw, h / ih) * (it.zoom || 1);
    const dw = iw * s, dh = ih * s;
    const dx = (w - dw) / 2 + (it.ox || 0) * (dw - w) / 2;
    const dy = (h - dh) / 2 + (it.oy || 0) * (dh - h) / 2;
    ctx.drawImage(src, dx, dy, dw, dh);
  }
  function photoClip(ctx, it) {
    if (it.shape === 'circle') { ctx.beginPath(); ctx.ellipse(it.w / 2, it.h / 2, it.w / 2, it.h / 2, 0, 0, Math.PI * 2); }
    else if (it.shape === 'arch') {
      const r = it.w / 2; ctx.beginPath(); ctx.moveTo(0, it.h); ctx.lineTo(0, r); ctx.arc(r, r, r, Math.PI, 0); ctx.lineTo(it.w, it.h); ctx.closePath();
    } else rrect(ctx, 0, 0, it.w, it.h, it.radius || 0);
  }

  function drawPattern(ctx, it, w, h) {
    const gap = Math.max(4, it.gap || 40), col = it.stroke || '#ccc', lw = it.strokeW || 1.5;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
    const style = it.style || 'lines';
    ctx.beginPath();
    if (style === 'lines' || style === 'grid') for (let y = gap; y <= h + 0.5; y += gap) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    if (style === 'grid') { for (let x = 0; x <= w + 0.5; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x, h); } ctx.moveTo(0, 0); ctx.lineTo(w, 0); }
    ctx.stroke();
    if (style === 'dots') {
      const r = Math.max(1, lw * 1.1);
      for (let y = gap / 2; y <= h; y += gap) for (let x = gap / 2; x <= w; x += gap) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  function drawGrid(ctx, it) {
    const { w, h } = it, rows = it.rows || 1, cols = it.cols || 1, cw = w / cols, ch = h / rows;
    ctx.lineWidth = it.strokeW || 1.5; ctx.strokeStyle = it.stroke || '#ccc';
    if (it.cell === 'box' || !it.cell) {
      if (it.fill) { ctx.fillStyle = it.fill; ctx.fillRect(0, 0, w, h); }
      ctx.beginPath();
      for (let r = 0; r <= rows; r++) { ctx.moveTo(0, r * ch); ctx.lineTo(w, r * ch); }
      for (let c = 0; c <= cols; c++) { ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, h); }
      ctx.stroke();
      return;
    }
    const s = Math.min(cw, ch);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cx = c * cw + cw / 2, cy = r * ch + ch / 2;
      if (it.cell === 'circle') { ctx.beginPath(); ctx.arc(cx, cy, s * 0.34, 0, Math.PI * 2); }
      else if (it.cell === 'star') starPath(ctx, cx, cy, s * 0.36, s * 0.36);
      else { const q = s * 0.74; rrect(ctx, cx - q / 2, cy - q / 2, q, q, q * 0.2); }
      if (it.fill) { ctx.fillStyle = it.fill; ctx.fill(); }
      ctx.stroke();
    }
  }

  const SHAPES = {
    rect(ctx, it) { rrect(ctx, 0, 0, it.w, it.h, it.radius); fillStroke(ctx, it); },
    ellipse(ctx, it) { ctx.beginPath(); ctx.ellipse(it.w / 2, it.h / 2, Math.abs(it.w / 2), Math.abs(it.h / 2), 0, 0, Math.PI * 2); fillStroke(ctx, it); },
    line(ctx, it) {
      ctx.beginPath(); ctx.moveTo(0, it.h / 2); ctx.lineTo(it.w, it.h / 2);
      ctx.lineCap = 'round'; ctx.lineWidth = it.strokeW || 2; ctx.strokeStyle = it.stroke || '#000';
      if (it.dash) ctx.setLineDash([it.strokeW * 0.01 + 1, it.strokeW * 3]);
      if (it.dash === 'dash') ctx.setLineDash([it.strokeW * 4, it.strokeW * 3]);
      ctx.stroke(); ctx.setLineDash([]);
    },
    star(ctx, it) { starPath(ctx, it.w / 2, it.h * 0.53, it.w / 2, it.h / 2 * 1.05); fillStroke(ctx, it); },
    heart(ctx, it) { heartPath(ctx, it.w, it.h); fillStroke(ctx, it); },
    sparkle(ctx, it) { sparklePath(ctx, it.w, it.h); fillStroke(ctx, it); },
    arrow(ctx, it) {
      const { w, h } = it, hh = Math.min(h, w * 0.35), t = h * 0.26;
      ctx.beginPath();
      ctx.moveTo(0, h / 2 - t / 2); ctx.lineTo(w - hh, h / 2 - t / 2); ctx.lineTo(w - hh, 0); ctx.lineTo(w, h / 2);
      ctx.lineTo(w - hh, h); ctx.lineTo(w - hh, h / 2 + t / 2); ctx.lineTo(0, h / 2 + t / 2); ctx.closePath();
      fillStroke(ctx, it);
    },
    blob(ctx, it) {
      const { w, h } = it; ctx.beginPath();
      ctx.moveTo(w * 0.5, 0);
      ctx.bezierCurveTo(w * 0.85, 0, w, h * 0.2, w * 0.95, h * 0.5);
      ctx.bezierCurveTo(w * 0.9, h * 0.85, w * 0.7, h, w * 0.45, h * 0.97);
      ctx.bezierCurveTo(w * 0.15, h * 0.94, 0, h * 0.75, w * 0.04, h * 0.45);
      ctx.bezierCurveTo(w * 0.08, h * 0.15, w * 0.25, 0, w * 0.5, 0);
      ctx.closePath(); fillStroke(ctx, it);
    },
    tape(ctx, it) {
      const { w, h } = it;
      tapePath(ctx, w, h);
      ctx.fillStyle = it.fill || '#e8c9b5'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.shadowColor = 'transparent';
      const p = it.pattern;
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      if (p === 'stripes') { ctx.lineWidth = h * 0.14; ctx.beginPath(); for (let x = -h; x < w + h; x += h * 0.42) { ctx.moveTo(x, h); ctx.lineTo(x + h, 0); } ctx.stroke(); }
      else if (p === 'dots') { const g = h * 0.3; for (let y = g / 2; y < h; y += g) for (let x = g / 2 + ((y / g) % 2 ? g / 2 : 0); x < w; x += g) { ctx.beginPath(); ctx.arc(x, y, h * 0.06, 0, Math.PI * 2); ctx.fill(); } }
      else if (p === 'grid') { ctx.lineWidth = Math.max(1, h * 0.04); ctx.beginPath(); const g = h * 0.25; for (let x = 0; x < w; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, h); } for (let y = 0; y < h; y += g) { ctx.moveTo(0, y); ctx.lineTo(w, y); } ctx.stroke(); }
      ctx.restore();
    },
    check(ctx, it) { rrect(ctx, 0, 0, it.w, it.h, it.radius ?? it.w * 0.25); fillStroke(ctx, it); },
    lines(ctx, it) { if (it.fill) { ctx.fillStyle = it.fill; ctx.fillRect(0, 0, it.w, it.h); } drawPattern(ctx, it, it.w, it.h); },
    grid(ctx, it) { drawGrid(ctx, it); },
    text(ctx, it) { drawText(ctx, it); },
    sticker(ctx, it) {
      ctx.font = `${Math.min(it.w, it.h) * 0.84}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(it.text, it.w / 2, it.h / 2 + it.h * 0.05);
    },
    photo(ctx, it, opt) {
      const img = getImg(it.asset);
      ctx.save();
      photoClip(ctx, it);
      if (img) {
        if (it.shadow) { ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowColor = 'transparent'; }
        ctx.clip();
        drawCover(ctx, filtered(it.asset, img, it.fx), it.w, it.h, it);
      } else {
        ctx.fillStyle = it.fill || '#ececec'; ctx.fill();
        if (opt.editor) {
          ctx.shadowColor = 'transparent';
          const s = Math.min(it.w, it.h) * 0.16;
          ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = Math.max(2, s * 0.08); ctx.lineCap = 'round';
          const cx = it.w / 2, cy = it.h / 2;
          ctx.beginPath(); ctx.moveTo(cx - s / 2, cy); ctx.lineTo(cx + s / 2, cy); ctx.moveTo(cx, cy - s / 2); ctx.lineTo(cx, cy + s / 2); ctx.stroke();
        }
      }
      ctx.restore();
      if (it.stroke && it.strokeW > 0) { photoClip(ctx, it); ctx.shadowColor = 'transparent'; ctx.lineWidth = it.strokeW; ctx.strokeStyle = it.stroke; ctx.stroke(); }
    },
  };

  function drawItem(ctx, it, opt = {}) {
    if (it.type === 'text') measureText(ctx, it);
    const { x, y, w, h } = it;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (it.rot) ctx.rotate((it.rot * Math.PI) / 180);
    if (it.flip) ctx.scale(-1, 1);
    ctx.translate(-w / 2, -h / 2);
    ctx.globalAlpha *= it.opacity ?? 1;
    if (it.shadow) {
      const m = Math.max(Math.min(w, h), 40);
      ctx.shadowColor = 'rgba(30,20,10,0.22)'; ctx.shadowBlur = m * 0.08 + 4; ctx.shadowOffsetY = m * 0.03 + 1;
    }
    const f = SHAPES[it.type];
    if (f) f(ctx, it, opt);
    ctx.restore();
  }

  function drawPage(ctx, page, W, H, scale, opt = {}) {
    ctx.save();
    ctx.setTransform(scale * (opt.dpr || 1), 0, 0, scale * (opt.dpr || 1), opt.ox || 0, opt.oy || 0);
    ctx.fillStyle = page.bg || '#fff';
    ctx.fillRect(0, 0, W, H);
    if (page.pattern && page.pattern.style && page.pattern.style !== 'none') {
      ctx.save(); drawPattern(ctx, page.pattern, W, H); ctx.restore();
    }
    for (const it of page.items) if (!it.hidden) drawItem(ctx, it, opt);
    ctx.restore();
  }

  function pageCanvas(page, W, H, scale, opt = {}) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * scale)); c.height = Math.max(1, Math.round(H * scale));
    drawPage(c.getContext('2d'), page, W, H, scale, opt);
    return c;
  }

  return { setAssets, setOnAsync, getImg, loadImages, loadFonts, drawPage, drawItem, pageCanvas, measureText, fontStr, FX0, fxIdentity, rrect };
})();
