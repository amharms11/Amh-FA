/* AMH Finance — split transactions, alerts & bill reminders, weekly summary, reports, Ask Claude.
 * Loaded after app.js; uses its helpers and state. */
'use strict';

const median = (arr) => { const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const wholeSigned = (n) => (n >= 0 ? '+' : '−') + money(Math.abs(n), true);
const daysFrom = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);

// ---------- Split transactions ----------
function fixSplits(t) {
  // Keep a split adding up if the bank later changes the amount (e.g. a tip posts).
  if (!t.splits?.length) return;
  const diff = round2(t.amount - t.splits.reduce((s, p) => s + p.amount, 0));
  if (diff) { const last = t.splits[t.splits.length - 1]; last.amount = round2(last.amount + diff); }
}
function splitForm(t) {
  const sign = t.amount < 0 ? -1 : 1, total = round2(Math.abs(t.amount));
  const opts = catOptions(t.amount < 0 ? ['expense', 'transfer'] : ['income', 'expense', 'transfer']);
  const rows = (t.splits?.length ? t.splits : [{ categoryId: t.categoryId, amount: t.amount }])
    .map((s) => ({ categoryId: s.categoryId || opts[0].value, amount: Math.abs(s.amount) }));
  if (rows.length < 2) rows.push({ categoryId: opts[0].value, amount: 0 });
  const left = () => round2(total - rows.reduce((s, r) => s + (+r.amount || 0), 0));
  const rowHTML = (r, i) => `<div class="split-row" data-i="${i}">
      <select data-k="categoryId" aria-label="Category">${opts.map((o) => `<option value="${esc(o.value)}" ${o.value === r.categoryId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
      <input data-k="amount" inputmode="decimal" aria-label="Amount" value="${r.amount ? r.amount.toFixed(2) : ''}" placeholder="0.00">
      <button type="button" class="link" data-rm="${i}" aria-label="Remove">✕</button></div>`;
  openSheet(`Split: ${t.payee}`, `
    <p class="muted small">Divide ${money(total)} across categories — for example a Costco trip that was part groceries, part household.</p>
    <div data-rows></div>
    <button type="button" class="btn secondary small" data-add>+ Add a category</button>
    <p class="small" data-left></p>
    <button class="btn" data-save>Save split</button>
    ${t.splits?.length ? '<div class="btn-row"><button class="btn danger" data-unsplit>Remove split</button></div>' : ''}`, (sheet) => {
    const showLeft = () => {
      const l = left(), el = $('[data-left]', sheet);
      el.textContent = l === 0 ? '✓ Adds up' : l > 0 ? `${money(l)} still to assign` : `${money(-l)} more than the total`;
      el.className = 'small ' + (l === 0 ? 'good' : 'bad');
    };
    const draw = () => { $('[data-rows]', sheet).innerHTML = rows.map(rowHTML).join(''); showLeft(); };
    draw();
    const onEdit = (e) => {
      const row = e.target.closest('.split-row'); if (!row) return;
      const r = rows[+row.dataset.i], k = e.target.dataset.k;
      r[k] = k === 'amount' ? parseMoney(e.target.value) : e.target.value;
      showLeft();
    };
    sheet.addEventListener('input', onEdit);
    sheet.addEventListener('change', onEdit);
    sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) { rows.push({ categoryId: opts[0].value, amount: Math.max(0, left()) }); draw(); }
      const rm = e.target.closest('[data-rm]');
      if (rm) { rows.splice(+rm.dataset.rm, 1); if (!rows.length) rows.push({ categoryId: t.categoryId, amount: total }); draw(); }
      const tx = state.transactions.find((x) => x.id === t.id);
      if (e.target.closest('[data-save]')) {
        const parts = rows.filter((r) => r.categoryId && +r.amount > 0);
        if (round2(parts.reduce((s, r) => s + r.amount, 0)) !== total) { toast(`The parts need to add up to ${money(total)}`); return; }
        if (parts.length < 2) { delete tx.splits; tx.categoryId = parts[0].categoryId; }
        else {
          tx.splits = parts.map((r) => ({ categoryId: r.categoryId, amount: round2(sign * r.amount) }));
          tx.categoryId = [...parts].sort((a, b) => b.amount - a.amount)[0].categoryId;
        }
        save(); closeSheet(); render(); toast('Split saved');
      }
      if (e.target.closest('[data-unsplit]')) { delete tx.splits; save(); closeSheet(); render(); toast('Split removed'); }
    });
  });
}

// ---------- Alerts & bill reminders ----------
function computeAlerts() {
  const out = [], t0 = today(), ym = monthOf(t0);
  const remind = state.ui.remindDays ?? 3;

  // Bills coming up (or recently due with no matching payment).
  const billsDue = []; // for the low-balance check
  for (const r of state.recurrings) {
    for (const m of [addMonths(ym, -1), ym, addMonths(ym, 1)]) {
      for (const d of occurrencesInMonth(r, m)) {
        const diff = daysFrom(t0, d);
        if (diff < -5 || diff > Math.max(remind, 7) || findPayment(r, d)) continue;
        if (diff >= 0 && diff <= 7) billsDue.push({ r, d });
        if (diff > remind) continue;
        const when = diff < 0 ? `was due ${shortDate(d)} — no payment found yet` : diff === 0 ? 'is due today'
          : diff === 1 ? 'is due tomorrow' : `is due in ${diff} days (${shortDate(d)})`;
        out.push({ key: `bill:${r.id}:${d}`, icon: r.emoji, tone: diff < 0 ? 'bad' : 'warn', text: `${r.name} — ${money(r.amount)} ${when}`,
          attrs: `data-rec="${r.id}" data-date="${d}"`, sort: diff, bill: diff >= 0 });
      }
    }
  }

  // Budgets near or over the limit.
  const by = spendingByCategory(ym), daysLeft = daysInMonth(ym) - new Date().getDate();
  const over = [];
  for (const c of expenseCats()) {
    const b = +c.budget || 0, s = by[c.id] || 0;
    if (!b) continue;
    if (s > b) over.push({ c, by: s - b });
    else if (s >= b * 0.85 && daysLeft > 2) out.push({ key: `near:${c.id}:${ym}`, icon: c.emoji, tone: 'warn', text: `${c.name} is at ${Math.round((s / b) * 100)}% of its budget with ${daysLeft} days left`, attrs: `data-cat="${c.id}"`, sort: 11 });
  }
  if (over.length > 2) { // one line instead of many
    over.sort((a, b) => b.by - a.by);
    out.push({ key: `over:${ym}:${over.map((o) => o.c.id).join(',')}`, icon: '📊', tone: 'bad', attrs: 'data-goto="budgets"', sort: 10,
      text: `${over.length} categories are over budget this month: ${over.map((o) => `${o.c.name} +${money(o.by, true)}`).join(', ')}` });
  } else {
    for (const { c, by: d } of over) out.push({ key: `over:${c.id}:${ym}`, icon: c.emoji, tone: 'bad', text: `${c.name} is ${money(d, true)} over budget this month`, attrs: `data-cat="${c.id}"`, sort: 10 });
  }

  // Unusual or duplicate charges in the last 7 days.
  const spend = state.transactions.filter((t) => t.amount < 0 && cat(t.categoryId).kind !== 'transfer');
  const recent = spend.filter((t) => t.date >= addDays(t0, -7)).sort((a, b) => a.date.localeCompare(b.date));
  for (const t of recent) {
    const amt = -t.amount, key = normPayee(t.payee);
    const prior = spend.filter((x) => x !== t && x.date < t.date && normPayee(x.payee) === key).map((x) => -x.amount);
    let why = '';
    if (prior.length >= 3) {
      const med = median(prior);
      if (amt > Math.max(med * 2.5, med + 25)) why = `usually about ${money(med)}`;
    } else {
      const same = spend.filter((x) => x !== t && x.categoryId === t.categoryId).map((x) => -x.amount);
      if (same.length >= 5 && amt >= 100 && amt > median(same) * 4) why = `much bigger than your usual ${cat(t.categoryId).name} purchase`;
    }
    if (why) out.push({ key: `odd:${t.id}`, icon: '🔎', tone: 'warn', text: `Unusual charge: ${t.payee} ${money(amt)} on ${shortDate(t.date)} — ${why}`, attrs: `data-tx="${t.id}"`, sort: 20 });
  }
  for (let i = 0; i < recent.length; i++) {
    for (let j = i + 1; j < recent.length; j++) {
      const a = recent[i], b = recent[j];
      if (a.amount === b.amount && normPayee(a.payee) === normPayee(b.payee) && daysFrom(a.date, b.date) <= 1 && a.accountId === b.accountId) {
        out.push({ key: `dup:${a.id}:${b.id}`, icon: '👯', tone: 'warn', text: `Possible double charge: ${b.payee} ${money(-b.amount)} twice (${shortDate(a.date)}${a.date !== b.date ? ' & ' + shortDate(b.date) : ''})`, attrs: `data-tx="${b.id}"`, sort: 21 });
      }
    }
  }

  // Accounts that may not cover the bills due this week.
  for (const a of state.accounts.filter((x) => ['checking', 'savings', 'cash'].includes(x.type))) {
    const due = billsDue.filter(({ r }) => r.accountId === a.id).reduce((s, { r }) => s + r.amount, 0);
    const bal = accountBalance(a);
    if (due > 0 && due > bal) out.push({ key: `low:${a.id}:${t0}`, icon: '⚠️', tone: 'bad', text: `${a.name} has ${money(bal)} but ${money(due)} in bills are due this week`, attrs: `data-acct="${a.id}"`, sort: -10 });
  }

  const dismissed = state.dismissed || {};
  return out.filter((x) => !dismissed[x.key]).sort((a, b) => a.sort - b.sort);
}
function alertsCard() {
  const alerts = computeAlerts();
  if (!alerts.length) return '';
  return `<div class="card"><h2>Heads up <span class="pill ${alerts.some((a) => a.tone === 'bad') ? 'warn' : ''}">${alerts.length}</span></h2>
    <ul class="list">${alerts.slice(0, 8).map((a) => `<li ${a.attrs}><div class="emoji">${esc(a.icon)}</div>
      <div class="grow small ${a.tone === 'bad' ? 'bad' : ''}" style="color:${a.tone === 'bad' ? '' : 'var(--text)'}">${esc(a.text)}</div>
      <button class="link muted" data-dismiss="${esc(a.key)}" aria-label="Dismiss" title="Dismiss">✕</button></li>`).join('')}</ul></div>`;
}
function notifyDueBills() {
  if (!state.ui.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  state.notified ||= {};
  let changed = false;
  for (const a of computeAlerts().filter((x) => x.bill && !state.notified[x.key])) {
    try { new Notification('AMH Finance — bill reminder', { body: a.text, icon: 'icons/icon-192.png' }); } catch { /* ignore */ }
    state.notified[a.key] = 1; changed = true;
  }
  if (changed) save();
}

// ---------- Weekly summary ----------
function weekStart(s) { const d = parseD(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); }
function spentBetween(from, to) {
  const by = {}; let total = 0, biggest = null;
  for (const t of state.transactions) {
    if (t.date < from || t.date > to) continue;
    for (const p of parts(t)) {
      const c = cat(p.categoryId);
      if (c.kind !== 'expense') continue;
      total -= p.amount; by[c.id] = (by[c.id] || 0) - p.amount;
    }
    if (t.amount < 0 && cat(t.categoryId).kind === 'expense' && (!biggest || t.amount < biggest.amount)) biggest = t;
  }
  return { total: round2(total), by, biggest };
}
function weeklyCard() {
  const t0 = today(), ws = weekStart(t0), n = daysFrom(ws, t0);
  const lws = addDays(ws, -7);
  const cur = spentBetween(ws, t0), prev = spentBetween(lws, addDays(lws, n)), lastFull = spentBetween(lws, addDays(ws, -1));
  if (!cur.total && !lastFull.total) return '';
  const diff = round2(cur.total - prev.total);
  const pct = prev.total ? Math.round((Math.abs(diff) / prev.total) * 100) : null;
  const top = Object.entries(cur.by).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return `<div class="card"><h2>This week <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${esc(shortDate(ws))} – today</span></h2>
    <div class="spread"><div><div class="mid">${money(cur.total, true)}</div>
      ${prev.total ? `<div class="small ${diff <= 0 ? 'good' : 'bad'}">${diff <= 0 ? '▼' : '▲'} ${money(Math.abs(diff), true)}${pct !== null ? ` (${pct}%)` : ''} ${diff <= 0 ? 'less' : 'more'} than the same days last week</div>` : '<div class="small muted">Nothing spent on the same days last week</div>'}</div>
      <div class="small muted" style="text-align:right">All of last week<br><b class="num" style="color:var(--text)">${money(lastFull.total, true)}</b></div></div>
    ${top.length ? `<div class="legend" style="margin-top:10px">${top.map(([id, v]) => `<span>${esc(cat(id).emoji)} ${esc(cat(id).name)} <b class="num" style="color:var(--text)">${money(v, true)}</b></span>`).join('')}</div>` : ''}
    ${cur.biggest ? `<div class="small muted" style="margin-top:6px">Biggest purchase: ${esc(cur.biggest.payee)} ${money(-cur.biggest.amount)}</div>` : ''}
  </div>`;
}

// ---------- Reports ----------
const REPORT_RANGES = [['thisMonth', 'This month'], ['lastMonth', 'Last month'], ['3m', 'Last 3 months'], ['ytd', 'This year'], ['12m', 'Last 12 months'], ['all', 'All time']];
function reportRange(key) {
  const t0 = today(), ym = monthOf(t0);
  if (key === 'thisMonth') return [`${ym}-01`, t0];
  if (key === 'lastMonth') { const m = addMonths(ym, -1); return [`${m}-01`, `${m}-${pad(daysInMonth(m))}`]; }
  if (key === '3m') return [`${addMonths(ym, -2)}-01`, t0];
  if (key === 'ytd') return [`${t0.slice(0, 4)}-01-01`, t0];
  if (key === '12m') return [`${addMonths(ym, -11)}-01`, t0];
  return [state.transactions.reduce((m, t) => (t.date < m ? t.date : m), t0), t0];
}
function buildReport() {
  const r = (state.ui.report ||= { range: 'thisMonth', group: 'category' });
  const [from, to] = reportRange(r.range);
  let spent = 0, income = 0;
  const groups = {}, months = {};
  for (const t of state.transactions) {
    if (t.date < from || t.date > to) continue;
    const m = monthOf(t.date);
    months[m] ||= { spent: 0, income: 0 };
    for (const p of parts(t)) {
      const c = cat(p.categoryId);
      if (c.kind === 'income') { income += p.amount; months[m].income += p.amount; continue; }
      if (c.kind !== 'expense') continue;
      spent -= p.amount; months[m].spent -= p.amount;
      const key = r.group === 'category' ? c.id : r.group === 'merchant' ? (normPayee(t.payee) || t.payee) : m;
      const g = (groups[key] ||= {
        key, value: 0, count: 0,
        label: r.group === 'category' ? `${c.emoji} ${c.name}` : r.group === 'merchant' ? t.payee : monthLabel(m),
        attrs: r.group === 'category' ? `data-rcat="${c.id}"` : r.group === 'merchant' ? `data-rq="${esc(t.payee)}"` : '',
      });
      g.value -= p.amount; g.count++;
    }
  }
  let rows = Object.values(groups).filter((g) => Math.abs(g.value) >= 0.005);
  rows = r.group === 'month' ? rows.sort((a, b) => b.key.localeCompare(a.key)) : rows.sort((a, b) => b.value - a.value);
  if (r.group === 'merchant') rows = rows.slice(0, 40);
  const nMonths = Math.max(1, (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7)) + 1);
  return { r, from, to, spent: round2(spent), income: round2(income), rows, months, nMonths };
}
function viewReports() {
  const { r, from, to, spent, income, rows, months, nMonths } = buildReport();
  const max = Math.max(1, ...rows.map((x) => x.value));
  const monthKeys = Object.keys(months).sort().reverse();
  return `
    <div class="chips" style="margin-bottom:10px">${REPORT_RANGES.map(([k, l]) => `<button class="chip ${r.range === k ? 'on' : ''}" data-rrange="${k}">${l}</button>`).join('')}</div>
    <div class="card">
      <div class="muted small">${esc(shortDate(from))}${from.slice(0, 4) !== to.slice(0, 4) ? ' ' + from.slice(0, 4) : ''} – ${esc(shortDate(to))} ${to.slice(0, 4)}</div>
      <div class="spread" style="margin-top:6px">
        <div><div class="muted small">Spent</div><div class="mid">${money(spent, true)}</div></div>
        <div><div class="muted small">Income</div><div class="mid good">${money(income, true)}</div></div>
        <div style="text-align:right"><div class="muted small">Net</div><div class="mid ${income - spent >= 0 ? 'good' : 'bad'}">${wholeSigned(income - spent)}</div></div>
      </div>
      ${nMonths > 1 ? `<div class="small muted" style="margin-top:6px">Average ${money(spent / nMonths, true)} spent per month</div>` : ''}
    </div>
    <div class="segmented" data-rgroup-seg style="margin-bottom:10px">${[['category', 'By category'], ['merchant', 'By store'], ['month', 'By month']].map(([k, l]) => `<button data-rgroup="${k}" class="${r.group === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${rows.length ? `<ul class="list card" style="padding:2px 14px">${rows.map((g) => `<li ${g.attrs} style="flex-wrap:wrap${g.attrs ? '' : ';cursor:default'}">
        <div class="grow"><div class="spread"><span class="title ellipsis">${esc(g.label)}</span><span class="num small">${money(g.value)}</span></div>
        <div class="bar"><i style="width:${Math.max(0, (g.value / max) * 100)}%"></i></div>
        <div class="sub">${spent ? Math.round((g.value / spent) * 100) : 0}% of spending · ${g.count} purchase${g.count === 1 ? '' : 's'}</div></div></li>`).join('')}</ul>`
      : '<div class="card empty"><div class="e">📊</div>No spending in this period.</div>'}
    ${monthKeys.length > 1 && r.group !== 'month' ? `<div class="section-title">Month by month</div><div class="card" style="padding:8px 14px">
      <table class="rtable"><thead><tr><th>Month</th><th>Income</th><th>Spent</th><th>Net</th></tr></thead><tbody>
      ${monthKeys.map((m) => { const x = months[m], net = x.income - x.spent; return `<tr><td>${esc(monthLabel(m, true))} ${m.slice(2, 4)}</td><td class="num good">${money(x.income, true)}</td><td class="num">${money(x.spent, true)}</td><td class="num ${net >= 0 ? 'good' : 'bad'}">${wholeSigned(net)}</td></tr>`; }).join('')}
      </tbody></table></div>` : ''}
    <button class="btn secondary" data-a="rptcsv" style="margin-top:6px">Download this report (CSV)</button>`;
}
function reportCSV() {
  const { r, from, to, rows, spent } = buildReport();
  const head = [r.group === 'category' ? 'Category' : r.group === 'merchant' ? 'Store' : 'Month', 'Spent', '% of spending', 'Purchases'];
  const lines = [head].concat(rows.map((g) => [g.label.replace(/^\S+\s/, r.group === 'category' ? '' : '$&'), g.value.toFixed(2), spent ? ((g.value / spent) * 100).toFixed(1) : '0', g.count]));
  download(`report-${from}-to-${to}.csv`, lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
}

// ---------- Ask Claude ----------
function buildClaudeContext() {
  const t0 = today(), ym = monthOf(t0), L = [];
  L.push(`Today: ${t0} (${parseD(t0).toLocaleDateString('en-US', { weekday: 'long' })}). Currency: USD.`);
  const nw = netWorth();
  L.push(`\nNET WORTH: ${money(nw.net)} (assets ${money(nw.assets)}, debts ${money(nw.liabilities)})`);
  L.push('\nACCOUNTS (name | type | balance; debts shown negative)');
  for (const a of state.accounts) L.push(`${a.name} | ${ACCOUNT_TYPES[a.type]?.label || a.type} | ${money(accountBalance(a))}${a.hidden ? ' | excluded from net worth' : ''}`);
  const by = spendingByCategory(ym);
  L.push(`\nTHIS MONTH'S BUDGETS (${monthLabel(ym)}, day ${new Date().getDate()} of ${daysInMonth(ym)}) (category | monthly budget | spent so far)`);
  for (const c of expenseCats()) L.push(`${c.name} | ${+c.budget ? money(c.budget) : 'none'} | ${money(by[c.id] || 0)}`);
  L.push('\nMONTHLY TOTALS (month | income | spending | spending by category)');
  for (let i = 0; i < 12; i++) {
    const m = addMonths(ym, -i), tot = monthTotals(m);
    if (!tot.spent && !tot.income) continue;
    const cats = Object.entries(spendingByCategory(m)).filter(([, v]) => Math.abs(v) >= 0.5).sort((a, b) => b[1] - a[1]).map(([id, v]) => `${cat(id).name} ${money(v, true)}`).join(', ');
    L.push(`${m} | ${money(tot.income)} | ${money(tot.spent)} | ${cats}`);
  }
  if (state.recurrings.length) {
    L.push('\nRECURRING BILLS & SUBSCRIPTIONS (name | amount | how often | next due)');
    for (const r of state.recurrings) L.push(`${r.name} | ${money(r.amount)} | ${r.freq} | ${nextDue(r) || 'unknown'}`);
  }
  if (state.goals.length) {
    L.push('\nSAVINGS GOALS (goal | saved | target | target date)');
    for (const g of state.goals) L.push(`${g.name} | ${money(g.saved)} | ${money(g.target)} | ${g.by || 'none'}`);
  }
  L.push(billsContext());
  const since = addDays(t0, -365);
  const txs = state.transactions.filter((t) => t.date >= since).sort((a, b) => b.date.localeCompare(a.date));
  const shown = txs.slice(0, 3000);
  L.push(`\nTRANSACTIONS, newest first (${shown.length}${txs.length > shown.length ? ` of ${txs.length}` : ''} from the last 12 months) (date | payee | amount | category | account | notes)`);
  for (const t of shown) {
    const c = t.splits?.length ? 'Split: ' + t.splits.map((p) => `${cat(p.categoryId).name} ${money(Math.abs(p.amount))}`).join(' + ') : cat(t.categoryId).name;
    L.push(`${t.date} | ${t.payee} | ${t.amount.toFixed(2)} | ${c} | ${acct(t.accountId)?.name || ''} | ${[t.pending ? 'pending' : '', t.note || ''].filter(Boolean).join('; ')}`);
  }
  return L.join('\n');
}
function mdLite(text) {
  // Tiny, safe formatter for Claude's answers: paragraphs, bullet/numbered lists, **bold**, headings.
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = []; let list = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd(), m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) { if (!list) { list = []; } list.push(`<li>${inline(m[1])}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    if (!line.trim()) continue;
    const h = line.match(/^#{1,6}\s+(.*)$/);
    out.push(h ? `<p><b>${inline(h[1])}</b></p>` : `<p>${inline(line)}</p>`);
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  return out.join('');
}
const ASK_SUGGESTIONS = ['How much did I spend eating out last month?', 'Where could I cut back this month?', 'Any unusual charges lately?',
  'Am I on track with my budget?', 'What do my subscriptions cost per year?', 'How did this month compare to last month?'];
let askBusy = false;
function askCard() {
  return `<div class="card ask-card" data-askcard><div class="emoji">✨</div>
    <div class="grow"><div class="title">Ask Claude about your money</div>
    <div class="sub muted small">e.g. “Where could I cut back this month?”</div></div><span class="link">Ask</span></div>`;
}
function openAsk(initialQuestion) {
  state.chat ||= [];
  const notice = () => {
    if (!localApi) return '<div class="card small">Ask Claude works when you open AMH Finance from the <b>AMH Finance</b> icon on your Mac’s Desktop.</div>';
    if (!localApi.claude) return `<div class="card small"><b>Ask Claude isn’t set up yet.</b> Close the small AMH Finance window, double-click <b>AMH Finance</b> on your Desktop, and type <b>c</b> when asked. You’ll sign in with your Claude account.
      <div class="btn-row"><button class="btn secondary small" data-recheck>I’ve done it — check again</button></div></div>`;
    return '';
  };
  const bubbles = () => state.chat.length
    ? state.chat.map((m) => `<div class="bubble ${m.role === 'user' ? 'user' : 'ai'}">${m.role === 'user' ? esc(m.text) : mdLite(m.text)}</div>`).join('')
    : `<div class="muted small" style="margin-bottom:4px">Ask anything about your spending, bills, budgets or goals. Try:</div>
       <div class="chips" style="flex-wrap:wrap">${ASK_SUGGESTIONS.map((s) => `<button class="chip" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
  openSheet('✨ Ask Claude', `
    <div data-notice>${notice()}</div>
    <div class="chat" data-chat>${bubbles()}</div>
    <form class="ask-row" data-askform>
      <textarea rows="2" placeholder="e.g. How much did I spend at Costco this year?" aria-label="Your question"></textarea>
      <button class="btn small" type="submit">Ask</button>
    </form>
    <div class="spread small" style="margin-top:8px"><span class="muted">To answer, your question and a summary of your finances are sent to Claude.</span>
      <button class="link" data-clearchat>Clear</button></div>`, (sheet) => {
    const chatEl = $('[data-chat]', sheet), form = $('[data-askform]', sheet), input = $('textarea', form);
    const redraw = () => { chatEl.innerHTML = bubbles(); chatEl.scrollTop = chatEl.scrollHeight; };
    chatEl.scrollTop = chatEl.scrollHeight;
    if (!('ontouchstart' in window)) input.focus();
    const ask = async (q) => {
      q = q.trim();
      if (!q || askBusy) return;
      if (!localApi?.claude) { toast('Set up Ask Claude first (see the note above)'); return; }
      const history = state.chat.slice(-10);
      state.chat.push({ role: 'user', text: q }); save();
      input.value = ''; redraw();
      chatEl.insertAdjacentHTML('beforeend', '<div class="bubble ai thinking" data-thinking>Thinking…</div>');
      chatEl.scrollTop = chatEl.scrollHeight;
      askBusy = true; form.querySelector('button').disabled = true;
      try {
        const res = await fetch('api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AMH': '1' },
          body: JSON.stringify({ question: q, context: buildClaudeContext(), history }) });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
        state.chat.push({ role: 'assistant', text: data.answer });
        state.chat = state.chat.slice(-40); save();
        redraw();
      } catch (e) {
        state.chat.pop(); save(); redraw();
        input.value = q;
        chatEl.insertAdjacentHTML('beforeend', `<div class="bubble ai bad">${esc(e.message || 'Something went wrong.')}</div>`);
        chatEl.scrollTop = chatEl.scrollHeight;
      } finally { askBusy = false; form.querySelector('button').disabled = false; }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
    if (initialQuestion) ask(initialQuestion);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
    sheet.addEventListener('click', async (e) => {
      const s = e.target.closest('[data-suggest]');
      if (s) ask(s.dataset.suggest);
      if (e.target.closest('[data-clearchat]')) { state.chat = []; save(); redraw(); }
      if (e.target.closest('[data-recheck]')) {
        try { localApi = await (await fetch('api/status?refresh=1', { cache: 'no-store' })).json(); } catch { /* offline */ }
        $('[data-notice]', sheet).innerHTML = notice();
        toast(localApi?.claude ? 'Ask Claude is ready' : 'Still not set up');
      }
    });
  });
}

// ---------- Clicks for the views above (called first by app.js) ----------
function handleFeatureClick(e) {
  const el = (s) => e.target.closest(s);
  let n;
  if (el('[data-askcard]')) { openAsk(); return true; }
  if ((n = el('[data-dismiss]'))) { (state.dismissed ||= {})[n.dataset.dismiss] = 1; save(); render(); return true; }
  if ((n = el('[data-rrange]'))) { state.ui.report.range = n.dataset.rrange; save(); render(); return true; }
  if ((n = el('[data-rgroup]'))) { state.ui.report.group = n.dataset.rgroup; save(); render(); return true; }
  if ((n = el('[data-rcat]'))) { state.ui.txFilter = 'c:' + n.dataset.rcat; state.ui.txQuery = ''; goto('tx'); return true; }
  if ((n = el('[data-rq]'))) { state.ui.txFilter = 'all'; state.ui.txQuery = n.dataset.rq; goto('tx'); return true; }
  if ((n = el('[data-a="rptcsv"]'))) { reportCSV(); return true; }
  return false;
}
