/* AMH Finance — Bills tab: bill budgets & due dates, and a paycheck plan that shows
 * how to split each paycheck between bills, everyday spending and savings. Loaded after features.js. */
'use strict';

const PAY_FREQS = {
  weekly: { label: 'Every week', perYear: 52 },
  biweekly: { label: 'Every 2 weeks', perYear: 26 },
  semimonthly: { label: 'Twice a month', perYear: 24 },
  monthly: { label: 'Once a month', perYear: 12 },
};
const ALLOC_COLORS = { bills: '#2f6bff', setaside: '#a35bff', spending: '#e39a12', savings: '#14a36b', hold: '#0ea5b7', left: 'var(--surface-2)' };

// ---------- Finding bills in your transactions ----------
const FREQ_LABEL = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly', quarterly: 'every 3 months', yearly: 'yearly' };
const FREQ_DAYS = { weekly: 7, biweekly: 14, monthly: 30.44, quarterly: 91.3, yearly: 365.25 };
const LOAN_RE = /\b(loan|lending|lender|mortgage|student|navient|nelnet|mohela|sallie|aidvantage|edfinancial|great lakes|auto pay(ment)?|auto loan|car pay(ment)?|financ\w*|fin svc|fin serv|ally|santander|carmax|westlake|exeter|credit acceptance|lease|leasing|upstart|lendingclub|prosper|best egg|avant|oportun|affirm|klarna|afterpay)\b/;
const INSURANCE_RE = /\b(insurance|insur|geico|progressive|state farm|allstate|usaa|liberty mutual|farmers|nationwide|lemonade|root ins|metlife|aflac)\b/;
const CARD_PAYMENT_RE = /(credit card|card pa?y?me?n?t|crd pmt|cc pmt|payment thank you|autopay payment|amex|american express|discover card|chase card|citi card|barclay|synchrony|capital one (?!auto))/;
const OWN_TRANSFER_RE = /(transfer (to|from)|to savings|from savings|savings|vault|round ?up|internal transfer|between accounts)/;
const billKey = (payee) => normPayee(payee).split(' ').filter(Boolean).slice(0, 3).join(' ');
const prettyName = (payee) => {
  let n = String(payee || '').replace(/[#*]?\b\d{4,}\b.*$/, '').replace(/\s{2,}/g, ' ').trim() || String(payee || '');
  if (n === n.toUpperCase()) n = n.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return n;
};
function billEmoji(text, catName) {
  if (/mortgage|hoa|rent/.test(text) || catName === 'Housing') return '🏠';
  if (/student|navient|nelnet|mohela|sallie|aidvantage|edfinancial|great lakes/.test(text)) return '🎓';
  if (INSURANCE_RE.test(text)) return '🛡️';
  if (/auto|car|toyota|honda|ford|chevy|gm financial|nissan|hyundai|kia|tesla|bmw|santander|carmax|westlake|exeter|credit acceptance|ally/.test(text)) return '🚗';
  if (/verizon|t mobile|at&t|att|sprint|mint mobile|visible|cricket|phone|wireless/.test(text)) return '📱';
  if (/electric|power|energy|gas co|water|sewer|trash|utility|utilities/.test(text) || catName === 'Bills & Utilities') return '💡';
  if (/internet|comcast|xfinity|spectrum|cox|fiber|wifi/.test(text)) return '🌐';
  if (/gym|fitness|planet|peloton/.test(text)) return '🏋️';
  if (LOAN_RE.test(text)) return '🧾';
  return catName === 'Subscriptions' ? '🔁' : '📅';
}
function detectRecurring() {
  const t0 = today(), groups = {};
  for (const t of state.transactions) {
    if (t.amount >= 0 || t.pending) continue;
    const text = normPayee(t.payee) + ' ', c = cat(t.categoryId), pc = t.plaidCat || '';
    if (c.kind === 'income') continue;
    const isLoan = /^LOAN_PAYMENTS/.test(pc) && !/CREDIT_CARD/.test(pc) || LOAN_RE.test(text) || INSURANCE_RE.test(text);
    if (/CREDIT_CARD_PAYMENT/.test(pc) || (CARD_PAYMENT_RE.test(text) && !isLoan)) continue;
    if (c.kind === 'transfer' && !isLoan && (/TRANSFER_(IN|OUT)_(ACCOUNT_TRANSFER|SAVINGS|INVESTMENT)/.test(pc) || OWN_TRANSFER_RE.test(text))) continue;
    const k = billKey(t.payee);
    if (!k) continue;
    (groups[k] ||= { list: [], isLoan: false, transfer: false }).list.push(t);
    if (isLoan) groups[k].isLoan = true;
    if (c.kind === 'transfer') groups[k].transfer = true;
  }
  const existing = state.recurrings.map((r) => r.match || billKey(r.name)).filter(Boolean);
  const ignored = state.ignoredBills || {};
  const out = [];
  for (const [k, g] of Object.entries(groups)) {
    if (ignored[k] || existing.some((e) => k.includes(e) || e.includes(k))) continue;
    // One charge per day at most (a second same-day charge is usually a separate purchase).
    const byDay = new Map();
    g.list.sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => { if (!byDay.has(t.date)) byDay.set(t.date, t); });
    const list = [...byDay.values()];
    if (list.length < 2) continue;
    const gaps = list.slice(1).map((t, i) => daysFrom(list[i].date, t.date));
    const med = median(gaps);
    const freq = med >= 5 && med <= 9 ? 'weekly' : med >= 12 && med <= 17 ? 'biweekly' : med >= 25 && med <= 36 ? 'monthly'
      : med >= 80 && med <= 100 ? 'quarterly' : med >= 340 && med <= 390 ? 'yearly' : null;
    if (!freq) continue;
    const need = { weekly: 4, biweekly: 3, monthly: 2, quarterly: 2, yearly: 2 }[freq];
    if (list.length < need) continue;
    // Regular: every gap is about one period (or two, if a month was skipped).
    const P = FREQ_DAYS[freq], tol = Math.max(3, P * 0.2);
    const regular = gaps.filter((gp) => { const m = Math.round(gp / P); return m >= 1 && m <= 2 && Math.abs(gp - m * P) <= tol * m; }).length;
    if (regular < Math.max(1, gaps.length - 1) || (gaps.length >= 2 && regular / gaps.length < 0.75)) continue;
    // Still active: the last payment was within about 1.6 periods.
    const last = list[list.length - 1];
    if (daysFrom(last.date, t0) > P * 1.6 + 5) continue;
    // Amounts: steady (within 20%) or a bill whose amount varies (utilities, phone, loans with interest).
    const amts = list.map((t) => -t.amount), recent = amts.slice(-3);
    const m = median(amts), spread = Math.max(...amts) - Math.min(...amts);
    const steady = amts.every((a) => Math.abs(a - m) <= Math.max(3, m * 0.2));
    const c = cat(last.categoryId), text = normPayee(last.payee);
    const billish = g.isLoan || ['Bills & Utilities', 'Housing', 'Subscriptions'].includes(c.name) || /utilit|electric|water|gas|phone|wireless|internet/.test(text);
    const variable = !steady;
    if (variable && !(billish && spread <= m * 1.5)) continue;
    if (!g.isLoan && !billish && freq === 'weekly' && m < 15) continue; // weekly coffee isn't a bill
    out.push({
      key: k, match: k, suggKey: k, name: prettyName(last.payee), amount: round2(variable ? median(recent) : -last.amount), freq,
      start: last.date, last: last.date, categoryId: last.categoryId, accountId: last.accountId, count: list.length, variable,
      emoji: billEmoji(text, c.name),
      reason: g.isLoan ? (INSURANCE_RE.test(text) ? 'Insurance' : 'Loan payment') : variable ? 'Amount varies' : g.transfer ? 'Regular transfer — a bill?' : '',
    });
  }
  return out.sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a)).slice(0, 25);
}

// ---------- Paycheck detection & schedule ----------
function detectPaycheck() {
  const since = addDays(today(), -120), groups = {};
  for (const t of state.transactions) {
    if (t.amount <= 0 || t.date < since || cat(t.categoryId).kind !== 'income') continue;
    (groups[normPayee(t.payee) || t.payee] ||= []).push(t);
  }
  const best = Object.values(groups).filter((l) => l.length >= 2).sort((a, b) => b.length - a.length)[0];
  if (!best) return null;
  best.sort((a, b) => a.date.localeCompare(b.date));
  const gaps = best.slice(1).map((t, i) => daysFrom(best[i].date, t.date));
  const g = median(gaps);
  // Days of the month it usually arrives (for twice-a-month pay).
  const counts = {};
  best.forEach((t) => { const d = +t.date.slice(8); counts[d] = (counts[d] || 0) + 1; });
  const topDays = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([d]) => +d);
  const freq = g <= 9 ? 'weekly' : g <= 18 ? (Object.keys(counts).length <= 3 ? 'semimonthly' : 'biweekly') : 'monthly';
  const last = best[best.length - 1];
  return {
    name: last.payee, amount: round2(median(best.slice(-4).map((t) => t.amount))), freq, anchor: last.date,
    day1: Math.min(...topDays.slice(0, 2)) || 1, day2: Math.max(...topDays.slice(0, 2)) || 15, buffer: 2, save: 0, count: best.length,
  };
}
function paydays(p, from, to) {
  const out = [];
  if (p.freq === 'weekly' || p.freq === 'biweekly') {
    const step = p.freq === 'weekly' ? 7 : 14;
    let d = addDays(p.anchor, Math.ceil(daysFrom(p.anchor, from) / step) * step);
    for (; d <= to; d = addDays(d, step)) out.push(d);
  } else {
    for (let ym = monthOf(from); `${ym}-01` <= to; ym = addMonths(ym, 1)) {
      const days = p.freq === 'semimonthly' ? [p.day1 || 1, p.day2 || 15] : [+p.anchor.slice(8)];
      for (const day of days) {
        const d = `${ym}-${pad(Math.min(day, daysInMonth(ym)))}`;
        if (d >= from && d <= to) out.push(d);
      }
    }
  }
  return [...new Set(out)].sort();
}
const perYear = (p) => PAY_FREQS[p.freq]?.perYear || 26;

// ---------- Budget pieces ----------
const isSetAsideBill = (r) => r.freq === 'yearly' || r.freq === 'quarterly';
function monthlyBills() { return state.recurrings.reduce((s, r) => s + monthlyEquivalent(r), 0); }
function everydayMonthly() {
  // Category budgets, minus the part already covered by bills in that category (no double counting).
  const billsByCat = {};
  state.recurrings.forEach((r) => { billsByCat[r.categoryId] = (billsByCat[r.categoryId] || 0) + monthlyEquivalent(r); });
  return expenseCats().reduce((s, c) => s + Math.max(0, (+c.budget || 0) - (billsByCat[c.id] || 0)), 0);
}
function goalsMonthly() {
  return state.goals.reduce((s, g) => {
    if (!g.by || g.saved >= g.target) return s;
    const months = Math.max(1, Math.round(daysFrom(today(), g.by) / 30.4));
    return s + (g.target - g.saved) / months;
  }, 0);
}
function lastPayment(r) {
  const key = r.match || normPayee(r.name);
  return state.transactions.filter((t) => t.amount < 0 && (t.recurringId === r.id || (key && normPayee(t.payee).includes(key))))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

// ---------- The plan ----------
function buildPaycheckPlan() {
  const p = state.paycheck;
  if (!p?.amount) return null;
  const t0 = today(), buffer = +p.buffer || 0, n = 5;
  const all = paydays(p, addDays(t0, -45), addDays(t0, 120));
  let cur = all.filter((d) => d <= t0).length - 1;
  if (cur < 0) cur = 0;
  const dates = all.slice(cur, cur + n);
  if (!dates.length) return null;
  const nextAfter = all[cur + n] || addDays(dates[dates.length - 1], Math.round(365 / perYear(p)));
  const py = perYear(p);
  const spending = round2((everydayMonthly() * 12) / py);
  // Savings: a fixed amount if you chose one; otherwise what your goals need, up to what you can afford on average.
  const surplusPerCheck = ((p.amount * py) / 12 - monthlyBills() - everydayMonthly()) * 12 / py;
  const goalsPerCheck = (goalsMonthly() * 12) / py;
  const savingsTarget = round2(+p.save > 0 ? +p.save : Math.max(0, Math.min(goalsPerCheck, surplusPerCheck)));
  const checks = dates.map((date, i) => ({ date, amount: p.amount, current: i === 0 && date <= t0, bills: [], setAside: [], spending, savings: 0 }));

  // Yearly / quarterly bills: save a little from every paycheck instead of one big hit.
  for (const r of state.recurrings.filter(isSetAsideBill)) {
    const per = round2((r.amount * (r.freq === 'yearly' ? 1 : 4)) / py);
    checks.forEach((c) => c.setAside.push({ r, amount: per }));
  }
  // Every other bill: paid from the last paycheck that arrives at least `buffer` days before it's due.
  for (const r of state.recurrings.filter((x) => !isSetAsideBill(x))) {
    for (let ym = monthOf(dates[0]); `${ym}-01` <= nextAfter; ym = addMonths(ym, 1)) {
      for (const due of occurrencesInMonth(r, ym)) {
        const payBy = addDays(due, -buffer);
        if (due < dates[0] || payBy >= nextAfter) continue;
        let idx = -1;
        dates.forEach((d, i) => { if (d <= payBy) idx = i; });
        const tight = idx === -1;
        checks[Math.max(0, idx)].bills.push({ r, due, amount: r.amount, paid: !!findPayment(r, due), tight });
      }
    }
  }
  // Smooth it out: if a paycheck can't cover its bills, pay some of them early from the paycheck before.
  const room = (c) => c.amount - c.spending - c.setAside.reduce((s, x) => s + x.amount, 0) - c.bills.reduce((s, b) => s + b.amount, 0);
  for (let i = 1; i < checks.length; i++) {
    const movable = checks[i].bills.filter((b) => !b.paid).sort((a, b) => b.amount - a.amount);
    for (const b of movable) {
      if (room(checks[i]) >= 0) break;
      if (room(checks[i - 1]) >= b.amount) {
        checks[i].bills.splice(checks[i].bills.indexOf(b), 1);
        checks[i - 1].bills.push({ ...b, early: true });
      }
    }
  }
  for (const c of checks) {
    c.bills.sort((a, b) => a.due.localeCompare(b.due));
    c.billsTotal = round2(c.bills.reduce((s, b) => s + b.amount, 0));
    c.setAsideTotal = round2(c.setAside.reduce((s, x) => s + x.amount, 0));
    c.left = round2(c.amount - c.billsTotal - c.setAsideTotal - c.spending);
    c.holdForward = 0; c.fromEarlier = 0;
  }
  // Carry money forward: extra from one paycheck covers a later paycheck that comes up short.
  for (let i = 1; i < checks.length; i++) {
    for (let j = i - 1; j >= 0 && checks[i].left < 0; j--) {
      const take = round2(Math.min(Math.max(0, checks[j].left), -checks[i].left));
      if (take <= 0) continue;
      checks[j].left = round2(checks[j].left - take); checks[j].holdForward = round2(checks[j].holdForward + take);
      checks[i].left = round2(checks[i].left + take); checks[i].fromEarlier = round2(checks[i].fromEarlier + take);
    }
  }
  // Savings come out of what's left, so they never make a paycheck short.
  for (const c of checks) { c.savings = round2(Math.min(savingsTarget, Math.max(0, c.left))); c.left = round2(c.left - c.savings); }
  const savings = round2(checks.reduce((s, c) => s + c.savings, 0) / checks.length);
  return { p, checks, py, spending, savings, goalsMonthly: goalsMonthly(), savingsMonthly: (savings * py) / 12 };
}

// ---------- Views ----------
function allocBar(c) {
  const segs = [['bills', c.billsTotal], ['setaside', c.setAsideTotal], ['spending', c.spending], ['savings', c.savings], ['hold', c.holdForward], ['left', Math.max(0, c.left)]];
  const total = Math.max(c.amount, segs.reduce((s, [, v]) => s + v, 0)) || 1;
  return `<div class="alloc">${segs.filter(([, v]) => v > 0).map(([k, v]) => `<i style="width:${(v / total) * 100}%;background:${ALLOC_COLORS[k]}" title="${k}"></i>`).join('')}</div>`;
}
function paycheckCard(c) {
  const row = (color, label, amount, extra = '') => `<div class="spread small alloc-row"><span><i class="dot" style="background:${color}"></i>${label}</span><span class="num">${extra}${money(amount)}</span></div>`;
  return `<div class="card">
    <div class="spread"><div><div class="small muted">${c.current ? 'Current paycheck' : 'Paycheck'} · ${esc(dayLabel(c.date))}</div><div class="mid">${money(c.amount)}</div>
      ${c.fromEarlier ? `<div class="small good">+ ${money(c.fromEarlier)} kept from an earlier paycheck</div>` : ''}</div>
      <div style="text-align:right"><div class="small muted">${c.left >= 0 ? 'Left over' : 'Short by'}</div><div class="mid ${c.left >= 0 ? 'good' : 'bad'}">${money(Math.abs(c.left))}</div></div></div>
    ${allocBar(c)}
    ${row(ALLOC_COLORS.bills, `Bills (${c.bills.length})`, c.billsTotal)}
    ${c.bills.length ? `<ul class="list bill-list">${c.bills.map((b) => `<li data-rec="${b.r.id}" data-date="${b.due}">
        <span class="bill-emoji">${esc(b.r.emoji)}</span><span class="grow ellipsis">${esc(b.r.name)}
        <span class="muted"> · due ${esc(shortDate(b.due))}</span>${b.paid ? ' <span class="pill good">Paid</span>' : ''}${b.early ? ' <span class="pill" title="Moved to this paycheck so the next one isn’t short">Pay early</span>' : ''}${b.tight ? ' <span class="pill warn">Due before payday</span>' : ''}</span>
        <span class="num">${money(b.amount)}</span></li>`).join('')}</ul>` : ''}
    ${c.setAsideTotal ? row(ALLOC_COLORS.setaside, `Set aside for ${c.setAside.map((x) => esc(x.r.name)).join(', ')}`, c.setAsideTotal) : ''}
    ${c.spending ? row(ALLOC_COLORS.spending, 'Everyday spending (groceries, gas, fun…)', c.spending) : ''}
    ${c.savings ? row(ALLOC_COLORS.savings, 'Savings & goals', c.savings) : ''}
    ${c.holdForward ? row(ALLOC_COLORS.hold, '<b>Keep for the next paycheck’s bills</b>', c.holdForward) : ''}
    ${c.left < 0 ? `<p class="small bad" style="margin:8px 0 0">${c.current ? 'Short this paycheck — your current balance may need to cover it.' : 'This paycheck doesn’t cover everything. Lower some everyday budgets, ask to move a due date, or plan to use savings.'}</p>` : ''}
  </div>`;
}
function viewBills() {
  const plan = buildPaycheckPlan();
  const mb = monthlyBills(), p = state.paycheck;
  const monthlyPay = p?.amount ? (p.amount * perYear(p)) / 12 : 0;
  const detected = !p ? detectPaycheck() : null;
  const pctOfPay = monthlyPay ? Math.round((mb / monthlyPay) * 100) : null;
  return `
    <div class="card">
      <div class="spread"><div><div class="muted small">Bills per month</div><div class="mid">${money(mb, true)}</div><div class="small muted">${state.recurrings.length} bill${state.recurrings.length === 1 ? '' : 's'} & subscriptions</div></div>
      ${monthlyPay ? `<div style="text-align:right"><div class="muted small">Take-home pay</div><div class="mid good">${money(monthlyPay, true)}</div><div class="small muted">per month</div></div>` : ''}</div>
      ${pctOfPay !== null ? `<div class="bar ${pctOfPay > 60 ? 'over' : pctOfPay > 45 ? 'near' : 'good'}" style="margin-top:10px"><i style="width:${Math.min(100, pctOfPay)}%"></i></div>
        <div class="small muted" style="margin-top:4px">Bills use <b style="color:var(--text)">${pctOfPay}%</b> of your take-home pay. Everyday budgets ${money(everydayMonthly(), true)}/mo · Savings ${money(plan?.savingsMonthly || 0, true)}/mo${plan && !(+p.save > 0) && plan.goalsMonthly > plan.savingsMonthly + 1 ? ` <span class="bad">(your goals need ${money(plan.goalsMonthly, true)}/mo)</span>` : ''} · Left ${money(monthlyPay - mb - everydayMonthly() - (plan?.savingsMonthly || 0), true)}/mo</div>` : ''}
      <div class="btn-row"><button class="btn small" data-a="newrec">+ Add a bill</button></div>
    </div>

    ${billSuggestionsHTML()}

    <div class="section-title spread"><span>Paycheck plan</span>${p ? '<button class="link" data-a="paycheck">Edit paycheck</button>' : ''}</div>
    ${!p ? `<div class="card">
        <div class="title">💵 Plan each paycheck</div>
        <p class="small muted">Tell the app about your paycheck and it will show which bills to pay from each one, how much is left for everyday spending and savings, and warn you before a paycheck comes up short.</p>
        ${detected ? `<p class="small">We found it in your deposits: <b>${esc(detected.name)}</b>, about <b>${money(detected.amount)}</b>, ${esc(PAY_FREQS[detected.freq].label.toLowerCase())}${detected.freq === 'semimonthly' ? ` (around the ${ordinal(detected.day1)} and ${detected.day2 >= 28 ? 'end of the month' : 'the ' + ordinal(detected.day2)})` : ''}.</p>
          <button class="btn" data-a="usepay">Use this paycheck</button><div class="btn-row"><button class="btn secondary" data-a="paycheck">Change details</button></div>`
          : '<button class="btn" data-a="paycheck">Set up my paycheck</button>'}
      </div>` : plan ? `${plan.checks.map(paycheckCard).join('')}
      <p class="small muted">How this works: each bill is paid from the last paycheck that arrives at least ${+p.buffer || 0} day${+p.buffer === 1 ? '' : 's'} before it’s due. If a paycheck would come up short, some bills are moved to the paycheck before it (“Pay early”), or extra from an earlier paycheck is kept to cover it. Yearly and quarterly bills are saved for a little at a time. Everyday spending comes from your Budgets tab.</p>` : ''}

    <div class="section-title">Your bills</div>
    ${viewRecurring()}`;
}

function billSuggestionsHTML() {
  const suggestions = detectRecurring();
  return suggestions.length ? `<div class="section-title spread"><span>Possible bills found in your transactions (${suggestions.length})</span><button class="link" data-a="addallbills">Add all</button></div>
      <ul class="list card" style="padding:2px 14px">${suggestions.map((s, i) => `<li data-sugg="${i}"><div class="emoji">${esc(s.emoji)}</div>
        <div class="grow"><div class="title ellipsis">${esc(s.name)}</div>
        <div class="sub">${s.variable ? 'about ' : ''}${money(s.amount)} · ${esc(FREQ_LABEL[s.freq] || s.freq)} · seen ${s.count}× · last ${esc(shortDate(s.last))}${s.last.slice(0, 4) !== today().slice(0, 4) ? ' ' + s.last.slice(0, 4) : ''}${s.reason ? ` · <b>${esc(s.reason)}</b>` : ''}</div></div>
        <span class="pill">Add</span><button class="link muted" data-ignoresugg="${esc(s.key)}" aria-label="Not a bill" title="Not a bill">✕</button></li>`).join('')}</ul>
      <p class="small muted">Tap one to check the details before adding. ✕ hides it if it isn’t a bill.</p>` : '';
}

function paycheckForm(prefill) {
  const p = { name: 'Paycheck', amount: '', freq: 'biweekly', anchor: today(), day1: 1, day2: 15, buffer: 2, save: 0, ...(state.paycheck || prefill || detectPaycheck() || {}) };
  openForm({
    title: 'Your paycheck',
    values: p,
    fields: [
      { key: 'name', label: 'Name', placeholder: 'e.g. Paycheck' },
      { key: 'amount', label: 'Take-home amount (what lands in your account)', type: 'money', required: true, big: true },
      { key: 'freq', label: 'How often you’re paid', type: 'select', options: Object.entries(PAY_FREQS).map(([value, f]) => ({ value, label: f.label })) },
      { key: 'anchor', label: 'Date of a recent payday', type: 'date', required: true },
      { key: 'day1', label: 'Twice a month only — first payday (day of month)', type: 'number' },
      { key: 'day2', label: 'Twice a month only — second payday (31 = last day)', type: 'number' },
      { key: 'buffer', label: 'Pay bills how many days before they’re due?', type: 'select', options: [0, 1, 2, 3, 5].map((d) => ({ value: d, label: d ? `${d} day${d > 1 ? 's' : ''} early` : 'On the due date' })) },
      { key: 'save', label: 'Save from each paycheck (leave 0 to use your goals)', type: 'money' },
    ],
    onSave(v) {
      if (!(v.amount > 0)) { toast('Enter your take-home amount'); return false; }
      state.paycheck = { ...v, amount: round2(v.amount), buffer: +v.buffer || 0, save: Math.max(0, v.save || 0),
        day1: Math.min(31, Math.max(1, Math.round(v.day1) || 1)), day2: Math.min(31, Math.max(1, Math.round(v.day2) || 15)) };
      toast('Paycheck plan updated');
    },
    onDelete: state.paycheck ? () => { delete state.paycheck; } : null,
  });
}

function billsContext() {
  const plan = buildPaycheckPlan();
  if (!plan) return '';
  const L = [`\nPAYCHECK: ${money(plan.p.amount)} take-home, ${PAY_FREQS[plan.p.freq].label.toLowerCase()}; bills paid ${plan.p.buffer} days before due.`,
    'PAYCHECK PLAN (payday | amount | bills | set-asides | everyday spending | savings | left over | bills paid from it)'];
  for (const c of plan.checks) L.push(`${c.date} | ${money(c.amount)} | ${money(c.billsTotal)} | ${money(c.setAsideTotal)} | ${money(c.spending)} | ${money(c.savings)} | ${money(c.left)} | ${c.bills.map((b) => `${b.r.name} ${money(b.amount)} due ${b.due}${b.paid ? ' (paid)' : ''}`).join('; ')}`);
  return L.join('\n');
}

function handleBillsClick(e) {
  const ig = e.target.closest('[data-ignoresugg]');
  if (ig) { (state.ignoredBills ||= {})[ig.dataset.ignoresugg] = 1; save(); render(); toast('Hidden — it won’t be suggested again'); return true; }
  const n = e.target.closest('[data-a]');
  if (n?.dataset.a === 'addallbills') {
    const list = detectRecurring();
    if (!list.length || !confirm(`Add all ${list.length} as bills? You can edit or delete any of them later.`)) return true;
    for (const s of list) state.recurrings.push({ id: uid(), name: s.name, emoji: s.emoji, amount: s.amount, freq: s.freq, start: s.start,
      categoryId: s.categoryId, accountId: s.accountId, variable: s.variable, match: s.match });
    save(); render(); toast(`Added ${list.length} bills`);
    return true;
  }
  if (!n) return false;
  if (n.dataset.a === 'paycheck') { paycheckForm(); return true; }
  if (n.dataset.a === 'usepay') { const d = detectPaycheck(); if (d) { delete d.count; state.paycheck = d; save(); render(); toast('Paycheck plan ready'); } return true; }
  return false;
}
