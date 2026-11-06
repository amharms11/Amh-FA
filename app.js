/* AMH Finance — a private, offline-first personal finance tracker.
 * All data lives in this browser's localStorage. Nothing is sent anywhere. */
'use strict';

// ---------- Utilities ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = (n) => Math.round(n * 100) / 100;
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const money = (n, whole = false) => (whole ? usd0 : usd).format(n || 0);
const signed = (n) => (n > 0 ? '+' : '') + money(n);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const monthOf = (s) => s.slice(0, 7);
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return iso(d); };
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const daysInMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const monthLabel = (ym, short = false) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-US', short ? { month: 'short' } : { month: 'long', year: 'numeric' }); };
const dayLabel = (s) => {
  if (s === today()) return 'Today';
  if (s === addDays(today(), -1)) return 'Yesterday';
  return parseD(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};
const shortDate = (s) => parseD(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const normPayee = (s) => String(s || '').toLowerCase().replace(/[#*]?\d{3,}/g, '').replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim();
const parseMoney = (v) => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1')); return isNaN(n) ? 0 : n; };

// ---------- State ----------
const STORE_KEY = 'amhfa.v1';
const CHART_COLORS = ['#2f6bff', '#14a36b', '#e39a12', '#a35bff', '#e5484d', '#0ea5b7', '#d9468f', '#7a8599'];

const DEFAULT_CATEGORIES = [
  ['Groceries', '🛒', 600], ['Dining', '🍔', 300], ['Transport', '🚗', 250], ['Shopping', '🛍️', 250],
  ['Bills & Utilities', '💡', 300], ['Housing', '🏠', 0], ['Subscriptions', '🔁', 80], ['Entertainment', '🎬', 100],
  ['Health', '💊', 100], ['Travel', '✈️', 0], ['Personal Care', '💈', 60], ['Gifts & Donations', '🎁', 50], ['Loans', '🏦', 0], ['Other', '📦', 0],
].map(([name, emoji, budget]) => ({ id: uid(), name, emoji, budget, kind: 'expense' }))
  .concat([
    { id: uid(), name: 'Income', emoji: '💰', budget: 0, kind: 'income' },
    { id: uid(), name: 'Transfer', emoji: '↔️', budget: 0, kind: 'transfer' },
  ]);

const KEYWORD_HINTS = [
  [/whole foods|trader joe|kroger|safeway|aldi|publix|heb|costco|wegmans|grocery|market/, 'Groceries'],
  [/restaurant|cafe|coffee|starbucks|chipotle|mcdonald|doordash|uber ?eats|grubhub|pizza|taco|burger|bar |grill/, 'Dining'],
  [/uber|lyft|shell|chevron|exxon|bp |gas|parking|transit|metro|toll/, 'Transport'],
  [/amazon|target|walmart|best buy|etsy|ebay|nike/, 'Shopping'],
  [/electric|water|utility|comcast|xfinity|verizon|at&t|t mobile|internet|power|energy/, 'Bills & Utilities'],
  [/rent|mortgage|hoa/, 'Housing'],
  [/netflix|spotify|hulu|disney|apple|youtube|icloud|prime|subscription|patreon|tidal/, 'Subscriptions'],
  [/movie|cinema|ticketmaster|steam|playstation|xbox|concert/, 'Entertainment'],
  [/pharmacy|cvs|walgreens|doctor|dental|clinic|hospital|gym|fitness/, 'Health'],
  [/airline|delta|united|southwest|hotel|airbnb|marriott|hilton|expedia/, 'Travel'],
  [/payroll|salary|direct dep|deposit|interest paid|dividend|refund/, 'Income'],
  [/transfer|vault|payment thank|autopay|credit card payment|venmo|zelle/, 'Transfer'],
];

const ACCOUNT_TYPES = {
  checking: { label: 'Checking', emoji: '🏦', liability: false },
  savings: { label: 'Savings', emoji: '🐷', liability: false },
  cash: { label: 'Cash', emoji: '💵', liability: false },
  investment: { label: 'Investment', emoji: '📈', liability: false },
  retirement: { label: 'Retirement', emoji: '🏖️', liability: false },
  property: { label: 'Property / Vehicle', emoji: '🏡', liability: false },
  credit: { label: 'Credit card', emoji: '💳', liability: true },
  loan: { label: 'Loan / Mortgage', emoji: '🧾', liability: true },
};

function blankState() {
  return {
    version: 1,
    setup: false,
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, id: uid() })),
    accounts: [],
    transactions: [],
    recurrings: [],
    goals: [],
    rules: {},        // normalized payee -> categoryId
    snapshots: {},    // YYYY-MM-DD -> net worth
    dismissed: {},    // alert keys the user closed
    chat: [],         // Ask Claude conversation
    ui: { tab: 'today', month: monthOf(today()), txFilter: 'all', txQuery: '', theme: 'auto', remindDays: 3, notify: false,
      report: { range: 'thisMonth', group: 'category' } },
  };
}

let state = load();
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const base = blankState();
      return { ...base, ...s, ui: { ...base.ui, ...(s.ui || {}), month: monthOf(today()) } };
    }
  } catch (e) { console.warn('Could not load saved data', e); }
  return blankState();
}
function save() {
  if (state.setup && state.accounts.length) state.snapshots[today()] = round2(netWorth().net);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — storage full or blocked'); }
}

// ---------- Derived data ----------
const cat = (id) => state.categories.find((c) => c.id === id) || { name: 'Uncategorized', emoji: '❔', kind: 'expense', id: null };
const acct = (id) => state.accounts.find((a) => a.id === id);
const expenseCats = () => state.categories.filter((c) => c.kind === 'expense');

function accountBalance(a) {
  return round2((a.opening || 0) + state.transactions.reduce((s, t) => (t.accountId === a.id ? s + t.amount : s), 0));
}
function netWorth() {
  let assets = 0, liabilities = 0;
  for (const a of state.accounts) {
    if (a.hidden) continue;
    const b = accountBalance(a);
    if (ACCOUNT_TYPES[a.type]?.liability) liabilities += -b; else assets += b;
  }
  return { assets: round2(assets), liabilities: round2(liabilities), net: round2(assets - liabilities) };
}
function txInMonth(ym) { return state.transactions.filter((t) => monthOf(t.date) === ym); }
/** A transaction's category amounts: its split parts, or the whole amount in one category. */
const parts = (t) => (t.splits?.length ? t.splits : [{ categoryId: t.categoryId, amount: t.amount }]);
function spendingByCategory(ym) {
  const map = {};
  for (const t of txInMonth(ym)) {
    for (const p of parts(t)) {
      const c = cat(p.categoryId);
      if (c.kind !== 'expense') continue;
      map[c.id] = (map[c.id] || 0) - p.amount;
    }
  }
  return map;
}
function monthTotals(ym) {
  let spent = 0, income = 0;
  for (const t of txInMonth(ym)) {
    for (const p of parts(t)) {
      const k = cat(p.categoryId).kind;
      if (k === 'expense') spent -= p.amount;
      else if (k === 'income') income += p.amount;
    }
  }
  return { spent: round2(spent), income: round2(income) };
}
const totalBudget = () => expenseCats().reduce((s, c) => s + (+c.budget || 0), 0);

/** Your saved category rule for a store: an exact match, or the longest saved name the payee contains. */
function ruleFor(payee) {
  const n = normPayee(payee);
  if (state.rules[n] && cat(state.rules[n]).id) return state.rules[n];
  let best = null;
  for (const [key, cid] of Object.entries(state.rules)) {
    if (key.length >= 3 && n.includes(key) && cat(cid).id && (!best || key.length > best[0].length)) best = [key, cid];
  }
  return best ? best[1] : null;
}
function guessCategory(payee) {
  const n = normPayee(payee);
  const rule = ruleFor(payee);
  if (rule) return rule;
  if (isOwnMove(payee) && transferCatId()) return transferCatId();
  for (const [re, name] of KEYWORD_HINTS) if (re.test(n + ' ')) {
    const c = state.categories.find((x) => x.name === name);
    if (c) return c.id;
  }
  return state.categories.find((c) => c.name === 'Other')?.id || null;
}

// --- Recurring schedule ---
function occurrencesInMonth(r, ym) {
  const start = r.start;
  const out = [];
  const [y, m] = ym.split('-').map(Number);
  const dim = daysInMonth(ym);
  const sd = parseD(start);
  if (r.freq === 'monthly') {
    out.push(`${ym}-${pad(Math.min(sd.getDate(), dim))}`);
  } else if (r.freq === 'yearly') {
    if (sd.getMonth() + 1 === m) out.push(`${ym}-${pad(Math.min(sd.getDate(), dim))}`);
  } else if (r.freq === 'quarterly') {
    if (((m - 1 - sd.getMonth()) % 3 + 3) % 3 === 0) out.push(`${ym}-${pad(Math.min(sd.getDate(), dim))}`);
  } else {
    const step = r.freq === 'biweekly' ? 14 : 7;
    const first = new Date(y, m - 1, 1);
    let diff = Math.round((first - sd) / 86400000);
    let k = Math.ceil(diff / step);
    let d = new Date(sd); d.setDate(sd.getDate() + k * step);
    while (d.getMonth() === m - 1) { out.push(iso(d)); d.setDate(d.getDate() + step); }
  }
  return out.filter((d) => d >= start);
}
function findPayment(r, date) {
  const lo = addDays(date, -5), hi = addDays(date, 5);
  const key = r.match || normPayee(r.name);
  return state.transactions.find((t) => t.date >= lo && t.date <= hi && (
    t.recurringId === r.id ||
    (key && normPayee(t.payee).includes(key) && (r.variable || Math.abs(Math.abs(t.amount) - r.amount) <= Math.max(2, r.amount * 0.25)))
  ));
}
function nextDue(r) {
  const t = today();
  for (let i = 0; i < 14; i++) {
    const ym = addMonths(monthOf(t), i);
    for (const d of occurrencesInMonth(r, ym)) if (d >= t && !findPayment(r, d)) return d;
  }
  return null;
}
const monthlyEquivalent = (r) => r.amount * ({ weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[r.freq] || 1);

// ---------- Charts (inline SVG) ----------
function ring(pct, color = 'var(--accent)', size = 112, stroke = 12) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c * p} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}
function donut(parts, size = 120, stroke = 16) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let off = 0;
  const segs = parts.map((p) => {
    const len = (p.value / total) * c;
    const s = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${stroke}"
      stroke-dasharray="${Math.max(0, len - 2)} ${c}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
    off += len; return s;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${stroke}"/>${segs}</svg>`;
}
function bars(items, h = 120) {
  const w = 300, gap = 8, bw = (w - gap * (items.length - 1)) / items.length;
  const max = Math.max(1, ...items.map((i) => i.value));
  return `<svg class="chart" viewBox="0 0 ${w} ${h + 18}" role="img" aria-label="Monthly spending">
    ${items.map((it, i) => {
      const bh = Math.max(2, (it.value / max) * h);
      const x = i * (bw + gap);
      return `<rect x="${x}" y="${h - bh}" width="${bw}" height="${bh}" rx="5" fill="${it.highlight ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 35%, transparent)'}"><title>${esc(it.label)}: ${money(it.value)}</title></rect>
        <text x="${x + bw / 2}" y="${h + 14}" text-anchor="middle">${esc(it.label)}</text>`;
    }).join('')}
  </svg>`;
}
function line(points, h = 110) {
  if (points.length < 2) return '<p class="muted small">History builds up as you use the app.</p>';
  const w = 300;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max === min) { max += 1; min -= 1; }
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 6 - ((p.value - min) / (max - min)) * (h - 16)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  const col = up ? 'var(--good)' : 'var(--bad)';
  return `<svg class="chart" viewBox="0 0 ${w} ${h + 16}" role="img" aria-label="Net worth trend">
    <defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".25"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${w},${h} L0,${h} Z" fill="url(#lg)"/>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    <text x="0" y="${h + 14}">${esc(shortDate(points[0].date))}</text>
    <text x="${w}" y="${h + 14}" text-anchor="end">${esc(shortDate(points[points.length - 1].date))}</text>
  </svg>`;
}

// ---------- UI helpers ----------
let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
function closeSheet() { $('#sheetRoot').innerHTML = ''; document.body.style.overflow = ''; }
function openSheet(title, html, onMount) {
  const root = $('#sheetRoot');
  root.innerHTML = `<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="grab"></div><h3>${esc(title)} <button class="link" data-close>Close</button></h3>${html}</div></div>`;
  document.body.style.overflow = 'hidden';
  const bd = $('.sheet-backdrop', root);
  bd.addEventListener('click', (e) => { if (e.target === bd || e.target.closest('[data-close]')) closeSheet(); });
  onMount && onMount($('.sheet', root));
}

/** Generic form sheet. fields: [{key,label,type,options,placeholder,required}] */
function openForm({ title, fields, values = {}, onSave, onDelete, saveLabel = 'Save', extraHTML = '', onMount }) {
  const fieldHTML = (f) => {
    const v = values[f.key] ?? f.default ?? '';
    const id = 'f_' + f.key;
    if (f.type === 'segment') return `<div class="field"><span>${esc(f.label || '')}</span><div class="segmented" data-seg="${f.key}">
      ${f.options.map((o) => `<button type="button" data-v="${esc(o.value)}" class="${o.value === v ? 'on' : ''}">${esc(o.label)}</button>`).join('')}</div>
      <input type="hidden" name="${f.key}" value="${esc(v)}"></div>`;
    if (f.type === 'select') return `<label class="field"><span>${esc(f.label)}</span><select id="${id}" name="${f.key}">
      ${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
    if (f.type === 'checkbox') return `<label class="field check"><input type="checkbox" name="${f.key}" ${v ? 'checked' : ''}><span>${esc(f.label)}</span></label>`;
    if (f.type === 'textarea') return `<label class="field"><span>${esc(f.label)}</span><textarea name="${f.key}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea></label>`;
    const type = f.type === 'money' ? 'text' : f.type || 'text';
    const extra = f.type === 'money' ? `inputmode="decimal" class="${f.big ? 'amount-input' : ''}"` : '';
    return `<label class="field"><span>${esc(f.label)}</span><input id="${id}" name="${f.key}" type="${type}" ${extra}
      value="${esc(f.type === 'money' && v !== '' ? Number(v).toFixed(2) : v)}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} list="${f.list ? id + '_list' : ''}"></label>
      ${f.list ? `<datalist id="${id}_list">${f.list.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
  };
  openSheet(title, `<form novalidate>${fields.map(fieldHTML).join('')}${extraHTML}
    <button class="btn" type="submit">${esc(saveLabel)}</button>
    ${onDelete ? '<div class="btn-row"><button class="btn danger" type="button" data-del>Delete</button></div>' : ''}</form>`, (sheet) => {
    const form = $('form', sheet);
    $$('[data-seg]', form).forEach((seg) => seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
      form.elements[seg.dataset.seg].value = b.dataset.v;
    }));
    const first = $('input:not([type=hidden]),select', form);
    if (first && !('ontouchstart' in window)) first.focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const vals = {};
      for (const f of fields) {
        const el = form.elements[f.key];
        if (!el) continue;
        vals[f.key] = f.type === 'checkbox' ? el.checked : f.type === 'money' || f.type === 'number' ? parseMoney(el.value) : el.value.trim();
        if (f.required && (vals[f.key] === '' || (f.type === 'money' && !el.value.trim()))) { toast(`${f.label} is required`); el.focus?.(); return; }
      }
      if (onSave(vals, form) !== false) { save(); closeSheet(); render(); }
    });
    const del = $('[data-del]', form);
    if (del) del.addEventListener('click', () => { if (confirm('Delete this item?')) { onDelete(); save(); closeSheet(); render(); } });
    onMount && onMount(form);
  });
}

const catOptions = (kinds = ['expense', 'income', 'transfer']) => state.categories.filter((c) => kinds.includes(c.kind)).map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }));
const acctOptions = (withNone = true) => (withNone ? [{ value: '', label: 'No account' }] : []).concat(state.accounts.map((a) => ({ value: a.id, label: `${ACCOUNT_TYPES[a.type]?.emoji || ''} ${a.name}` })));

// ---------- Forms ----------
function txForm(t) {
  const isNew = !t;
  t = t || { date: today(), amount: 0, payee: '', categoryId: '', accountId: state.ui.lastAccount || state.accounts[0]?.id || '', note: '' };
  const kind = t.amount > 0 ? 'in' : 'out';
  const payees = [...new Set(state.transactions.map((x) => x.payee))].slice(0, 200);
  openForm({
    title: isNew ? 'New transaction' : 'Edit transaction',
    values: { ...t, amount: t.amount ? Math.abs(t.amount) : '', kind },
    fields: [
      { key: 'kind', type: 'segment', options: [{ value: 'out', label: 'Expense' }, { value: 'in', label: 'Income / refund' }] },
      { key: 'amount', label: 'Amount', type: 'money', big: true, required: true, placeholder: '0.00' },
      { key: 'payee', label: 'Payee', required: true, placeholder: 'e.g. Trader Joe’s', list: payees },
      { key: 'categoryId', label: 'Category', type: 'select', options: [{ value: '', label: 'Auto-categorize' }, ...catOptions()] },
      { key: 'accountId', label: 'Account', type: 'select', options: acctOptions() },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'note', label: 'Note', placeholder: 'Optional' },
      { key: 'learn', label: 'Always use this category for this payee', type: 'checkbox', default: true },
    ],
    onSave(v) {
      const amount = round2(Math.abs(v.amount) * (v.kind === 'in' ? 1 : -1));
      if (!amount) { toast('Enter an amount'); return false; }
      const categoryId = v.categoryId || guessCategory(v.payee);
      if (v.learn && v.categoryId) state.rules[normPayee(v.payee)] = v.categoryId;
      const rec = { ...t, date: v.date, amount, payee: v.payee, categoryId, accountId: v.accountId, note: v.note };
      if (isNew) { rec.id = uid(); state.transactions.push(rec); toast('Transaction added'); }
      else Object.assign(state.transactions.find((x) => x.id === t.id), rec);
      state.ui.lastAccount = v.accountId;
    },
    onDelete: isNew ? null : () => { state.transactions = state.transactions.filter((x) => x.id !== t.id); toast('Deleted'); },
    extraHTML: isNew ? '' : `<button type="button" class="btn secondary" data-split style="margin-bottom:12px">${t.splits?.length
      ? `✂️ Split into ${t.splits.length} categories — edit` : '✂️ Split across categories'}</button>`,
    onMount: isNew ? null : (form) => $('[data-split]', form).addEventListener('click', () => { closeSheet(); splitForm(t); }),
  });
}

function accountForm(a) {
  const isNew = !a;
  a = a || { name: '', type: 'checking', opening: 0, institution: '' };
  const current = isNew ? '' : Math.abs(accountBalance(a));
  openForm({
    title: isNew ? 'New account' : 'Edit account',
    values: { ...a, balance: current },
    fields: [
      { key: 'name', label: 'Name', required: true, placeholder: 'e.g. Chase Checking' },
      { key: 'institution', label: 'Institution', placeholder: 'Optional' },
      { key: 'type', label: 'Type', type: 'select', options: Object.entries(ACCOUNT_TYPES).map(([value, t]) => ({ value, label: `${t.emoji} ${t.label}` })) },
      { key: 'balance', label: isNew ? 'Current balance (amount owed for cards/loans)' : 'Current balance — change to update', type: 'money', required: true, placeholder: '0.00' },
      { key: 'hidden', label: 'Hide from totals on Home', type: 'checkbox' },
    ],
    onSave(v) {
      const liability = ACCOUNT_TYPES[v.type].liability;
      const desired = liability ? -Math.abs(v.balance) : v.balance;
      const rec = isNew ? { id: uid() } : state.accounts.find((x) => x.id === a.id);
      if (isNew || v.type !== rec.type) rec.typeLocked = true; // your choice wins over SoFi's label
      Object.assign(rec, { name: v.name, institution: v.institution, type: v.type, hidden: v.hidden });
      const txSum = state.transactions.reduce((s, t) => (t.accountId === rec.id ? s + t.amount : s), 0);
      rec.opening = round2(desired - txSum);
      if (isNew) state.accounts.push(rec);
      toast(isNew ? 'Account added' : 'Account updated');
    },
    onDelete: isNew ? null : () => {
      state.accounts = state.accounts.filter((x) => x.id !== a.id);
      state.transactions.forEach((t) => { if (t.accountId === a.id) t.accountId = ''; });
    },
  });
}

function recurringForm(r) {
  const isNew = !r || !r.id;
  r = { name: '', amount: '', freq: 'monthly', start: today(), emoji: '🔁', categoryId: state.categories.find((c) => c.name === 'Subscriptions')?.id, accountId: '', ...(r || {}) };
  openForm({
    title: isNew ? 'New bill' : 'Edit bill',
    values: r,
    fields: [
      { key: 'name', label: 'Bill name', required: true, placeholder: 'e.g. Rent, Electric, Netflix, Car payment' },
      { key: 'emoji', label: 'Emoji', maxlength: 4 },
      { key: 'amount', label: 'Budgeted amount', type: 'money', required: true, big: true },
      { key: 'start', label: 'Due date (next or most recent one)', type: 'date', required: true },
      { key: 'freq', label: 'Repeats', type: 'select', options: [['monthly', 'Every month'], ['biweekly', 'Every 2 weeks'], ['weekly', 'Every week'], ['quarterly', 'Every 3 months'], ['yearly', 'Every year']].map(([value, label]) => ({ value, label })) },
      { key: 'variable', label: 'The amount changes each time (e.g. electric, water)', type: 'checkbox' },
      { key: 'autopay', label: 'Paid automatically (autopay)', type: 'checkbox' },
      { key: 'match', label: 'Match payments containing these words (optional)', placeholder: 'e.g. auto loan — as it appears in your transactions' },
      { key: 'categoryId', label: 'Category', type: 'select', options: catOptions(['expense', 'transfer']) },
      { key: 'accountId', label: 'Paid from', type: 'select', options: acctOptions() },
    ],
    onSave(v) {
      const rec = isNew ? { id: uid() } : state.recurrings.find((x) => x.id === r.id);
      Object.assign(rec, { ...v, amount: round2(Math.abs(v.amount)), emoji: v.emoji || '🔁' });
      rec.match = v.match ? normPayee(v.match) : (r.match || '');
      if (r.suggKey) delete (state.ignoredBills || {})[r.suggKey];
      if (isNew) state.recurrings.push(rec);
      toast(isNew ? 'Bill added' : 'Saved');
    },
    onDelete: isNew ? null : () => { state.recurrings = state.recurrings.filter((x) => x.id !== r.id); },
  });
}

function recurringDetail(r, date) {
  const paid = findPayment(r, date);
  const last = paid || lastPayment(r);
  const diff = last ? round2(-last.amount - r.amount) : 0;
  openSheet(r.name, `
    <div class="card"><div class="spread"><div class="row"><div class="emoji">${esc(r.emoji)}</div>
      <div><div class="mid">${money(r.amount)}</div><div class="muted small">budgeted · ${esc(r.freq)} · due ${esc(shortDate(date))}${r.autopay ? ' · autopay' : ''}</div></div></div>
      ${paid ? '<span class="pill good">Paid</span>' : '<span class="pill warn">Unpaid</span>'}</div>
      ${paid ? `<p class="muted small">Matched: ${esc(paid.payee)} on ${esc(shortDate(paid.date))} (${money(paid.amount)})</p>` : ''}
      ${last ? `<p class="small" style="margin:6px 0 0">${paid ? 'Paid' : 'Last paid'} ${money(-last.amount)}${Math.abs(diff) >= 1 ? ` — <span class="${diff > 0 ? 'bad' : 'good'}">${money(Math.abs(diff))} ${diff > 0 ? 'over' : 'under'} budget</span>` : ' — right on budget'}</p>` : ''}
    </div>
    ${paid ? '' : '<button class="btn" data-pay>Mark as paid (adds transaction)</button>'}
    <div class="btn-row"><button class="btn secondary" data-edit>Edit</button></div>`, (sheet) => {
    $('[data-pay]', sheet)?.addEventListener('click', () => {
      state.transactions.push({ id: uid(), date, amount: -r.amount, payee: r.name, categoryId: r.categoryId, accountId: r.accountId, recurringId: r.id, note: '' });
      save(); closeSheet(); render(); toast('Marked paid');
    });
    $('[data-edit]', sheet).addEventListener('click', () => { closeSheet(); recurringForm(r); });
  });
}

function budgetForm(c) {
  openForm({
    title: `${c.emoji} ${c.name}`,
    values: c,
    fields: [
      { key: 'name', label: 'Category name', required: true },
      { key: 'emoji', label: 'Emoji', maxlength: 4 },
      { key: 'budget', label: 'Monthly budget (0 = no budget)', type: 'money' },
    ],
    onSave(v) { Object.assign(c, { name: v.name, emoji: v.emoji || '📦', budget: Math.max(0, v.budget) }); },
    onDelete: state.transactions.some((t) => t.categoryId === c.id) ? null : () => { state.categories = state.categories.filter((x) => x.id !== c.id); },
  });
}
function newCategoryForm() {
  openForm({
    title: 'New category',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'emoji', label: 'Emoji', maxlength: 4, default: '📦' },
      { key: 'kind', type: 'segment', default: 'expense', options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }] },
      { key: 'budget', label: 'Monthly budget', type: 'money' },
    ],
    onSave(v) { state.categories.push({ id: uid(), name: v.name, emoji: v.emoji || '📦', kind: v.kind, budget: v.budget || 0 }); },
  });
}

function goalForm(g) {
  const isNew = !g;
  g = g || { name: '', emoji: '🎯', target: '', saved: 0, by: '' };
  openForm({
    title: isNew ? 'New goal' : 'Edit goal',
    values: g,
    fields: [
      { key: 'name', label: 'Goal', required: true, placeholder: 'e.g. Emergency fund' },
      { key: 'emoji', label: 'Emoji', maxlength: 4 },
      { key: 'target', label: 'Target amount', type: 'money', required: true },
      { key: 'saved', label: 'Saved so far', type: 'money' },
      { key: 'by', label: 'Target date (optional)', type: 'date' },
    ],
    onSave(v) {
      const rec = isNew ? { id: uid() } : state.goals.find((x) => x.id === g.id);
      Object.assign(rec, { ...v, emoji: v.emoji || '🎯' });
      if (isNew) state.goals.push(rec);
    },
    onDelete: isNew ? null : () => { state.goals = state.goals.filter((x) => x.id !== g.id); },
  });
}

// ---------- CSV import ----------
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur); if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}
function normalizeDate(s) {
  s = String(s || '').trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/))) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${pad(m[1])}-${pad(m[2])}`;
  }
  const d = new Date(s);
  return isNaN(d) ? null : iso(d);
}
function importCSVFlow(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) { toast('That CSV looks empty'); return; }
  const header = rows[0].map((h) => h.trim());
  const find = (re) => { const i = header.findIndex((h) => re.test(h.toLowerCase())); return i < 0 ? '' : String(i); };
  const colOpts = [{ value: '', label: '— none —' }, ...header.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))];
  openForm({
    title: `Import ${rows.length - 1} rows`,
    saveLabel: 'Import',
    values: {
      date: find(/date/), payee: find(/desc|payee|merchant|name|memo/), amount: find(/^amount|amount$/),
      debit: find(/debit|withdraw/), credit: find(/credit|deposit/), accountId: state.accounts[0]?.id || '', sign: 'neg',
    },
    extraHTML: `<p class="muted small">Preview: ${esc(rows[1].join(' · ')).slice(0, 160)}</p>`,
    fields: [
      { key: 'accountId', label: 'Into account', type: 'select', options: acctOptions() },
      { key: 'date', label: 'Date column', type: 'select', options: colOpts },
      { key: 'payee', label: 'Description column', type: 'select', options: colOpts },
      { key: 'amount', label: 'Amount column', type: 'select', options: colOpts },
      { key: 'sign', label: 'In the amount column, purchases are…', type: 'segment', options: [{ value: 'neg', label: 'Negative' }, { value: 'pos', label: 'Positive' }] },
      { key: 'debit', label: '…or separate Debit column', type: 'select', options: colOpts },
      { key: 'credit', label: 'Credit column', type: 'select', options: colOpts },
    ],
    onSave(v) {
      if (v.date === '' || v.payee === '' || (v.amount === '' && v.debit === '')) { toast('Pick date, description and amount columns'); return false; }
      const seen = new Set(state.transactions.map((t) => `${t.date}|${t.amount}|${normPayee(t.payee)}`));
      let added = 0, skipped = 0;
      for (const r of rows.slice(1)) {
        const date = normalizeDate(r[+v.date]);
        const payee = (r[+v.payee] || '').trim();
        let amount;
        if (v.amount !== '') { amount = parseMoney(r[+v.amount]); if (v.sign === 'pos') amount = -amount; }
        else amount = parseMoney(r[+v.credit]) - Math.abs(parseMoney(r[+v.debit]));
        amount = round2(amount);
        if (!date || !payee || !amount) { skipped++; continue; }
        const key = `${date}|${amount}|${normPayee(payee)}`;
        if (seen.has(key)) { skipped++; continue; }
        seen.add(key);
        state.transactions.push({ id: uid(), date, amount, payee, categoryId: guessCategory(payee), accountId: v.accountId, note: '' });
        added++;
      }
      toast(`Imported ${added}${skipped ? `, skipped ${skipped}` : ''}`);
    },
  });
}
function pickFile(accept, cb) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept;
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => cb(String(rd.result)); rd.readAsText(f); };
  inp.click();
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ---------- Bank sync import (SoFi Tracker / Plaid export) ----------
// Plaid's convention: amount > 0 is money OUT. This app uses amount < 0 for money out.
const PLAID_CATEGORY_MAP = [
  [/^FOOD_AND_DRINK_GROCERIES/, 'Groceries'], [/^FOOD_AND_DRINK/, 'Dining'],
  [/^RENT_AND_UTILITIES_RENT/, 'Housing'], [/^LOAN_PAYMENTS_MORTGAGE/, 'Housing'], [/^RENT_AND_UTILITIES/, 'Bills & Utilities'],
  [/^TRANSPORTATION/, 'Transport'], [/^TRAVEL/, 'Travel'],
  [/^GENERAL_MERCHANDISE|^HOME_IMPROVEMENT/, 'Shopping'], [/^ENTERTAINMENT/, 'Entertainment'],
  [/^MEDICAL|^PERSONAL_CARE_GYMS/, 'Health'], [/^PERSONAL_CARE/, 'Personal Care'],
  [/^GOVERNMENT_AND_NON_PROFIT_DONATIONS/, 'Gifts & Donations'],
  [/^INCOME|^TRANSFER_IN_DEPOSIT/, 'Income'],
  [/^LOAN_PAYMENTS_CREDIT_CARD/, 'Transfer'], [/^LOAN_PAYMENTS/, 'Loans'],
  [/^TRANSFER_IN|^TRANSFER_OUT/, 'Transfer'],
  [/^BANK_FEES|^GENERAL_SERVICES/, 'Bills & Utilities'],
];
/** Money moved between your own accounts (SoFi vaults, savings transfers) — not spending, not a bill. */
const OWN_MOVE_RE = /\bvaults?\b|\b(to|from) (savings|checking)\b|transfer (to|from)|internal transfer|round ?ups?\b/;
const isOwnMove = (payee) => OWN_MOVE_RE.test(normPayee(payee));
const transferCatId = () => state.categories.find((c) => c.kind === 'transfer')?.id;
function categorizePlaid(payee, p) {
  const rule = ruleFor(payee);
  if (rule) return rule;
  if (isOwnMove(payee) && transferCatId()) return transferCatId();
  for (const code of [p.subcategory, p.category]) {
    if (!code) continue;
    const hit = PLAID_CATEGORY_MAP.find(([re]) => re.test(code));
    const c = hit && state.categories.find((x) => x.name === hit[1]);
    if (c) return c.id;
  }
  return guessCategory(payee);
}
function plaidAccountType(a) {
  const t = String(a.type || '').toLowerCase(), s = String(a.subtype || '').toLowerCase();
  if (t.includes('credit')) return 'credit';
  if (t.includes('loan')) return 'loan';
  if (t.includes('investment') || t.includes('brokerage')) return /401|403|457|ira|roth|retire|pension/.test(s) ? 'retirement' : 'investment';
  if (s.includes('saving') || s.includes('money market') || s === 'cd' || /saving|vault/i.test(a.name || '')) return 'savings';
  if (s.includes('checking') || /check/i.test(a.name || '')) return 'checking';
  // A bank account SoFi doesn't label, and that isn't named "checking", is treated as savings (e.g. a vault).
  return (!s || s === 'none' || s === 'null') && a.name ? 'savings' : 'checking';
}
/** Accepts the SoFi Tracker export file, or its raw ~/.sofi-tracker/transactions.json store. */
function parsePlaidFile(data) {
  if (Array.isArray(data?.transactions) && Array.isArray(data?.accounts) && !Array.isArray(data?.categories)) {
    return { accounts: data.accounts, txns: data.transactions, meta: data };
  }
  if (data && typeof data.txns === 'object' && !Array.isArray(data.txns)) {
    const accounts = Array.isArray(data.account_details) ? data.account_details
      : Object.entries(data.accounts || {}).map(([account_id, name]) => ({ account_id, name }));
    return { accounts, txns: Object.values(data.txns), meta: data };
  }
  return null;
}
function importPlaidFlow(data) {
  const parsed = parsePlaidFile(data);
  if (!parsed) { toast('Not a SoFi Tracker export file'); return; }
  const unmapped = parsed.accounts.filter((a) => !state.accounts.some((x) => x.plaidId === a.account_id));
  if (!unmapped.length) { applyPlaid(parsed); save(); render(); return; }
  const free = state.accounts.filter((x) => !x.plaidId);
  openForm({
    title: 'Match bank accounts',
    saveLabel: 'Import',
    extraHTML: '<p class="muted small">New accounts from SoFi (for example a new vault). Choose “Create new account” to add it, or link it to one you already track. This is remembered for future syncs.</p>',
    fields: unmapped.map((a) => ({
      key: a.account_id, type: 'select',
      label: `${a.name}${a.mask ? ' ••' + a.mask : ''}${a.current != null ? ' — ' + money(a.current) : ''}`,
      options: [{ value: '', label: '➕ Create new account' }, ...free.map((x) => ({ value: x.id, label: `Link to: ${x.name}` }))],
    })),
    onSave(v) {
      for (const a of unmapped) {
        const existing = v[a.account_id] && acct(v[a.account_id]);
        if (existing) existing.plaidId = a.account_id;
        else state.accounts.push({ id: uid(), plaidId: a.account_id, name: a.name || 'Bank account', institution: parsed.meta.source || 'SoFi', type: plaidAccountType(a), opening: 0 });
      }
      if (!state.setup) state.setup = true;
      applyPlaid(parsed);
    },
  });
}
function applyPlaid({ accounts, txns, meta }) {
  const byPlaid = (pid) => state.accounts.find((a) => a.plaidId === pid);
  const fileIds = new Set(txns.map((t) => t.id));
  const fileAccts = new Set(accounts.map((a) => a.account_id).concat(txns.map((t) => t.account_id)));
  let added = 0, updated = 0, removed = 0;
  // Drop synced transactions the bank no longer reports (e.g. pending charges that posted under a new id).
  state.transactions = state.transactions.filter((t) => {
    if (t.source !== 'plaid' || !t.extId) return true;
    const a = acct(t.accountId);
    if (a && fileAccts.has(a.plaidId) && !fileIds.has(t.extId)) { removed++; return false; }
    return true;
  });
  const known = new Map(state.transactions.filter((t) => t.extId).map((t) => [t.extId, t]));
  for (const p of txns) {
    const a = byPlaid(p.account_id);
    if (!a || !p.date || p.amount == null) continue;
    const amount = round2(-Number(p.amount));
    const pending = !!p.pending;
    const ex = known.get(p.id);
    if (ex) { // keep the user's category/payee/note edits
      if (ex.date !== p.date || ex.amount !== amount || !!ex.pending !== pending) updated++;
      Object.assign(ex, { date: p.date, amount, pending, accountId: a.id, plaidCat: p.subcategory || p.category || ex.plaidCat || '' });
      fixSplits(ex);
      continue;
    }
    const dup = state.transactions.find((t) => !t.extId && t.accountId === a.id && t.date === p.date && t.amount === amount);
    if (dup) { Object.assign(dup, { extId: p.id, source: 'plaid', pending }); known.set(p.id, dup); updated++; continue; }
    const payee = p.merchant || p.name || 'Unknown';
    const t = { id: uid(), extId: p.id, source: 'plaid', date: p.date, amount, payee, categoryId: categorizePlaid(payee, p), accountId: a.id, note: '', pending, plaidCat: p.subcategory || p.category || '' };
    state.transactions.push(t); known.set(p.id, t); added++;
  }
  // Use the bank's reported balance as the source of truth.
  for (const pa of accounts) {
    const a = byPlaid(pa.account_id);
    if (!a) continue;
    // Follow SoFi's own account type on every sync, unless you've set the type yourself.
    a.plaidType = String(pa.type || ''); a.plaidSubtype = String(pa.subtype || '');
    if (!a.typeLocked) a.type = plaidAccountType(pa);
    if (pa.current == null) continue;
    const desired = ACCOUNT_TYPES[a.type]?.liability ? -Math.abs(pa.current) : Number(pa.current);
    const txSum = state.transactions.reduce((s, t) => (t.accountId === a.id ? s + t.amount : s), 0);
    a.opening = round2(desired - txSum);
    a.available = pa.available == null ? null : Number(pa.available);
    a.limit = pa.limit == null ? null : Number(pa.limit);
  }
  state.sync = { source: meta.source || 'SoFi', at: meta.last_sync || meta.exported_at || new Date().toISOString(), imported: new Date().toISOString(), added, updated, removed };
  toast(`Synced: ${added} new, ${updated} updated${removed ? `, ${removed} removed` : ''}`);
}
// When opened via `python sofi_tracker.py app`, a local API is available for one-tap sync.
let localApi = null; // { connected, last_sync } or null
async function detectLocalApi() {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  try {
    const r = await fetch('api/status', { cache: 'no-store' });
    if (!r.ok) return;
    localApi = await r.json();
    render();
    const linked = localApi.connected && state.setup && state.accounts.some((a) => a.plaidId);
    // Opening the app: if SoFi hasn't been checked in the last hour, sync now.
    const stale = !localApi.last_sync || Date.now() - new Date(localApi.last_sync).getTime() > 60 * 60 * 1000;
    if (linked && stale && !syncing && !detectLocalApi.didOpenSync) { detectLocalApi.didOpenSync = true; await syncNow(); return; }
    // Quietly bring in anything synced since last time (e.g. by the 7am/8pm sync), once accounts are matched.
    if (linked && localApi.last_sync && localApi.last_sync !== state.sync?.at) {
      const data = await (await fetch('api/export', { cache: 'no-store' })).json();
      const parsed = parsePlaidFile(data);
      if (parsed && parsed.accounts.every((a) => state.accounts.some((x) => x.plaidId === a.account_id))) { applyPlaid(parsed); save(); render(); }
      else if (parsed && !document.querySelector('.sheet')) importPlaidFlow(data); // a new account/vault appeared: ask where it goes
    }
  } catch { /* not running under the local server */ }
}
let syncing = false;
async function syncNow() {
  if (syncing) return;
  syncing = true; render(); toast('Syncing with SoFi…');
  try {
    const r = await fetch('api/sync', { method: 'POST', headers: { 'X-AMH': '1' } });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
    localApi = { ...localApi, last_sync: data.last_sync };
    if (!state.setup) state.setup = true;
    importPlaidFlow(data);
  } catch (e) {
    toast('Sync failed: ' + e.message);
  } finally { syncing = false; render(); }
}
function syncBar() {
  if (!localApi?.connected) return state.sync ? `<div class="small muted" style="margin:2px 4px 8px">🔗 ${syncLabel()}</div>` : '';
  return `<div class="card spread" style="padding:10px 14px"><span class="small muted">🔗 ${state.sync ? syncLabel() : 'SoFi connected'}</span>
    <button class="btn small" data-a="syncnow" ${syncing ? 'disabled' : ''}>${syncing ? 'Syncing…' : 'Sync now'}</button></div>`;
}

function autosyncLabel() {
  if (!localApi?.autosync_installed) return '⏰ Automatic sync: not set up on this computer yet (it’s added the next time AMH Finance updates).';
  const last = localApi.autosync;
  let lastText = 'hasn’t run yet';
  if (last) {
    const [when, ...rest] = last.split(' ');
    const d = new Date(when);
    const msg = rest.join(' ');
    lastText = `last ran ${isNaN(d) ? when : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} — ${msg.startsWith('ok') ? '✓ ' + esc(msg.slice(4)) : '<span class="bad">' + esc(msg) + '</span>'}`;
  }
  return `⏰ Automatic sync: 7:00 am, 8:00 pm, when you log in, and when you open the app · ${lastText}`;
}
function syncLabel() {
  if (!state.sync) return '';
  const d = new Date(state.sync.at);
  return `${esc(state.sync.source)} data from ${isNaN(d) ? esc(state.sync.at) : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

// ---------- Settings ----------
function openSettings() {
  const ruleCount = Object.keys(state.rules).length;
  openSheet('Settings', `
    <div class="card"><h2>Data</h2>
      ${localApi?.connected ? '<button class="btn" data-a="syncnow">Sync with SoFi now</button><div class="btn-row"><button class="btn secondary" data-a="addsofiaccts">➕ Add new SoFi accounts or vaults</button></div><div class="btn-row"><button class="btn secondary" data-a="plaid">Import SoFi sync file</button></div>' : '<button class="btn" data-a="plaid">Import SoFi sync file</button>'}
      ${state.sync ? `<p class="muted small" style="margin:6px 0 0">Last sync: ${syncLabel()}</p>` : ''}
      ${localApi ? `<p class="small" style="margin:6px 0 0">${autosyncLabel()}</p>` : ''}
      <div class="btn-row"><button class="btn secondary" data-a="csv">Import bank CSV</button></div>
      <div class="btn-row"><button class="btn secondary" data-a="export">Back up (JSON)</button><button class="btn secondary" data-a="restore">Restore</button></div>
      <div class="btn-row"><button class="btn secondary" data-a="excsv">Export transactions CSV</button></div>
      <p class="muted small">Your data is stored only on this device, in this browser. Back up regularly — clearing Safari website data erases it.</p>
    </div>
    <div class="card"><h2>Bill reminders</h2>
      <p class="muted small" style="margin-top:0">Show bills on Home this many days before they’re due:</p>
      <div class="segmented" data-remind-seg>${[1, 3, 5, 7].map((d) => `<button data-v="${d}" class="${(state.ui.remindDays ?? 3) === d ? 'on' : ''}">${d} day${d > 1 ? 's' : ''}</button>`).join('')}</div>
      <div class="btn-row"><button class="btn secondary" data-a="notify">${state.ui.notify ? '🔔 Desktop pop-up reminders: On' : '🔕 Desktop pop-up reminders: Off'}</button></div>
      <p class="muted small">Pop-ups appear when AMH Finance is open.</p>
    </div>
    <div class="card"><h2>Ask Claude</h2>
      <p class="small" style="margin-top:0">${!localApi ? 'Available when you open AMH Finance from the Desktop icon on your Mac.'
        : localApi.claude ? `✓ Ready (${localApi.claude === 'api' ? 'using your Anthropic API key' : 'using your Claude account'})`
        : 'Not set up. Close the small AMH Finance window, open AMH Finance from your Desktop and type <b>c</b>.'}</p>
      <button class="btn secondary" data-a="askopen">Open Ask Claude</button>
    </div>
    <div class="card"><h2>Accounts</h2>
      <button class="btn secondary" data-a="accountsview">View & edit accounts</button>
    </div>
    <div class="card"><h2>Appearance</h2>
      <div class="segmented" data-theme-seg>${['auto', 'light', 'dark'].map((t) => `<button data-v="${t}" class="${state.ui.theme === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
    </div>
    <div class="card"><h2>Categories</h2>
      <button class="btn secondary" data-a="newcat">Add category</button>
      <div class="btn-row"><button class="btn secondary" data-a="rules">Auto-categorize rules (${ruleCount})</button></div>
    </div>
    <div class="card"><h2>Danger zone</h2>
      <button class="btn danger" data-a="reset">Erase all data</button>
    </div>
    <p class="muted small" style="text-align:center">AMH Finance · offline · private</p>`, (sheet) => {
    $('[data-remind-seg]', sheet).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      state.ui.remindDays = +b.dataset.v; save(); render();
      $$('[data-remind-seg] button', sheet).forEach((x) => x.classList.toggle('on', x === b));
    });
    $('[data-theme-seg]', sheet).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      state.ui.theme = b.dataset.v; applyTheme(); save();
      $$('[data-theme-seg] button', sheet).forEach((x) => x.classList.toggle('on', x === b));
    });
    sheet.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'syncnow') { closeSheet(); syncNow(); }
      if (a === 'plaid') { closeSheet(); pickFile('.json,application/json', (txt) => { try { importPlaidFlow(JSON.parse(txt)); } catch { toast('Could not read that file'); } }); }
      if (a === 'csv') { closeSheet(); pickFile('.csv,text/csv', importCSVFlow); }
      if (a === 'export') download(`amh-finance-backup-${today()}.json`, JSON.stringify(state, null, 1), 'application/json');
      if (a === 'excsv') {
        const lines = [['Date', 'Payee', 'Amount', 'Category', 'Account', 'Note']].concat(
          [...state.transactions].sort((x, y) => y.date.localeCompare(x.date)).map((t) => [t.date, t.payee, t.amount, t.splits?.length ? t.splits.map((p) => `${cat(p.categoryId).name} ${p.amount}`).join(' + ') : cat(t.categoryId).name, acct(t.accountId)?.name || '', t.note || '']));
        download(`transactions-${today()}.csv`, lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
      }
      if (a === 'restore') pickFile('.json,application/json', (txt) => {
        try {
          const s = JSON.parse(txt);
          if (parsePlaidFile(s)) { closeSheet(); importPlaidFlow(s); return; }
          if (!Array.isArray(s.transactions) || !Array.isArray(s.categories)) throw new Error('bad file');
          if (!confirm('Replace all current data with this backup?')) return;
          state = { ...blankState(), ...s, ui: { ...blankState().ui, ...(s.ui || {}) } };
          save(); closeSheet(); applyTheme(); render(); toast('Backup restored');
        } catch { toast('Not a valid backup file'); }
      });
      if (a === 'newcat') { closeSheet(); newCategoryForm(); }
      if (a === 'askopen') { closeSheet(); openAsk(); }
      if (a === 'addsofiaccts') { window.open('connect-accounts', '_blank'); toast('Finish in the new tab, then come back here'); }
      if (a === 'accountsview') { closeSheet(); goto('accounts'); }
      if (a === 'notify') {
        if (state.ui.notify) { state.ui.notify = false; save(); closeSheet(); openSettings(); return; }
        if (!('Notification' in window)) { toast('This browser can’t show pop-ups'); return; }
        Notification.requestPermission().then((perm) => {
          state.ui.notify = perm === 'granted'; save();
          toast(perm === 'granted' ? 'Reminders on' : 'Pop-ups were blocked — allow them in your browser settings');
          closeSheet(); openSettings(); notifyDueBills();
        });
      }
      if (a === 'rules') { closeSheet(); openRules(); }
      if (a === 'reset' && confirm('Erase everything? This cannot be undone.') && confirm('Really erase all data?')) {
        localStorage.removeItem(STORE_KEY); state = blankState(); closeSheet(); render(); toast('All data erased');
      }
    });
  });
}
function openRules() {
  const entries = Object.entries(state.rules);
  openSheet('Auto-categorize rules', entries.length ? `<p class="muted small">Learned when you pick a category for a payee. Tap to remove.</p>
    <ul class="list card">${entries.map(([k, cid]) => `<li data-k="${esc(k)}"><div class="emoji">${esc(cat(cid).emoji)}</div><div class="grow"><div class="title ellipsis">${esc(k)}</div><div class="sub">→ ${esc(cat(cid).name)}</div></div><span class="muted">✕</span></li>`).join('')}</ul>
    <button class="btn secondary" data-apply>Re-apply rules to all transactions</button>`
    : '<div class="empty"><div class="e">🪄</div>No rules yet. When you set a category on a transaction, it’s remembered for that payee.</div>', (sheet) => {
    sheet.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-k]');
      if (li) { delete state.rules[li.dataset.k]; save(); li.remove(); }
      if (e.target.closest('[data-apply]')) {
        let n = 0;
        state.transactions.forEach((t) => { const r = state.rules[normPayee(t.payee)]; if (r && r !== t.categoryId) { t.categoryId = r; n++; } });
        save(); render(); toast(`Updated ${n} transactions`);
      }
    });
  });
}

// ---------- Views ----------
const txRow = (t) => {
  const c = cat(t.categoryId), a = acct(t.accountId);
  const catLabel = t.splits?.length ? '✂️ ' + t.splits.map((p) => cat(p.categoryId).name).join(' + ') : c.name;
  return `<li data-tx="${t.id}"><div class="emoji">${esc(t.splits?.length ? '✂️' : c.emoji)}</div>
    <div class="grow"><div class="title ellipsis">${esc(t.payee)}</div><div class="sub ellipsis">${esc(catLabel)}${a ? ' · ' + esc(a.name) : ''}${t.pending ? ' · <span class="pill warn">Pending</span>' : ''}${t.note ? ' · ' + esc(t.note) : ''}</div></div>
    <div class="num ${t.amount > 0 ? 'good' : ''}">${t.amount > 0 ? '+' : ''}${money(Math.abs(t.amount))}</div></li>`;
};

function viewWelcome() {
  return `<div class="welcome"><img src="icons/icon.svg" alt="">
    <h2>Your money, privately.</h2>
    <p>Track spending, budgets, bills and your bank balances. Everything stays on this device — no accounts, no tracking.</p>
    ${localApi?.connected ? '<button class="btn" data-a="syncnow">Start with my SoFi data</button><div class="btn-row"><button class="btn secondary" data-a="start">Start empty</button></div>'
      : localApi ? '<p class="small bad">SoFi isn’t linked yet — run <code>python sofi_tracker.py link</code>, then reload.</p><button class="btn" data-a="start">Get started</button>'
      : '<button class="btn" data-a="start">Get started</button>'}
    <div class="btn-row"><button class="btn secondary" data-a="demo">Explore with demo data</button></div>
    <div class="btn-row"><button class="btn secondary" data-a="restore">Restore a backup</button></div>
    <p class="muted small" style="margin-top:24px">Tip: in Safari, tap Share → “Add to Home Screen” to install it like an app.</p></div>`;
}

function viewHome() {
  const ym = monthOf(today());
  const { spent, income } = monthTotals(ym);
  const budget = totalBudget();
  const dim = daysInMonth(ym), day = new Date().getDate();
  const pace = budget ? (budget * day) / dim : 0;
  const prevM = addMonths(ym, -1);
  const prevSpentSameDay = txInMonth(prevM).filter((t) => +t.date.slice(8) <= day)
    .reduce((s, t) => s - parts(t).reduce((x, p) => x + (cat(p.categoryId).kind === 'expense' ? p.amount : 0), 0), 0);

  const upcoming = [];
  for (const r of state.recurrings) { const d = nextDue(r); if (d && d <= addDays(today(), 10)) upcoming.push({ r, d }); }
  upcoming.sort((a, b) => a.d.localeCompare(b.d));

  const byCat = Object.entries(spendingByCategory(ym)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = byCat.slice(0, 5).map(([id, v], i) => ({ c: cat(id), value: v, color: CHART_COLORS[i] }));
  const rest = byCat.slice(5).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) top.push({ c: { name: 'Everything else', emoji: '•' }, value: rest, color: CHART_COLORS[7] });

  const recent = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const trend = Array.from({ length: 6 }, (_, i) => addMonths(ym, i - 5)).map((m) => ({ label: monthLabel(m, true), value: monthTotals(m).spent, highlight: m === ym }));

  return `${syncBar()}${checkingCard()}${spendingMeterHTML()}${(() => {
    const open = !!state.ui.upcomingOpen, total = upcoming.reduce((s, u) => s + u.r.amount, 0);
    return `<div class="card">
      <button class="meter-head" data-upcomingtoggle aria-expanded="${open}">
        <div class="spread"><span class="muted small">📅 Upcoming bills · next 10 days</span><span class="chev ${open ? 'open' : ''}" aria-hidden="true">›</span></div>
        <div class="spread" style="align-items:baseline;margin-top:2px">${upcoming.length
          ? `<span class="mid">${money(total)}</span><span class="small muted">${upcoming.length} bill${upcoming.length === 1 ? '' : 's'} · next: ${esc(upcoming[0].r.name)} ${esc(dayLabel(upcoming[0].d))}</span>`
          : '<span class="small muted">Nothing due in the next 10 days.</span>'}</div>
      </button>
      ${open && upcoming.length ? `<ul class="list" style="margin-top:6px">${upcoming.map(({ r, d }) => `<li data-rec="${r.id}" data-date="${d}"><div class="emoji">${esc(r.emoji)}</div><div class="grow"><div class="title">${esc(r.name)}</div><div class="sub">${esc(dayLabel(d))}</div></div><div class="num">${money(r.amount)}</div></li>`).join('')}</ul>
        <button class="link" data-goto="recurring" style="margin-top:6px">All bills ›</button>` : ''}
    </div>`;
  })()}${alertsCard()}
  <div class="card"><h2>Spent in ${esc(monthLabel(ym, true))} <button class="link" data-goto="budgets">Budgets</button></h2>
    <div class="hero">
      <div class="ring-wrap">${ring(budget ? spent / budget : 0, budget && spent > budget ? 'var(--bad)' : budget && spent > pace ? 'var(--warn)' : 'var(--accent)')}
        <div class="ring-label"><div><b>${budget ? Math.round((spent / budget) * 100) : 0}%</b>of budget</div></div></div>
      <div class="grow">
        <div class="big">${money(spent, true)}</div>
        <div class="muted small">${budget ? `${money(Math.max(0, budget - spent), true)} left of ${money(budget, true)}` : 'Set budgets to track pace'}</div>
        ${budget ? `<div class="small" style="margin-top:6px">${spent <= pace ? `<span class="good">● On track</span> — ${money(pace - spent, true)} under pace` : `<span class="bad">● Over pace</span> by ${money(spent - pace, true)}`}</div>` : ''}
        ${prevSpentSameDay ? `<div class="muted small">vs ${money(prevSpentSameDay, true)} this point last month</div>` : ''}
      </div>
    </div>
    <div class="spread small" style="margin-top:12px"><span class="muted">Income this month</span><span class="num good">${money(income)}</span></div>
  </div>

  ${weeklyCard()}

  ${state.accounts.length ? '' : `<div class="card"><h2>Accounts</h2><p class="muted small">Add your accounts to see your balances here.</p><button class="btn secondary small" data-a="addacct">Add account</button></div>`}



  <div class="card"><h2>Where it went</h2>
    ${top.length ? `<div class="hero"><div>${donut(top)}</div><ul class="list grow" style="font-size:13px">${top.map((t) => `<li style="padding:6px 0;cursor:default"><i style="width:9px;height:9px;border-radius:3px;background:${t.color};flex:none"></i><span class="grow ellipsis">${esc(t.c.emoji)} ${esc(t.c.name)}</span><span class="num">${money(t.value, true)}</span></li>`).join('')}</ul></div>`
      : '<p class="muted small">No spending yet this month.</p>'}
  </div>

  <div class="card"><h2>Monthly spending</h2>${bars(trend)}</div>

  <div class="card"><h2>Recent <button class="link" data-goto="tx">See all</button></h2>
    ${recent.length ? `<ul class="list">${recent.map(txRow).join('')}</ul>` : '<div class="empty"><div class="e">🧾</div>No transactions yet. Tap + or import a CSV from Settings.</div>'}
  </div>`;
}

/** Money moved between your own accounts or paid to a card/person — not spending or income. */
const isTransferTx = (t) => isOwnMove(t.payee) || parts(t).every((p) => cat(p.categoryId).kind === 'transfer');
function viewTx() {
  const view = state.ui.txView === 'transfers' ? 'transfers' : 'main';
  const q = state.ui.txQuery.toLowerCase();
  const f = view === 'transfers' ? (state.ui.txFilterT || 'all') : state.ui.txFilter;
  let list = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .filter((t) => (view === 'transfers') === isTransferTx(t));
  if (f === 'tout') list = list.filter((t) => t.amount < 0);
  else if (f === 'tin') list = list.filter((t) => t.amount > 0);
  else if (f === 'uncat') list = list.filter((t) => !t.categoryId || cat(t.categoryId).name === 'Other');
  else if (f === 'income') list = list.filter((t) => t.amount > 0 && cat(t.categoryId).kind !== 'transfer');
  else if (f === 'out') list = list.filter((t) => t.amount < 0 && cat(t.categoryId).kind !== 'transfer');
  else if (f === 'pending') list = list.filter((t) => t.pending);
  else if (f.startsWith('c:')) list = list.filter((t) => parts(t).some((p) => p.categoryId === f.slice(2)));
  else if (f.startsWith('a:')) list = list.filter((t) => t.accountId === f.slice(2));
  if (q) list = list.filter((t) => (t.payee + ' ' + (t.note || '') + ' ' + cat(t.categoryId).name).toLowerCase().includes(q) || String(Math.abs(t.amount)).includes(q));
  const shown = list.slice(0, 400);
  const groups = {};
  shown.forEach((t) => (groups[t.date] ||= []).push(t));
  const total = list.reduce((s, t) => s + t.amount, 0);
  const chips = view === 'transfers'
    ? [['all', 'All'], ['tout', 'Money out'], ['tin', 'Money in'], ...state.accounts.map((a) => ['a:' + a.id, a.name])]
    : [['all', 'All'], ['out', 'Purchases'], ['income', 'Deposits'], ['uncat', 'Needs review'],
      ...(state.transactions.some((t) => t.pending) ? [['pending', 'Pending']] : []),
      ...state.accounts.map((a) => ['a:' + a.id, a.name]), ...expenseCats().map((c) => ['c:' + c.id, `${c.emoji} ${c.name}`])];
  const tCount = state.transactions.filter(isTransferTx).length;
  const outT = round2(-list.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)), inT = round2(list.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0));
  return `
    <div class="segmented" style="margin-bottom:10px">
      <button data-txview="main" class="${view === 'main' ? 'on' : ''}">Spending & income</button>
      <button data-txview="transfers" class="${view === 'transfers' ? 'on' : ''}">↔️ Transfers${tCount ? ` (${tCount})` : ''}</button></div>
    <input class="search" type="search" placeholder="${view === 'transfers' ? 'Search transfers' : 'Search payee, note, category, amount'}" value="${esc(state.ui.txQuery)}" data-search>
    <div class="chips">${chips.map(([v, l]) => `<button class="chip ${f === v ? 'on' : ''}" data-filter="${esc(v)}">${esc(l)}</button>`).join('')}</div>
    <div class="spread small muted" style="margin:10px 4px 0">${view === 'transfers'
      ? `<span>${list.length} transfer${list.length === 1 ? '' : 's'}</span><span class="num">out ${money(outT)} · in ${money(inT)}</span>`
      : `<span>${list.length} transactions</span><span class="num">Net ${signed(round2(total))}</span>`}</div>
    ${view === 'transfers' ? '<p class="small muted" style="margin:6px 4px 0">Card payments, vault moves, transfers between your accounts and payments to people. These aren’t counted as spending or income.</p>' : ''}
    <div style="margin-top:8px">${syncBar()}</div>
    ${shown.length ? Object.entries(groups).map(([d, ts]) => `<div class="date-head">${esc(dayLabel(d))}</div><ul class="list card" style="padding:2px 14px">${ts.map(txRow).join('')}</ul>`).join('')
      : '<div class="empty"><div class="e">🔍</div>No matching transactions.</div>'}
    ${list.length > shown.length ? `<p class="muted small" style="text-align:center">Showing latest ${shown.length}. Search to narrow down.</p>` : ''}`;
}

function viewBudgets() {
  const ym = state.ui.month;
  const by = spendingByCategory(ym);
  const { spent, income } = monthTotals(ym);
  const budget = totalBudget();
  const isCurrent = ym === monthOf(today());
  const frac = isCurrent ? new Date().getDate() / daysInMonth(ym) : 1;
  const cats = expenseCats().map((c) => ({ c, spent: round2(by[c.id] || 0) })).sort((a, b) => (+b.c.budget > 0) - (+a.c.budget > 0) || b.spent - a.spent);
  const row = ({ c, spent }) => {
    const b = +c.budget || 0;
    const pct = b ? spent / b : 0;
    const cls = !b ? '' : pct > 1 ? 'over' : pct > frac + 0.1 ? 'near' : 'good';
    return `<li data-cat="${c.id}" style="flex-wrap:wrap"><div class="emoji">${esc(c.emoji)}</div>
      <div class="grow"><div class="spread"><span class="title ellipsis">${esc(c.name)}</span><span class="num small">${money(spent, true)}${b ? ` <span class="muted">/ ${money(b, true)}</span>` : ''}</span></div>
      ${b ? `<div class="bar ${cls}"><i style="width:${Math.min(100, pct * 100)}%"></i></div><div class="sub">${spent > b ? `<span class="bad">${money(spent - b, true)} over</span>` : `${money(b - spent, true)} left`}</div>` : '<div class="sub">No budget — tap to set</div>'}
      <div class="cat-toggles">${categoryBillsHTML(c, ym, 'button')}${categoryChargesHTML(c, ym, 'button')}</div>
      ${categoryBillsHTML(c, ym, 'list')}${categoryChargesHTML(c, ym, 'list')}</div></li>`;
  };
  const goals = state.goals;
  return `
    <div class="month-nav"><button data-month="-1" aria-label="Previous month">‹</button><b>${esc(monthLabel(ym))}</b><button data-month="1" aria-label="Next month" ${isCurrent ? 'disabled style="opacity:.3"' : ''}>›</button></div>
    <div class="card">
      <div class="spread"><div><div class="muted small">Spent</div><div class="mid">${money(spent, true)}</div></div>
      <div style="text-align:right"><div class="muted small">Budget</div><div class="mid">${money(budget, true)}</div></div></div>
      ${budget ? `<div class="bar ${spent > budget ? 'over' : spent > budget * (frac + 0.1) ? 'near' : 'good'}"><i style="width:${Math.min(100, (spent / budget) * 100)}%"></i></div>` : ''}
      <div class="spread small" style="margin-top:10px"><span class="muted">Income</span><span class="num good">${money(income)}</span></div>
      <div class="spread small"><span class="muted">Saved (income − spending)</span><span class="num ${income - spent >= 0 ? 'good' : 'bad'}">${signed(round2(income - spent))}</span></div>
    </div>
    ${billsBudgetCard(ym)}
    <div class="section-title">Categories</div>
    <ul class="list card" style="padding:2px 14px">${cats.map(row).join('')}</ul>
    <button class="btn secondary" data-a="newcat">Add category</button>

    <div class="section-title spread"><span>Goals</span><button class="link" data-a="newgoal">+ New goal</button></div>
    ${goals.length ? `<ul class="list card" style="padding:2px 14px">${goals.map((g) => {
      const pct = g.target ? g.saved / g.target : 0;
      let sub = `${money(g.saved, true)} of ${money(g.target, true)}`;
      if (g.by && g.saved < g.target) {
        const months = Math.max(1, Math.round((parseD(g.by) - new Date()) / (86400000 * 30.4)));
        sub += ` · ${money((g.target - g.saved) / months, true)}/mo to hit by ${shortDate(g.by)}`;
      }
      return `<li data-goal="${g.id}"><div class="emoji">${esc(g.emoji)}</div><div class="grow"><div class="spread"><span class="title">${esc(g.name)}</span><span class="small num">${Math.round(pct * 100)}%</span></div>
        <div class="bar good"><i style="width:${Math.min(100, pct * 100)}%"></i></div><div class="sub">${esc(sub)}</div></div></li>`;
    }).join('')}</ul>` : '<div class="card empty"><div class="e">🎯</div>Set savings goals like an emergency fund or a trip.</div>'}`;
}

function viewRecurring() {
  const ym = monthOf(today());
  const items = [];
  for (const r of state.recurrings) for (const d of occurrencesInMonth(r, ym)) items.push({ r, d, paid: !!findPayment(r, d) });
  items.sort((a, b) => a.d.localeCompare(b.d));
  const paidSum = items.filter((i) => i.paid).reduce((s, i) => s + i.r.amount, 0);
  const totalSum = items.reduce((s, i) => s + i.r.amount, 0);
  const monthly = state.recurrings.reduce((s, r) => s + monthlyEquivalent(r), 0);
  const future = state.recurrings.map((r) => ({ r, d: nextDue(r) })).filter((x) => x.d && monthOf(x.d) !== ym).sort((a, b) => a.d.localeCompare(b.d));
  const tile = ({ r, d, paid }) => `<div class="tile ${!paid && d <= today() ? 'due' : ''}" data-rec="${r.id}" data-date="${d}">
    ${paid ? '<span class="check">✓</span>' : ''}<div class="e">${esc(r.emoji)}</div><div class="n ellipsis">${esc(r.name)}</div><div class="a">${money(r.amount)}</div><div class="d">${ordinal(+d.slice(8))}</div></div>`;
  return `
    <div class="card"><div class="hero">
      <div class="ring-wrap">${ring(totalSum ? paidSum / totalSum : 0)}<div class="ring-label"><div><b>${items.filter((i) => i.paid).length}/${items.length}</b>paid</div></div></div>
      <div class="grow"><div class="mid">${money(paidSum, true)}</div><div class="muted small">paid so far of ${money(totalSum, true)} this month</div>
      <div class="muted small" style="margin-top:6px">≈ ${money(monthly, true)}/mo · ${money(monthly * 12, true)}/yr in recurring costs</div></div>
    </div>
    ${paidBillsDropdown(items)}</div>
    ${items.length ? `<button class="section-toggle" data-monthtoggle aria-expanded="${!state.ui.monthClosed}">
        <span>This month <span class="muted">· ${items.filter((i) => i.paid).length} of ${items.length} paid${items.some((i) => !i.paid) ? ` · ${money(items.filter((i) => !i.paid).reduce((s, i) => s + i.r.amount, 0), true)} to go` : ''}</span></span><span class="chev ${state.ui.monthClosed ? '' : 'open'}" aria-hidden="true">›</span></button>
      ${state.ui.monthClosed ? '' : `<div class="tiles">${items.map(tile).join('')}</div>`}`
      : '<div class="section-title">This month</div><div class="card empty"><div class="e">🔁</div>Add subscriptions and bills to see what’s due and what’s paid.</div>'}
    ${future.length ? `<button class="section-toggle" data-futuretoggle aria-expanded="${!!state.ui.futureOpen}">
        <span>In the future <span class="muted">· ${future.length} bill${future.length === 1 ? '' : 's'} · next ${esc(shortDate(future[0].d))}</span></span><span class="chev ${state.ui.futureOpen ? 'open' : ''}" aria-hidden="true">›</span></button>
      ${state.ui.futureOpen ? `<ul class="list card" style="padding:2px 14px">${future.map(({ r, d }) => `<li data-rec="${r.id}" data-date="${d}"><div class="emoji">${esc(r.emoji)}</div><div class="grow"><div class="title">${esc(r.name)}</div><div class="sub">${esc(r.freq)} · next ${esc(shortDate(d))}</div></div><div class="num">${money(r.amount)}</div></li>`).join('')}</ul>` : ''}` : ''}
`;
}

function viewAccounts() {
  const groups = {};
  state.accounts.forEach((a) => (groups[a.type] ||= []).push(a));
  return `
    <p class="small muted" style="margin:4px 4px 0">Tap an account to rename it, change its type, or update its balance.</p>
    ${Object.entries(ACCOUNT_TYPES).filter(([k]) => groups[k]).map(([k, t]) => {
      const sum = groups[k].reduce((s, a) => s + accountBalance(a), 0);
      return `<div class="section-title spread"><span>${esc(t.label)}</span><span class="num">${money(t.liability ? -sum : sum)}</span></div>
      <ul class="list card" style="padding:2px 14px">${groups[k].map((a) => {
        const b = accountBalance(a);
        return `<li data-acct="${a.id}"><div class="emoji">${t.emoji}</div><div class="grow"><div class="title ellipsis">${esc(a.name)}</div><div class="sub">${esc(a.institution || t.label)}${a.plaidId ? ` · 🔗 synced${a.plaidSubtype && a.plaidSubtype !== 'None' ? ` (SoFi: ${esc(a.plaidSubtype)})` : ''}` : ''}${a.typeLocked && a.plaidId ? ' · type set by you' : ''}${a.hidden ? ' · hidden' : ''}</div></div><div class="num ${t.liability ? 'bad' : ''}">${money(t.liability ? -b : b)}</div></li>`;
      }).join('')}</ul>`;
    }).join('')}
    <button class="btn" data-a="addacct" style="margin-top:8px">Add account</button>
    <p class="muted small" style="text-align:center">Balances update automatically from transactions in each account. For investments or property, tap the account and enter the current value.</p>`;
}

// ---------- Render & events ----------
const TITLES = { home: 'Home', today: 'Today', tx: 'Activity', budgets: 'Budgets', recurring: 'Bills', reports: 'Reports', accounts: 'Accounts' };
function render() {
  const view = $('#view');
  const tab = state.ui.tab;
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('.tabbar').style.display = state.setup ? '' : 'none';
  $('#addBtn').style.visibility = state.setup ? '' : 'hidden';
  $('#askBtn').style.display = state.setup ? '' : 'none';
  $('#askTopBtn').style.display = state.setup ? '' : 'none';
  $('#pageTitle').textContent = state.setup ? TITLES[tab] : 'AMH Finance';
  if (!state.setup) { view.innerHTML = viewWelcome(); return; }
  view.innerHTML = ({ home: viewHome, today: viewToday, tx: viewTx, budgets: viewBudgets, recurring: viewBills, reports: viewReports, accounts: viewAccounts }[tab] || viewHome)();
}
function goto(tab) { state.ui.tab = tab; render(); window.scrollTo({ top: 0 }); }

function applyTheme() {
  if (state.ui.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', state.ui.theme);
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  runMigrations();
  state.ui.tab = 'today'; // always open on the Today page
  render();
  detectLocalApi();
  setInterval(() => { if (localApi && !document.hidden) detectLocalApi(); }, 10 * 60 * 1000); // pick up background syncs
  window.addEventListener('focus', () => { if (localApi) detectLocalApi(); }); // e.g. back from adding a SoFi account

  $('.tabbar').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) goto(b.dataset.tab); });
  $('#addBtn').addEventListener('click', () => (state.ui.tab === 'accounts' ? accountForm() : state.ui.tab === 'recurring' ? recurringForm() : txForm()));
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#askBtn').addEventListener('click', () => openAsk());
  $('#askTopBtn').addEventListener('click', () => openAsk());
  setTimeout(notifyDueBills, 1500);

  const view = $('#view');
  view.addEventListener('click', (e) => {
    const el = (s) => e.target.closest(s);
    let n;
    if (handleFeatureClick(e) || handleBillsClick(e)) return;
    if ((n = el('[data-a]'))) {
      const a = n.dataset.a;
      if (a === 'start') { state.setup = true; save(); render(); accountForm(); }
      if (a === 'demo') { loadDemo(); save(); render(); toast('Demo data loaded — erase it anytime in Settings'); }
      if (a === 'restore') { openSettings(); }
      if (a === 'syncnow') syncNow();
      if (a === 'addacct') accountForm();
      if (a === 'newcat') newCategoryForm();
      if (a === 'newgoal') goalForm();
      if (a === 'newrec') recurringForm();
      return;
    }
    if ((n = el('[data-tx]'))) return txForm(state.transactions.find((t) => t.id === n.dataset.tx));
    if ((n = el('[data-rec]'))) return recurringDetail(state.recurrings.find((r) => r.id === n.dataset.rec), n.dataset.date);
    if ((n = el('[data-sugg]'))) return recurringForm(detectRecurring()[+n.dataset.sugg]);
    if ((n = el('[data-acct]'))) return accountForm(acct(n.dataset.acct));
    if ((n = el('[data-cat]'))) return budgetForm(state.categories.find((c) => c.id === n.dataset.cat));
    if ((n = el('[data-goal]'))) return goalForm(state.goals.find((g) => g.id === n.dataset.goal));
    if ((n = el('[data-txview]'))) { state.ui.txView = n.dataset.txview; state.ui.txQuery = ''; return render(); }
    if ((n = el('[data-filter]'))) { if (state.ui.txView === 'transfers') state.ui.txFilterT = n.dataset.filter; else state.ui.txFilter = n.dataset.filter; return render(); }
    if ((n = el('[data-month]'))) { state.ui.month = addMonths(state.ui.month, +n.dataset.month); return render(); }
    if ((n = el('[data-range] button'))) { state.ui.nwRange = +n.dataset.v; save(); return render(); }
    if ((n = el('[data-goto]'))) return goto(n.dataset.goto);
  });
  view.addEventListener('change', (e) => { if (e.target.matches('[data-recat]')) onRecategorize(e.target); });
  view.addEventListener('input', (e) => {
    if (e.target.matches('[data-search]')) {
      state.ui.txQuery = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const s = $('[data-search]'); s.focus(); s.setSelectionRange(pos, pos);
    }
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});

// ---------- Demo data ----------
function loadDemo() {
  state = blankState();
  state.setup = true;
  const C = (name) => state.categories.find((c) => c.name === name).id;
  state.categories.find((c) => c.name === 'Housing').budget = 1950;
  const mk = (name, type, opening, institution) => { const a = { id: uid(), name, type, opening, institution }; state.accounts.push(a); return a.id; };
  const chk = mk('Everyday Checking', 'checking', 2400, 'Demo Bank');
  const sav = mk('High-Yield Savings', 'savings', 12500, 'Demo Bank');
  const card = mk('Rewards Card', 'credit', -420, 'Demo Card Co');
  mk('Brokerage', 'investment', 38200, 'Demo Invest');
  mk('401(k)', 'retirement', 61400, 'Employer Plan');
  mk('Car Loan', 'loan', -9800, 'Demo Auto');

  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const add = (date, amount, payee, cname, accountId) => state.transactions.push({ id: uid(), date, amount: round2(amount), payee, categoryId: C(cname), accountId, note: '' });

  const start = addMonths(monthOf(today()), -3);
  for (let i = 0; i < 4; i++) {
    const ym = addMonths(start, i);
    for (let d = 1; d <= daysInMonth(ym); d++) {
      const date = `${ym}-${pad(d)}`;
      if (date > today()) break;
      if (d === 1) add(date, -1950, 'Rent - Maple Street', 'Housing', chk);
      if (d === 15 || d === 30) add(date, 2850, 'Payroll Direct Deposit', 'Income', chk);
      if (d === 1) add(date, -10.99, 'Apple Music', 'Subscriptions', card);
      if (d === 15) add(date, -15.49, 'Netflix', 'Subscriptions', card);
      if (d === 5) add(date, -355, 'Car Payment - Demo Auto', 'Transfer', chk);
      if (d === 5) add(date, -38, 'Rayne Water', 'Bills & Utilities', chk);
      if (d === 12) add(date, -60 - rnd() * 40, 'City Electric', 'Bills & Utilities', chk);
      if (d === 18) add(date, -79.99, 'Fiber Internet', 'Bills & Utilities', chk);
      if (d === 21) add(date, -13.99, 'YouTube Premium', 'Subscriptions', card);
      if (d === 10) add(date, -500, 'Transfer to Savings', 'Transfer', chk);
      if (rnd() < 0.3) add(date, -(35 + rnd() * 110), pick(['Trader Joe’s', 'Whole Foods', 'Costco', 'Farmers Market']), 'Groceries', card);
      if (rnd() < 0.35) add(date, -(8 + rnd() * 55), pick(['Blue Bottle Coffee', 'Chipotle', 'Thai Basil', 'Pizza Corner', 'DoorDash']), 'Dining', card);
      if (rnd() < 0.12) add(date, -(30 + rnd() * 25), pick(['Shell', 'Chevron']), 'Transport', card);
      if (rnd() < 0.1) add(date, -(15 + rnd() * 120), pick(['Amazon', 'Target', 'REI']), 'Shopping', card);
      if (rnd() < 0.04) add(date, -(12 + rnd() * 50), pick(['AMC Theatres', 'Steam']), 'Entertainment', card);
      if (rnd() < 0.03) add(date, -(10 + rnd() * 40), 'CVS Pharmacy', 'Health', card);
    }
  }
  const lastPay = state.transactions.filter((t) => t.accountId === card && t.amount < 0 && t.date < `${monthOf(today())}-01`);
  if (lastPay.length) add(`${monthOf(today())}-02` <= today() ? `${monthOf(today())}-02` : today(), 900, 'Credit card payment', 'Transfer', card);
  add(today(), 500, 'Transfer from Checking', 'Transfer', sav);

  state.recurrings = [
    ['Rent', '🏠', 1950, 'Housing', chk, 1],
    ['Apple Music', '🎧', 10.99, 'Subscriptions', card, 1],
    ['Car Payment', '🚙', 355, 'Transfer', chk, 5],
    ['Rayne Water', '🚰', 38, 'Bills & Utilities', chk, 5],
    ['Netflix', '🍿', 15.49, 'Subscriptions', card, 15],
    ['Fiber Internet', '🌐', 79.99, 'Bills & Utilities', chk, 18],
    ['YouTube Premium', '📺', 13.99, 'Subscriptions', card, 21],
  ].map(([name, emoji, amount, cname, accountId, day]) => ({
    id: uid(), name, emoji, amount, freq: 'monthly', start: `${start}-${pad(day)}`, categoryId: C(cname), accountId,
  }));

  const costco = state.transactions.find((t) => t.payee === 'Costco' && t.amount < -60);
  if (costco) {
    const g = round2(costco.amount * 0.7);
    costco.splits = [{ categoryId: C('Groceries'), amount: g }, { categoryId: C('Shopping'), amount: round2(costco.amount - g) }];
  }

  state.goals = [
    { id: uid(), name: 'Emergency fund', emoji: '🛟', target: 20000, saved: 12500, by: addDays(today(), 300) },
    { id: uid(), name: 'Japan trip', emoji: '🗾', target: 6000, saved: 1800, by: addDays(today(), 220) },
  ];

  // Fake 6 months of net-worth history ending at today's value
  const end = netWorth().net;
  for (let i = 180; i >= 1; i -= 3) state.snapshots[addDays(today(), -i)] = round2(end - i * 95 + Math.sin(i / 9) * 1400);
}
