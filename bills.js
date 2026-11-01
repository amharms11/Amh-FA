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
const INSURANCE_RE = /\b(insurance|insur|geico|progressive|state farm|allstate|usaa|liberty mutual|farmers|nationwide|lemonade|root ins|metlife|aflac|life ins)\b/;
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
  if (/school|preschool|daycare|tuition|lunch|kids|child/.test(text) || /kid|school/i.test(catName || '')) return '🎒';
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
    if (!isLoan && (isOwnMove(t.payee) || OWN_TRANSFER_RE.test(text))) continue; // vaults & own-account moves are never bills
    if (c.kind === 'transfer' && !isLoan && /TRANSFER_(IN|OUT)_(ACCOUNT_TRANSFER|SAVINGS|INVESTMENT)/.test(pc)) continue;
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
      <div class="btn-row"><button class="btn small" data-a="newrec">+ Add a bill</button><button class="btn small secondary" data-a="pastebills">📋 Paste a bill list</button>${state.recurrings.length ? '<button class="btn small secondary" data-a="billcal">📅 Add to calendar</button>' : ''}</div>
    </div>

    ${billSuggestionsHTML()}

    <div class="section-title">Your bills</div>
    ${viewRecurring()}

    <div class="section-title spread"><span>Paycheck plan</span>${p ? '<button class="link" data-a="paycheck">Edit paycheck</button>' : ''}</div>
    ${!p ? `<div class="card">
        <div class="title">💵 Plan each paycheck</div>
        <p class="small muted">Tell the app about your paycheck and it will show which bills to pay from each one, how much is left for everyday spending and savings, and warn you before a paycheck comes up short.</p>
        ${detected ? `<p class="small">We found it in your deposits: <b>${esc(detected.name)}</b>, about <b>${money(detected.amount)}</b>, ${esc(PAY_FREQS[detected.freq].label.toLowerCase())}${detected.freq === 'semimonthly' ? ` (around the ${ordinal(detected.day1)} and ${detected.day2 >= 28 ? 'end of the month' : 'the ' + ordinal(detected.day2)})` : ''}.</p>
          <button class="btn" data-a="usepay">Use this paycheck</button><div class="btn-row"><button class="btn secondary" data-a="paycheck">Change details</button></div>`
          : '<button class="btn" data-a="paycheck">Set up my paycheck</button>'}
      </div>` : (p.method || 'even') === 'even' ? methodPicker(p) + evenPlanHTML() : plan ? `${methodPicker(p)}
      <p class="small muted" style="margin-top:0">Each bill is paid from the paycheck before its due date. Simple, but paychecks can be uneven — if any show “Short by”, switch to <b>Same amount each paycheck</b>.</p>
      ${plan.checks.map(paycheckCard).join('')}
      <p class="small muted">How this works: each bill is paid from the last paycheck that arrives at least ${+p.buffer || 0} day${+p.buffer === 1 ? '' : 's'} before it’s due. If a paycheck would come up short, some bills are moved to the paycheck before it (“Pay early”), or extra from an earlier paycheck is kept to cover it. Yearly and quarterly bills are saved for a little at a time. Everyday spending comes from your Budgets tab.</p>` : ''}`;
}

// ---------- "Same amount every paycheck" method (Bills vault) ----------
function billsDueBetween(from, to) {
  const out = [];
  for (const r of state.recurrings) {
    for (let ym = monthOf(from); `${ym}-01` <= to; ym = addMonths(ym, 1)) {
      for (const d of occurrencesInMonth(r, ym)) if (d >= from && d <= to && !findPayment(r, d)) out.push({ r, date: d, amount: r.amount });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function buildEvenPlan() {
  const p = state.paycheck;
  if (!p?.amount) return null;
  const py = perYear(p), t0 = today(), horizon = addDays(t0, 182);
  const contribution = round2(Math.ceil(((monthlyBills() * 12) / py) * 100) / 100);
  const spending = round2((everydayMonthly() * 12) / py);
  const room = p.amount - contribution - spending;
  const target = +p.save > 0 ? +p.save : Math.min((goalsMonthly() * 12) / py, Math.max(0, room));
  const savings = round2(Math.max(0, Math.min(target, room)));
  const left = round2(p.amount - contribution - spending - savings);
  // Simulate the vault: +contribution every payday, −each bill on its due date (payday counted first).
  const pays = paydays(p, addDays(t0, 1), horizon);
  const bills = billsDueBetween(t0, horizon);
  const events = pays.map((d) => ({ date: d, amt: contribution, pay: true })).concat(bills.map((b) => ({ date: b.date, amt: -b.amount })))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.pay ? -1 : 1));
  let bal = 0, min = 0, minDate = t0;
  const raw = [{ date: t0, value: 0 }];
  for (const e of events) { bal += e.amt; if (bal < min) { min = bal; minDate = e.date; } raw.push({ date: e.date, value: bal }); }
  const cushion = min < 0 ? Math.ceil(-min / 50) * 50 : 0;
  const points = raw.map((x) => ({ date: x.date, value: round2(x.value + cushion) }));
  const checks = pays.slice(0, 4).map((d, i) => {
    const next = pays[i + 1] || addDays(d, Math.round(365 / py));
    const due = bills.filter((b) => b.date >= d && b.date < next);
    return { date: d, due, dueTotal: round2(due.reduce((s, b) => s + b.amount, 0)) };
  });
  const beforeFirst = bills.filter((b) => b.date < (pays[0] || horizon));
  return { p, py, contribution, spending, savings, left, cushion, minDate, points, checks, beforeFirst };
}
function billLines(list) {
  return `<ul class="list bill-list" style="margin-left:0">${list.map((b) => `<li data-rec="${b.r.id}" data-date="${b.date}"><span class="bill-emoji">${esc(b.r.emoji)}</span><span class="grow ellipsis">${esc(b.r.name)} <span class="muted">· ${esc(shortDate(b.date))}</span></span><span class="num">${money(b.amount)}</span></li>`).join('')}</ul>`;
}
function evenPlanHTML() {
  const e = buildEvenPlan();
  if (!e) return '';
  const splitText = e.p.freq === 'semimonthly' ? 'half of your monthly bills' : e.p.freq === 'monthly' ? 'all of your monthly bills'
    : `your monthly bills × 12 ÷ ${e.py} paychecks a year`;
  const c = { amount: e.p.amount, billsTotal: e.contribution, setAsideTotal: 0, spending: e.spending, savings: e.savings, holdForward: 0, left: e.left };
  const row = (color, label, amount) => `<div class="spread small alloc-row"><span><i class="dot" style="background:${color}"></i>${label}</span><span class="num">${money(amount)}</span></div>`;
  return `<div class="card">
      <div class="small muted">Every paycheck (${money(e.p.amount)})</div>
      <div class="mid">Move ${money(e.contribution)} to a “Bills” vault</div>
      <p class="small muted" style="margin:4px 0 0">That’s ${splitText}. Pay every bill from the vault, and your bills are covered no matter when they’re due.</p>
      ${allocBar(c)}
      ${row(ALLOC_COLORS.bills, '<b>To your Bills vault</b>', e.contribution)}
      ${row(ALLOC_COLORS.spending, 'Everyday spending (groceries, gas, fun…)', e.spending)}
      ${e.savings ? row(ALLOC_COLORS.savings, 'Savings & goals', e.savings) : ''}
      <div class="spread small alloc-row"><b>${e.left >= 0 ? 'Left over' : 'Short by'}</b><b class="num ${e.left >= 0 ? 'good' : 'bad'}">${money(Math.abs(e.left))}</b></div>
      ${e.left < 0 ? '<p class="small bad" style="margin:4px 0 0">Your paycheck doesn’t cover bills plus everyday budgets. Lower some everyday budgets on the Budgets tab, or look for bills to cut.</p>' : ''}
    </div>
    <div class="card">
      ${e.cushion ? `<div class="title">🛟 One-time starter: put ${money(e.cushion, true)} in the vault</div>
        <p class="small muted" style="margin:4px 0 8px">Bills due before the vault fills up need a head start. With this cushion the vault never runs out — its lowest point is around ${esc(shortDate(e.minDate))}. You only do this once.</p>`
        : '<div class="title">✓ No starter cushion needed</div><p class="small muted" style="margin:4px 0 8px">Your paychecks arrive in time for every bill.</p>'}
      <div class="small muted">Bills vault balance, next 6 months${e.cushion ? ` (starting with ${money(e.cushion, true)})` : ''}</div>
      ${line(e.points, 90)}
    </div>
    ${e.beforeFirst.length ? `<div class="card"><div class="small muted">Due before your next payday — paid from the starter cushion</div>${billLines(e.beforeFirst)}</div>` : ''}
    ${e.checks.map((k) => `<div class="card"><div class="spread"><div><div class="small muted">Paycheck · ${esc(dayLabel(k.date))}</div><div class="title">+ ${money(e.contribution)} to the vault</div></div>
        <div style="text-align:right"><div class="small muted">Bills before next payday</div><div class="title num">${money(k.dueTotal)}</div></div></div>
      ${k.due.length ? billLines(k.due) : '<p class="small muted">No bills due in this stretch.</p>'}</div>`).join('')}
    <p class="small muted">Why this works: some paychecks have far more bills due than others. Putting the same amount in every time evens that out — the vault fills up during light stretches and pays out during heavy ones. If SoFi lets you schedule a recurring transfer to a vault on payday, set it for ${money(e.contribution)} and this runs on its own.</p>`;
}
function methodPicker(p) {
  const m = p.method || 'even';
  return `<div class="segmented" data-method-seg style="margin-bottom:8px">
    <button data-v="even" class="${m === 'even' ? 'on' : ''}">Same amount each paycheck ⭐</button>
    <button data-v="duedate" class="${m === 'duedate' ? 'on' : ''}">By due date</button></div>`;
}

// ---------- Bills on the Budgets tab ----------
function billsNeedFor(c) { return state.recurrings.filter((r) => r.categoryId === c.id).reduce((s, r) => s + monthlyEquivalent(r), 0); }
function billsBudgetCard(ym) {
  if (!state.recurrings.length) return '';
  let due = 0, paid = 0;
  for (const r of state.recurrings) for (const d of occurrencesInMonth(r, ym)) {
    due += r.amount;
    const t = findPayment(r, d);
    if (t) paid += Math.abs(t.amount);
  }
  const short = expenseCats().filter((c) => { const need = billsNeedFor(c); return need > 0 && (+c.budget || 0) < need - 0.5; });
  return `<div class="card">
    <div class="spread"><div><div class="muted small">🧾 Bills this month</div><div class="mid">${money(paid, true)} <span class="muted small">paid of ${money(due, true)}</span></div></div><button class="link" data-goto="recurring">Bills tab</button></div>
    <div class="bar ${paid >= due ? 'good' : ''}"><i style="width:${due ? Math.min(100, (paid / due) * 100) : 0}%"></i></div>
    <div class="small muted" style="margin-top:4px">${money(monthlyBills(), true)}/mo across ${state.recurrings.length} bills · ${money(Math.max(0, due - paid), true)} still to pay this month</div>
    ${short.length ? `<div class="small bad" style="margin-top:8px">${short.map((c) => `${esc(c.name)} (bills ${money(billsNeedFor(c), true)}, budget ${money(+c.budget || 0, true)})`).join(', ')} — the budget doesn’t cover the bills in it.</div>
      <div class="btn-row"><button class="btn small" data-a="coverbills">Raise budgets to cover my bills</button></div>` : '<div class="small good" style="margin-top:6px">✓ Your category budgets cover your bills.</div>'}
  </div>`;
}
function coverBillsInBudgets() {
  const changed = [];
  for (const c of expenseCats()) {
    const need = billsNeedFor(c);
    if (need > 0 && (+c.budget || 0) < need - 0.5) { c.budget = Math.ceil(need / 5) * 5; changed.push(`${c.name} → ${money(c.budget, true)}`); }
  }
  save(); render();
  toast(changed.length ? `Updated: ${changed.join(', ')}` : 'Your budgets already cover your bills');
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
  const ev = buildEvenPlan();
  if (ev) L.push(`BILLS VAULT METHOD (${(plan.p.method || 'even') === 'even' ? 'the user\'s chosen method' : 'alternative'}): move ${money(ev.contribution)} to a Bills vault every paycheck; one-time starter cushion ${money(ev.cushion)}; everyday spending ${money(ev.spending)} and savings ${money(ev.savings)} per paycheck; left over ${money(ev.left)}.`);
  return L.join('\n');
}

// ---------- Home: checking balance ----------
function checkingCard() {
  const accts = state.accounts.filter((a) => a.type === 'checking' && !a.hidden);
  const cards = state.accounts.filter((a) => a.type === 'credit' && !a.hidden);
  if (!accts.length && !cards.length && !state.accounts.some((a) => a.type === 'savings' && !a.hidden)) return '';
  const total = round2(accts.reduce((s, a) => s + accountBalance(a), 0));
  const avail = accts.length && accts.every((a) => a.available != null) ? round2(accts.reduce((s, a) => s + a.available, 0)) : null;
  const updated = state.sync ? esc(syncLabel().replace(/^.*data from /, 'Updated ')) : '';

  const savings = state.accounts.filter((a) => a.type === 'savings' && !a.hidden);
  const savTotal = round2(savings.reduce((s, a) => s + accountBalance(a), 0));
  const open = (state.ui.bankOpen ||= {});
  const group = (key, label, arr, sum, extra = '') => {
    if (!arr.length) return '';
    const isOpen = !!open[key];
    return `<div class="bank-row">
      <button class="bank-head" data-bankgroup="${key}" aria-expanded="${isOpen}">
        <span class="grow" style="text-align:left"><span class="small muted">${label}</span>
          ${extra}</span>
        <span class="mid ${key === 'savings' ? 'good' : ''}">${money(sum)}</span>
        <span class="chev ${isOpen ? 'open' : ''}" aria-hidden="true">›</span>
      </button>
      ${isOpen ? `<ul class="bank-list">${arr.map((a) => `<li data-acct="${a.id}"><span class="grow ellipsis">${esc(a.name)}</span><span class="num">${money(accountBalance(a))}</span></li>`).join('')}</ul>` : ''}
    </div>`;
  };
  let checkingHTML = '';
  if (accts.length || savings.length) {
    // What's left in checking after bills due before the next payday (if the paycheck is set up).
    let after = '';
    const p = state.paycheck;
    const next = accts.length && p?.amount ? paydays(p, addDays(today(), 1), addDays(today(), 40))[0] : null;
    if (next) {
      const due = billsDueBetween(today(), addDays(next, -1));
      const dueTotal = round2(due.reduce((s, b) => s + b.amount, 0));
      const leftAfter = round2((avail ?? total) - dueTotal);
      after = `<div class="small" style="margin-top:8px">${due.length ? `${money(dueTotal)} in bills due before payday (${esc(shortDate(next))}) → checking <b class="${leftAfter >= 0 ? 'good' : 'bad'}">${money(leftAfter)} left</b>` : `No bills due before payday (${esc(shortDate(next))})`}</div>`;
    }
    const countLabel = (arr, word) => `<span class="small muted"> · ${arr.length} ${word}${arr.length === 1 ? '' : 's'}</span>`;
    checkingHTML = `<div class="spread"><div class="muted small">🏦 Bank accounts</div><span class="small muted">${updated}</span></div>
      ${group('checking', 'Checking', accts, total, (avail != null && Math.abs(avail - total) >= 0.01 ? `<br><span class="small muted">Available ${money(avail)}</span>` : '') + (accts.length > 1 ? countLabel(accts, 'account') : ''))}
      ${group('savings', 'Savings', savings, savTotal, savings.length > 1 ? countLabel(savings, 'account/vault').replace('account/vaults', 'accounts & vaults') : '')}
      ${accts.length && savings.length ? `<div class="spread small" style="margin-top:6px"><span class="muted">Total in the bank</span><b class="num">${money(total + savTotal)}</b></div>` : ''}
      ${after}`;
  }

  let cardsHTML = '';
  if (cards.length) {
    const owed = round2(cards.reduce((s, a) => s - accountBalance(a), 0));
    const limits = cards.every((a) => a.limit) ? cards.reduce((s, a) => s + a.limit, 0) : null;
    const used = limits ? owed / limits : 0;
    cardsHTML = `${checkingHTML ? '<div class="card-divider"></div>' : ''}
      <div class="spread"><div class="muted small">💳 Credit card${cards.length > 1 ? 's' : ''}</div><span class="small muted">${limits ? `${Math.round(used * 100)}% of limit used` : checkingHTML ? '' : updated}</span></div>
      <div class="mid ${owed > 0 ? 'bad' : ''}">${money(Math.max(0, owed))} <span class="small muted">owed${owed < 0 ? ` · ${money(-owed)} credit` : ''}</span></div>
      ${limits ? `<div class="bar ${used > 0.5 ? 'over' : used > 0.3 ? 'near' : 'good'}"><i style="width:${Math.min(100, Math.max(0, used * 100))}%"></i></div>
        <div class="small muted" style="margin-top:4px">${money(Math.max(0, limits - owed))} of ${money(limits, true)} credit available</div>` : ''}
      ${cards.length > 1 ? `<div class="small muted">${cards.map((a) => `${esc(a.name)} ${money(-accountBalance(a))}`).join(' · ')}</div>` : ''}
      ${accts.length ? `<div class="small" style="margin-top:6px">Checking after paying ${cards.length > 1 ? 'the cards' : 'the card'} in full: <b class="${total - owed >= 0 ? 'good' : 'bad'}">${money(total - owed)}</b></div>` : ''}`;
  }
  return `<div class="card" data-goto="accounts" style="cursor:pointer">${checkingHTML}${cardsHTML}</div>`;
}

// ---------- Budgets tab: bills inside each category ----------
function categoryBillsHTML(c, ym, part = 'button') {
  const bills = state.recurrings.filter((r) => r.categoryId === c.id);
  if (!bills.length) return '';
  const open = !!(state.ui.catBillsOpen || {})[c.id];
  const monthly = bills.reduce((s, r) => s + monthlyEquivalent(r), 0);
  const b = +c.budget || 0, t0 = today();
  let rows = '';
  if (open) {
    const items = [];
    for (const r of bills) {
      const dates = occurrencesInMonth(r, ym);
      if (!dates.length) { items.push({ r, date: nextDue(r), amount: r.amount, status: 'later' }); continue; }
      for (const d of dates) {
        const paid = findPayment(r, d);
        items.push({ r, date: d, amount: paid ? Math.abs(paid.amount) : r.amount, status: paid ? 'paid' : d < t0 ? 'late' : 'due' });
      }
    }
    items.sort((x, y) => String(x.date).localeCompare(String(y.date)));
    const pill = { paid: '<span class="pill good">Paid</span>', late: '<span class="pill warn">Not paid yet</span>', due: '', later: '<span class="pill">Not this month</span>' };
    rows = `<ul class="cat-bills">${items.map((x) => `<li data-rec="${x.r.id}" data-date="${x.date || ''}">
        <span class="bill-emoji">${esc(x.r.emoji)}</span><span class="grow">${esc(x.r.name)}<span class="muted"> · ${x.status === 'later' ? (x.date ? 'next ' + esc(shortDate(x.date)) : esc(x.r.freq)) : 'due ' + esc(shortDate(x.date))}</span> ${pill[x.status]}</span>
        <span class="num">${money(x.amount)}</span></li>`).join('')}</ul>
      ${b ? `<div class="sub" style="margin-top:4px">Bills use ${money(monthly, true)} of the ${money(b, true)} budget${monthly <= b ? ` → ${money(b - monthly, true)} for other ${esc(c.name.toLowerCase())} spending` : ` — <span class="bad">${money(monthly - b, true)} more than the budget</span>`}</div>` : ''}`;
  }
  if (part === 'list') return rows;
  return `<button class="cat-bills-toggle" data-catbills="${c.id}" aria-expanded="${open}">🧾 ${bills.length} bill${bills.length === 1 ? '' : 's'} · ${money(monthly, true)}/mo <span class="chev ${open ? 'open' : ''}" aria-hidden="true">›</span></button>`;
}

// ---------- Budgets tab: every charge behind a category's number ----------
function categoryCharges(c, ym) {
  const out = [];
  for (const t of txInMonth(ym)) {
    const ps = parts(t).filter((p) => p.categoryId === c.id);
    for (const p of ps) out.push({ t, amount: p.amount, split: !!t.splits?.length });
  }
  return out.sort((a, b) => b.t.date.localeCompare(a.t.date));
}
function categoryChargesHTML(c, ym, part = 'button') {
  const list = categoryCharges(c, ym);
  if (!list.length) return '';
  const total = round2(-list.reduce((s, x) => s + x.amount, 0));
  const open = !!(state.ui.catChargesOpen || {})[c.id];
  if (part === 'button') {
    return `<button class="cat-bills-toggle" data-catcharges="${c.id}" aria-expanded="${open}">💳 ${list.length} charge${list.length === 1 ? '' : 's'} · ${money(total, true)} <span class="chev ${open ? 'open' : ''}" aria-hidden="true">›</span></button>`;
  }
  if (!open) return '';
  const opts = catOptions(['expense', 'income', 'transfer']);
  const shown = list.slice(0, 150);
  return `<ul class="cat-bills charge-list">${shown.map(({ t, amount, split }) => `<li data-tx="${t.id}">
      <div class="grow" style="min-width:0"><div class="ellipsis">${esc(t.payee)}${t.pending ? ' <span class="pill warn">Pending</span>' : ''}</div>
        <div class="muted small">${esc(shortDate(t.date))}${acct(t.accountId) ? ' · ' + esc(acct(t.accountId).name) : ''}${split ? ' · ✂️ part of a split' : ''}</div></div>
      <span class="num ${amount > 0 ? 'good' : ''}">${amount > 0 ? '+' : ''}${money(Math.abs(amount))}</span>
      ${split ? '' : `<select class="recat" data-recat="${t.id}" aria-label="Change category for ${esc(t.payee)}">${opts.map((o) => `<option value="${esc(o.value)}" ${o.value === c.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`}
    </li>`).join('')}</ul>
    <div class="sub" style="margin-top:4px">These add up to ${money(total)}${list.length > shown.length ? ` · showing the latest ${shown.length}` : ''}. Pick a new category to move a charge — the app can remember it for that store.</div>`;
}
const storeKey = (payee) => normPayee(payee).split(' ').filter(Boolean).slice(0, 2).join(' ');
function onRecategorize(sel) {
  const t = state.transactions.find((x) => x.id === sel.dataset.recat);
  const to = cat(sel.value);
  render(); // put the picker back until a choice is made
  if (!t || !to.id || t.categoryId === to.id) return;
  const key = storeKey(t.payee);
  const others = (k) => state.transactions.filter((x) => x !== t && !x.splits?.length && k && normPayee(x.payee).includes(k) && x.categoryId !== to.id);
  openSheet(`Move to ${to.emoji} ${to.name}`, `
    <div class="card small"><b>${esc(t.payee)}</b> · ${money(Math.abs(t.amount))} · ${esc(shortDate(t.date))}<br><span class="muted">Now in ${esc(cat(t.categoryId).emoji)} ${esc(cat(t.categoryId).name)}</span></div>
    <label class="field"><span>Remember for charges whose name contains</span><input data-key value="${esc(key)}"></label>
    <p class="small muted" data-others style="margin-top:-4px"></p>
    <button class="btn" data-mode="future">This charge + future ones from this store</button>
    <div class="btn-row"><button class="btn secondary" data-mode="all">Also move past charges from this store</button></div>
    <div class="btn-row"><button class="btn secondary" data-mode="one">Only this charge</button></div>`, (sheet) => {
    const keyInput = $('[data-key]', sheet), info = $('[data-others]', sheet);
    const showCount = () => {
      const n = others(normPayee(keyInput.value)).length;
      info.textContent = n ? `${n} other past charge${n === 1 ? '' : 's'} match “${normPayee(keyInput.value)}”.` : 'No other past charges match.';
      $('[data-mode="all"]', sheet).style.display = n ? '' : 'none';
    };
    showCount(); keyInput.addEventListener('input', showCount);
    sheet.addEventListener('click', (e) => {
      const mode = e.target.closest('[data-mode]')?.dataset.mode;
      if (!mode) return;
      const k = normPayee(keyInput.value);
      if (mode !== 'one' && k.length < 3) { toast('Type at least 3 letters of the store name'); return; }
      t.categoryId = to.id;
      let moved = 0;
      if (mode !== 'one') state.rules[k] = to.id;
      if (mode === 'all') for (const x of others(k)) { x.categoryId = to.id; moved++; }
      save(); closeSheet(); render();
      toast(mode === 'one' ? `Moved to ${to.name}` : `Moved${moved ? ` ${moved + 1} charges` : ''} — future “${k}” charges go to ${to.name}`);
    });
  });
}

// ---------- Home: everyday spending meter for this paycheck ----------
function currentPayPeriod(p) {
  const t0 = today();
  const days = paydays(p, addDays(t0, -45), addDays(t0, 45));
  const start = days.filter((d) => d <= t0).pop() || addDays(t0, -Math.round(365 / perYear(p)));
  const next = days.find((d) => d > t0) || addDays(start, Math.round(365 / perYear(p)));
  return { start, next };
}
/** Transactions that are bill payments (so they aren't counted as everyday spending). */
function billPaymentIds(from, to) {
  const ids = new Set();
  for (const r of state.recurrings) {
    for (let ym = monthOf(addDays(from, -10)); `${ym}-01` <= addDays(to, 10); ym = addMonths(ym, 1)) {
      for (const d of occurrencesInMonth(r, ym)) { const t = findPayment(r, d); if (t) ids.add(t.id); }
    }
  }
  state.transactions.forEach((t) => { if (t.recurringId) ids.add(t.id); });
  return ids;
}
/** Free (unplanned) spending: money out in categories that don't have a bill. Refunds, credits,
 *  transfers, income, bill payments, and anything in a category covered by a bill are left out. */
function everydayCharges(from, to) {
  const billIds = billPaymentIds(from, to), out = [];
  const billCats = new Set(state.recurrings.map((r) => r.categoryId));
  for (const t of state.transactions) {
    if (t.date < from || t.date > to || t.amount >= 0 || billIds.has(t.id) || isOwnMove(t.payee)) continue;
    const amt = parts(t).reduce((s, p) => s + (p.amount < 0 && cat(p.categoryId).kind === 'expense' && !billCats.has(p.categoryId) ? -p.amount : 0), 0);
    if (amt >= 0.005) out.push({ t, amount: round2(amt) });
  }
  return out.sort((a, b) => b.t.date.localeCompare(a.t.date));
}
function meterData() {
  const p = state.paycheck;
  if (!p?.amount) return null;
  let limit, cushion;
  if ((p.method || 'even') === 'even') { const e = buildEvenPlan(); if (!e) return null; limit = e.spending; cushion = Math.max(0, e.left); }
  else { const plan = buildPaycheckPlan(); const c = plan?.checks[0]; if (!c) return null; limit = c.spending; cushion = Math.max(0, c.left); }
  if (!(limit > 0)) return null;
  const { start, next } = currentPayPeriod(p);
  const charges = everydayCharges(start, addDays(next, -1));
  const spent = round2(charges.reduce((s, x) => s + x.amount, 0));
  return { limit, cushion, start, next, charges, spent, cap: limit + cushion, daysLeft: Math.max(0, daysFrom(today(), next)) };
}
function spendingMeterHTML() {
  const m = meterData();
  if (!m) return '';
  const { limit, cushion, start, next, charges, spent } = m;
  const cap = limit + cushion;
  const scale = Math.max(cap, spent) || 1;
  const zone = spent <= limit ? 'ok' : spent <= cap ? 'cushion' : 'over';
  const fillColor = zone === 'ok' ? 'var(--good)' : zone === 'cushion' ? 'var(--warn)' : 'var(--bad)';
  const daysLeft = Math.max(0, daysFrom(today(), next));
  const status = zone === 'ok' ? `<b class="good">${money(limit - spent)} left</b> to spend`
    : zone === 'cushion' ? `<b style="color:var(--warn)">Using your cushion</b> — ${money(cap - spent)} of ${money(cushion)} left`
    : `<b class="bad">Over by ${money(spent - cap)}</b>`;
  const open = !!state.ui.meterOpen;
  return `<div class="card meter-card">
    <button class="meter-head" data-metertoggle aria-expanded="${open}">
      <div class="spread"><span class="muted small">🛒 Everyday spending this paycheck</span><span class="chev ${open ? 'open' : ''}" aria-hidden="true">›</span></div>
      <div class="spread" style="align-items:baseline"><span class="mid" style="color:${fillColor}">${money(spent)}</span><span class="small muted">of ${money(limit)}${cushion ? ` + ${money(cushion)} cushion` : ''}</span></div>
      <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${cap}" aria-valuenow="${spent}" aria-label="Everyday spending">
        <i class="meter-cushion" style="left:${(limit / scale) * 100}%;width:${(cushion / scale) * 100}%"></i>
        <i class="meter-fill" style="width:${Math.min(100, (spent / scale) * 100)}%;background:${fillColor}"></i>
        <i class="meter-mark" style="left:${(limit / scale) * 100}%"></i>
      </div>
      <div class="spread small" style="margin-top:6px"><span>${status}</span><span class="muted" style="white-space:nowrap">resets ${esc(shortDate(next))}${daysLeft ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : ''}</span></div>
    </button>
    ${open ? (charges.length ? `<ul class="cat-bills charge-list">${charges.slice(0, 100).map(({ t, amount }) => `<li data-tx="${t.id}"><div class="grow" style="min-width:0"><div class="ellipsis">${esc(t.payee)}${t.pending ? ' <span class="pill warn">Pending</span>' : ''}</div><div class="muted small">${esc(shortDate(t.date))} · ${esc(t.splits?.length ? '✂️ split' : cat(t.categoryId).name)}</div></div><span class="num">${money(amount)}</span></li>`).join('')}</ul>
      <p class="small muted" style="margin:6px 0 0">Free spending since your payday on ${esc(shortDate(start))} — purchases in categories without a bill. Bills and their categories (like groceries, if you have a groceries bill), transfers, refunds and income aren’t included. Tap a charge to change its category.</p>`
      : `<p class="small muted" style="margin:8px 0 0">No everyday spending yet since your payday on ${esc(shortDate(start))}.</p>`) : ''}
  </div>`;
}

// ---------- Bills tab: which bills are paid this month ----------
function paidBillsDropdown(items) {
  const paid = items.filter((i) => i.paid).map((i) => ({ ...i, tx: findPayment(i.r, i.d) })).filter((i) => i.tx)
    .sort((a, b) => b.tx.date.localeCompare(a.tx.date));
  if (!items.length) return '';
  const open = !!state.ui.paidOpen;
  const total = paid.reduce((s, i) => s + Math.abs(i.tx.amount), 0);
  return `<button class="cat-bills-toggle" data-paidtoggle aria-expanded="${open}" style="margin-top:12px">✓ ${paid.length ? `See what’s paid (${paid.length})` : 'Nothing paid yet this month'} <span class="chev ${open ? 'open' : ''}" aria-hidden="true">›</span></button>
    ${open && paid.length ? `<ul class="cat-bills">${paid.map((i) => {
      const actual = Math.abs(i.tx.amount), diff = round2(actual - i.r.amount);
      return `<li data-rec="${i.r.id}" data-date="${i.d}"><span class="bill-emoji">${esc(i.r.emoji)}</span>
        <span class="grow">${esc(i.r.name)}<span class="muted"> · paid ${esc(shortDate(i.tx.date))}${Math.abs(diff) >= 1 ? ` · <span class="${diff > 0 ? 'bad' : 'good'}">${money(Math.abs(diff))} ${diff > 0 ? 'over' : 'under'} budget</span>` : ''}</span></span>
        <span class="num">${money(actual)}</span></li>`;
    }).join('')}</ul>
      <div class="spread small" style="margin-top:6px"><span class="muted">Total paid</span><b class="num">${money(total)}</b></div>` : ''}`;
}

// ---------- Export bill due dates to a calendar (.ics) ----------
function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function icsFold(line) {
  // Fold long lines at 70 characters (calendar files require short lines).
  const out = []; let rest = line;
  while ([...rest].length > 70) { const chars = [...rest]; out.push(chars.slice(0, 70).join('')); rest = ' ' + chars.slice(70).join(''); }
  out.push(rest); return out.join('\r\n');
}
function billRRule(r, start) {
  // Monthly rules follow the bill's own due day (a 31st bill stays "last day of the month" even if the next one is the 30th).
  const d = +(r.start || start).slice(8), wd = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][parseD(start).getDay()];
  if (r.freq === 'weekly') return `FREQ=WEEKLY;BYDAY=${wd}`;
  if (r.freq === 'biweekly') return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${wd}`;
  if (r.freq === 'yearly') return 'FREQ=YEARLY';
  const every = r.freq === 'quarterly' ? ';INTERVAL=3' : '';
  // Days 29-31: use that day, or the last day of shorter months.
  if (d === 31) return `FREQ=MONTHLY${every};BYMONTHDAY=-1`;
  if (d >= 29) return `FREQ=MONTHLY${every};BYMONTHDAY=${d},-1;BYSETPOS=1`;
  return `FREQ=MONTHLY${every};BYMONTHDAY=${d}`;
}
function buildBillsICS(bills, { amounts, remindDays }) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AMH Finance//Bills//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Bills'];
  for (const r of bills) {
    const start = nextDue(r) || r.start;
    const day = start.replace(/-/g, ''), next = addDays(start, 1).replace(/-/g, '');
    const title = `💵 ${r.name} due${amounts ? ` — ${r.variable ? 'about ' : ''}${money(r.amount)}` : ''}`;
    const desc = ['Bill reminder from AMH Finance.', r.autopay ? 'Paid automatically (autopay).' : '', acct(r.accountId) ? `Paid from ${acct(r.accountId).name}.` : ''].filter(Boolean).join(' ');
    L.push('BEGIN:VEVENT', `UID:amhfa-bill-${r.id}@amh-finance`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`,
      `RRULE:${billRRule(r, start)}`, `SUMMARY:${icsEscape(title)}`, `DESCRIPTION:${icsEscape(desc)}`, 'TRANSP:TRANSPARENT', 'CATEGORIES:Bills');
    if (remindDays > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(title)}`, `TRIGGER:-P${remindDays - 1 ? `${remindDays - 1}D` : ''}T15H`, 'END:VALARM'); // 9 am, N days before
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}
function openCalendarExport() {
  const bills = [...state.recurrings].sort((a, b) => String(nextDue(a)).localeCompare(String(nextDue(b))));
  openSheet('📅 Add bills to your calendar', `
    <p class="small muted" style="margin-top:0">Creates a calendar file with each bill as a repeating all-day event. Open it on your Mac and pick your <b>Family</b> calendar.</p>
    <label class="field check"><input type="checkbox" data-cal-amounts checked><span>Show amounts in the event names</span></label>
    <p class="small muted" style="margin:-6px 0 10px 30px">Everyone who shares the calendar will see them. Untick to show just “Rent due”.</p>
    <label class="field"><span>Reminder</span><select data-cal-remind>
      <option value="0">No reminder</option><option value="1">1 day before (9 am)</option><option value="2" selected>2 days before (9 am)</option><option value="3">3 days before (9 am)</option></select></label>
    <div class="spread small" style="margin:4px 0 6px"><b>Bills to include</b><button class="link" data-cal-all>Select all / none</button></div>
    <ul class="list card" style="padding:2px 14px;max-height:40vh;overflow:auto">${bills.map((r) => `<li style="cursor:default"><input type="checkbox" data-cal-bill="${r.id}" checked aria-label="${esc(r.name)}">
      <div class="grow"><div class="title ellipsis">${esc(r.emoji)} ${esc(r.name)}</div><div class="sub">${money(r.amount)} · ${esc(FREQ_LABEL[r.freq] || r.freq)} · next ${esc(shortDate(nextDue(r) || r.start))}</div></div></li>`).join('')}</ul>
    <button class="btn" data-cal-go>Download calendar file</button>`, (sheet) => {
    $('[data-cal-all]', sheet).addEventListener('click', () => {
      const boxes = $$('[data-cal-bill]', sheet), on = boxes.some((b) => !b.checked);
      boxes.forEach((b) => { b.checked = on; });
    });
    $('[data-cal-go]', sheet).addEventListener('click', () => {
      const picked = bills.filter((r) => $(`[data-cal-bill="${r.id}"]`, sheet).checked);
      if (!picked.length) { toast('Pick at least one bill'); return; }
      const ics = buildBillsICS(picked, { amounts: $('[data-cal-amounts]', sheet).checked, remindDays: +$('[data-cal-remind]', sheet).value });
      download('AMH-Finance-bills.ics', ics, 'text/calendar');
      closeSheet();
      openSheet('Almost done', `<ol class="small" style="padding-left:18px;line-height:1.6;margin-top:0">
        <li>Open your <b>Downloads</b> folder (or click the download in your browser).</li>
        <li>Double-click <b>AMH-Finance-bills.ics</b>. The Calendar app opens.</li>
        <li>When it asks which calendar, choose <b>Family</b> and click <b>OK</b>.</li></ol>
        <p class="small muted">${picked.length} bill${picked.length === 1 ? '' : 's'} added as repeating events. If you change a bill later, delete its old events in Calendar and export again.</p>
        <button class="btn" data-close>Done</button>`);
    });
  });
}

// ---------- Today: the morning brief ----------
function billsOn(date) {
  const out = [];
  for (const r of state.recurrings) for (const d of occurrencesInMonth(r, monthOf(date))) if (d === date) out.push({ r, d, paid: findPayment(r, d) });
  return out;
}
function todayFacts() {
  const t0 = today(), y = addDays(t0, -1);
  const billIds = billPaymentIds(addDays(t0, -40), addDays(t0, 10));
  const ytx = state.transactions.filter((t) => t.date === y);
  const spentY = ytx.filter((t) => t.amount < 0 && !isOwnMove(t.payee) && cat(t.categoryId).kind !== 'transfer');
  const billsY = spentY.filter((t) => billIds.has(t.id)), freeY = spentY.filter((t) => !billIds.has(t.id));
  const incomeY = ytx.filter((t) => t.amount > 0 && cat(t.categoryId).kind === 'income');
  const sum = (arr) => round2(arr.reduce((s, t) => s - t.amount, 0));
  const typical = round2(everydayCharges(addDays(t0, -30), addDays(t0, -1)).reduce((s, x) => s + x.amount, 0) / 30);
  const dueToday = billsOn(t0);
  const soon = [1, 2, 3].flatMap((n) => billsOn(addDays(t0, n)).filter((b) => !b.paid));
  const m = meterData();
  const checking = state.accounts.filter((a) => a.type === 'checking' && !a.hidden);
  const chkTotal = round2(checking.reduce((s, a) => s + accountBalance(a), 0));
  const chkAvail = checking.length && checking.every((a) => a.available != null) ? round2(checking.reduce((s, a) => s + a.available, 0)) : null;
  return { t0, y, spentY, billsY, freeY, incomeY, sum, typical, dueToday, soon, m, checking, chkTotal, chkAvail, alerts: computeAlerts().slice(0, 3) };
}
let briefBusy = false;
async function writeBrief(force) {
  const t0 = today();
  if (briefBusy || !localApi?.claude || (!force && state.briefs?.[t0])) return;
  briefBusy = true; if (state.ui.tab === 'today') render();
  const f = todayFacts();
  const facts = [
    `Yesterday (${f.y}): everyday spending ${money(f.sum(f.freeY))} on ${f.freeY.length} purchases (typical day ${money(f.typical)}); bills paid ${money(f.sum(f.billsY))}; money in ${money(f.incomeY.reduce((s, t) => s + t.amount, 0))}.`,
    `Bills due today: ${f.dueToday.map((b) => `${b.r.name} ${money(b.r.amount)}${b.paid ? ' (already paid)' : ''}`).join(', ') || 'none'}. Next 3 days: ${f.soon.map((b) => `${b.r.name} ${money(b.r.amount)} on ${b.d}`).join(', ') || 'none'}.`,
    f.m ? `This paycheck: ${money(f.m.spent)} of ${money(f.m.limit)} everyday budget used (+${money(f.m.cushion)} cushion), ${f.m.daysLeft} days until payday on ${f.m.next}.` : '',
    f.checking.length ? `Checking balance ${money(f.chkTotal)}${f.chkAvail != null ? `, available ${money(f.chkAvail)}` : ''}.` : '',
    f.alerts.length ? `Alerts: ${f.alerts.map((a) => a.text).join(' | ')}` : '',
  ].filter(Boolean).join('\n');
  const q = `Write my morning money brief for today (${t0}) in 3-5 short bullet points: how yesterday went, what's due today and soon, how much I can comfortably spend per day until payday, and anything I should watch. Friendly, plain, no headings. Today's facts:\n${facts}`;
  try {
    const res = await fetch('api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AMH': '1' }, body: JSON.stringify({ question: q, context: buildClaudeContext(), history: [] }) });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    state.briefs = Object.fromEntries(Object.entries({ ...(state.briefs || {}), [t0]: data.answer }).sort().slice(-7));
    save();
  } catch (e) { toast('Couldn’t write the brief: ' + e.message); }
  finally { briefBusy = false; if (state.ui.tab === 'today') render(); }
}
function viewToday() {
  const f = todayFacts();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const brief = state.briefs?.[f.t0];
  if (!brief && localApi?.claude && !briefBusy && !syncing) setTimeout(() => writeBrief(false), 0);
  const txLine = (t, extra = '') => `<li data-tx="${t.id}"><div class="grow" style="min-width:0"><div class="ellipsis">${esc(t.payee)}</div><div class="muted small">${esc(t.splits?.length ? '✂️ split' : cat(t.categoryId).name)}${extra}</div></div><span class="num ${t.amount > 0 ? 'good' : ''}">${t.amount > 0 ? '+' : ''}${money(Math.abs(t.amount))}</span></li>`;
  const billLine = (b, when) => `<li data-rec="${b.r.id}" data-date="${b.d}"><span class="bill-emoji">${esc(b.r.emoji)}</span><span class="grow">${esc(b.r.name)}<span class="muted"> · ${when}</span> ${b.paid ? '<span class="pill good">Paid</span>' : b.r.autopay ? '<span class="pill">Autopay</span>' : ''}</span><span class="num">${money(b.r.amount)}</span></li>`;
  const freeTotal = f.sum(f.freeY), dueTotal = f.dueToday.filter((b) => !b.paid).reduce((s, b) => s + b.r.amount, 0);
  const perDay = f.m && f.m.daysLeft ? Math.max(0, (f.m.limit - f.m.spent) / f.m.daysLeft) : null;
  return `${syncBar()}
    <div class="today-head"><div class="mid">${greet}!</div><div class="muted small">${esc(parseD(f.t0).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}</div></div>

    ${localApi?.claude || brief ? `<div class="card brief">
      <div class="spread"><span class="muted small">✨ Your brief</span>${localApi?.claude ? `<button class="link" data-a="rebrief" ${briefBusy ? 'disabled' : ''}>${briefBusy ? 'Writing…' : 'Refresh'}</button>` : ''}</div>
      ${brief ? `<div class="brief-text">${mdLite(brief)}</div>` : `<p class="small muted thinking-text">${briefBusy ? 'Writing your brief…' : 'Your brief will appear here.'}</p>`}
    </div>` : ''}

    <div class="card"><h2>Due today</h2>
      ${f.dueToday.length ? `<ul class="cat-bills" style="border:0;padding:0;margin:0">${f.dueToday.map((b) => billLine(b, 'today')).join('')}</ul>
        ${dueTotal ? `<div class="small" style="margin-top:6px">${money(dueTotal)} still to go out today${f.chkAvail != null || f.checking.length ? ` · checking after: <b class="${(f.chkAvail ?? f.chkTotal) - dueTotal >= 0 ? 'good' : 'bad'}">${money((f.chkAvail ?? f.chkTotal) - dueTotal)}</b>` : ''}</div>` : '<div class="small good" style="margin-top:6px">✓ Everything due today is paid.</div>'}`
        : '<p class="small muted" style="margin:0">No bills due today. 🎉</p>'}
      ${f.soon.length ? `<div class="small muted" style="margin:12px 0 2px">Next 3 days</div><ul class="cat-bills" style="border:0;padding:0;margin:0">${f.soon.map((b) => billLine(b, esc(dayLabel(b.d)))).join('')}</ul>` : ''}
    </div>

    <div class="card"><h2>Yesterday</h2>
      <div class="spread"><div><div class="mid">${money(freeTotal)}</div><div class="small muted">everyday spending${f.typical ? ` · typical day ${money(f.typical)}` : ''}</div></div>
        ${f.typical ? `<span class="pill ${freeTotal <= f.typical ? 'good' : 'warn'}">${freeTotal <= f.typical ? 'Below typical' : 'Above typical'}</span>` : ''}</div>
      ${f.freeY.length ? `<ul class="cat-bills charge-list" style="border:0;padding:0">${f.freeY.slice(0, 8).map((t) => txLine(t)).join('')}</ul>${f.freeY.length > 8 ? `<p class="small muted">+ ${f.freeY.length - 8} more in Activity</p>` : ''}` : '<p class="small muted">No everyday purchases yesterday.</p>'}
      ${f.billsY.length ? `<div class="small muted" style="margin:10px 0 2px">Bills paid · ${money(f.sum(f.billsY))}</div><ul class="cat-bills charge-list" style="border:0;padding:0">${f.billsY.map((t) => txLine(t)).join('')}</ul>` : ''}
      ${f.incomeY.length ? `<div class="small muted" style="margin:10px 0 2px">Money in</div><ul class="cat-bills charge-list" style="border:0;padding:0">${f.incomeY.map((t) => txLine(t)).join('')}</ul>` : ''}
    </div>

    ${f.m ? `<div class="card"><h2>This paycheck</h2>
      <div class="spread"><div><div class="mid ${f.m.spent > f.m.cap ? 'bad' : ''}">${money(Math.max(0, f.m.limit - f.m.spent))}</div><div class="small muted">left for everyday spending</div></div>
        ${perDay != null ? `<div style="text-align:right"><div class="mid">${money(perDay)}</div><div class="small muted">per day for ${f.m.daysLeft} day${f.m.daysLeft === 1 ? '' : 's'}</div></div>` : ''}</div>
      <div class="small muted" style="margin-top:6px">${money(f.m.spent)} of ${money(f.m.limit)} used${f.m.cushion ? ` · ${money(f.m.cushion)} cushion` : ''} · payday ${esc(shortDate(f.m.next))}</div>
    </div>` : ''}

    ${f.checking.length ? `<div class="card"><h2>Checking</h2><div class="mid">${money(f.chkTotal)}</div>${f.chkAvail != null && Math.abs(f.chkAvail - f.chkTotal) >= 0.01 ? `<div class="small muted">Available ${money(f.chkAvail)}</div>` : ''}</div>` : ''}

    ${f.alerts.length ? `<div class="card"><h2>Watch</h2><ul class="list">${f.alerts.map((a) => `<li ${a.attrs}><div class="emoji">${esc(a.icon)}</div><div class="grow small ${a.tone === 'bad' ? 'bad' : ''}">${esc(a.text)}</div></li>`).join('')}</ul></div>` : ''}`;
}

// ---------- One-time data updates ----------
function runMigrations() {
  const m = (state.migrations ||= {});
  if (!m.vaultMoves) {
    // Vault / own-account transfers aren't spending or bills: file them as Transfer and drop vault "bills".
    const tid = transferCatId();
    let moved = 0, removed = [];
    if (tid) state.transactions.forEach((t) => { if (t.categoryId !== tid && isOwnMove(t.payee) && !ruleFor(t.payee) && !t.splits?.length) { t.categoryId = tid; moved++; } });
    state.recurrings = state.recurrings.filter((r) => {
      const own = isOwnMove(`${r.name} ${r.match || ''}`);
      if (own) { removed.push(r.name); (state.ignoredBills ||= {})[r.match || billKey(r.name)] = 1; }
      return !own;
    });
    m.vaultMoves = true;
    save();
    if (moved || removed.length) setTimeout(() => toast(`Vault transfers are no longer counted as spending${removed.length ? ` · removed bill${removed.length > 1 ? 's' : ''}: ${removed.join(', ')}` : ''}`), 800);
  }
  if (!m.savingsByName) {
    state.accounts.forEach((a) => { if (a.type === 'checking' && /saving|vault/i.test(a.name || '')) a.type = 'savings'; });
    m.savingsByName = true;
    save();
  }
  if (!m.loansCategory) {
    // "Other" becomes "Loans"; a fresh "Other" stays as the catch-all for anything unrecognized.
    let loans = state.categories.find((c) => c.name === 'Loans');
    const other = state.categories.find((c) => c.name === 'Other');
    if (!loans && other) { other.name = 'Loans'; other.emoji = '🏦'; loans = other; }
    if (!loans) { loans = { id: uid(), name: 'Loans', emoji: '🏦', kind: 'expense', budget: 0 }; state.categories.push(loans); }
    if (!state.categories.some((c) => c.name === 'Other')) state.categories.push({ id: uid(), name: 'Other', emoji: '📦', kind: 'expense', budget: 0 });
    // Loan payments that were filed as transfers (and loan bills) move to Loans. Credit-card payments stay transfers.
    const transfer = state.categories.find((c) => c.name === 'Transfer');
    const isLoan = (text, pc = '') => (/^LOAN_PAYMENTS/.test(pc) && !/CREDIT_CARD/.test(pc)) || (LOAN_RE.test(normPayee(text) + ' ') && !CARD_PAYMENT_RE.test(normPayee(text)));
    if (transfer) {
      state.transactions.forEach((t) => { if (t.categoryId === transfer.id && t.amount < 0 && isLoan(t.payee, t.plaidCat)) t.categoryId = loans.id; });
      state.recurrings.forEach((r) => { if (r.categoryId === transfer.id && isLoan(`${r.name} ${r.match || ''}`)) r.categoryId = loans.id; });
    }
    m.loansCategory = true;
    save();
  }
}

// ---------- Paste a bill list ----------
// One bill per line:  Name | Amount | Repeats | Next due | Category | Paid from | Match words
// Amount may end in "varies". Next due: a date (2026-11-06), a day of the month (9, or "11, 27" for
// twice a month), or a weekday (Sunday). Lines starting with # are ignored.
const BILL_STOPWORDS = new Set(['loan', 'loans', 'payment', 'payments', 'pmt', 'bill', 'bills', 'city', 'county', 'of', 'the', 'and', 'auto',
  'insurance', 'monthly', 'service', 'services', 'finance', 'financial', 'school', 'inc', 'llc', 'co', 'company', 'apps', 'subscriptions', 'utility']);
const billTokens = (...texts) => new Set(texts.flatMap((x) => normPayee(x).split(' ')).filter((w) => w.length >= 3 && !BILL_STOPWORDS.has(w)));
function findDuplicateBill(b) {
  const mine = billTokens(b.name, b.match || '');
  return state.recurrings.find((r) => {
    const theirs = billTokens(r.name, r.match || '');
    if ([...mine].some((w) => theirs.has(w))) return true;
    return b.match && r.match && (b.match.includes(r.match) || r.match.includes(b.match));
  });
}
function nextDueFrom(spec, freq) {
  const t0 = today(), s = String(spec || '').trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return [s];
  const wd = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].findIndex((d) => s.startsWith(d.slice(0, 3)));
  if (wd >= 0) { const d = parseD(t0); d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7)); return [iso(d)]; }
  const days = (s.match(/\d{1,2}/g) || []).map(Number).filter((n) => n >= 1 && n <= 31);
  if (!days.length) return [t0];
  return days.slice(0, freq === 'monthly' ? 2 : 1).map((day) => {
    let ym = monthOf(t0), d = `${ym}-${pad(Math.min(day, daysInMonth(ym)))}`;
    if (d < t0) { ym = addMonths(ym, 1); d = `${ym}-${pad(Math.min(day, daysInMonth(ym)))}`; }
    return d;
  });
}
function parseBillList(text) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cols = (line.includes('|') ? line.split('|') : line.split(/\t/)).map((c) => c.trim());
    if (cols.length < 2 || /^name$/i.test(cols[0])) continue;
    const [name, amountText = '', repeatsText = 'monthly', dueText = '', catText = '', fromText = '', matchText = ''] = cols;
    const amount = Math.abs(parseMoney((amountText.match(/[\d,.]+/) || ['0'])[0]));
    if (!name || !amount) continue;
    const r = repeatsText.toLowerCase();
    const freq = /2 ?weeks|bi-?weekly|every other/.test(r) ? 'biweekly' : /week/.test(r) ? 'weekly' : /quarter|3 months/.test(r) ? 'quarterly' : /year|annual/.test(r) ? 'yearly' : 'monthly';
    const dues = nextDueFrom(dueText, freq);
    const account = fromText && state.accounts.find((a) => {
      const f = fromText.toLowerCase(), n = a.name.toLowerCase();
      return n.includes(f) || (/card|credit/.test(f) && a.type === 'credit') || (/check/.test(f) && a.type === 'checking');
    });
    const base = { name, amount: round2(amount / dues.length), freq, variable: /var|~|about/i.test(amountText), catText, accountId: account?.id || '',
      match: normPayee(matchText) };
    dues.forEach((start, i) => out.push({ ...base, start, name: dues.length > 1 ? `${name} (${ordinal(+start.slice(8))})` : name, key: `${name}#${i}` }));
  }
  return out;
}
function categoryFor(text, b) {
  if (text) {
    const found = state.categories.find((c) => c.name.toLowerCase() === text.toLowerCase());
    if (found) return found.id;
    const c = { id: uid(), name: text, emoji: /kid|school|child/i.test(text) ? '🧒' : '📦', kind: /transfer/i.test(text) ? 'transfer' : 'expense', budget: 0 };
    state.categories.push(c);
    return c.id;
  }
  return guessCategory(b.match || b.name);
}
function openPasteBills() {
  openSheet('Paste a bill list', `
    <p class="small muted" style="margin-top:0">One bill per line, like:<br><code>Car loan | 450.00 | monthly | 9 | Transfer | Checking | auto loan</code><br>
      Name | amount | repeats | next due (date, day of month, or weekday) | category | paid from | words to find the payment.</p>
    <textarea class="paste-box" rows="10" placeholder="Paste your list here"></textarea>
    <button class="btn" data-review>Review bills</button>
    <div data-review-out></div>`, (sheet) => {
    let items = [];
    const out = $('[data-review-out]', sheet);
    $('[data-review]', sheet).addEventListener('click', () => {
      items = parseBillList($('textarea', sheet).value).map((b) => ({ ...b, dup: findDuplicateBill(b) }));
      if (!items.length) { out.innerHTML = '<p class="small bad">No bills found. Use one line per bill with | between the parts.</p>'; return; }
      const newCount = items.filter((b) => !b.dup).length;
      out.innerHTML = `<div class="section-title">${items.length} bills found · ${items.length - newCount} look like ones you already have</div>
        <ul class="list card" style="padding:2px 14px">${items.map((b, i) => `<li style="cursor:default"><input type="checkbox" data-pick="${i}" ${b.dup ? '' : 'checked'} aria-label="Add ${esc(b.name)}">
          <div class="grow"><div class="title ellipsis">${esc(b.name)}</div>
          <div class="sub">${b.variable ? 'about ' : ''}${money(b.amount)} · ${esc(FREQ_LABEL[b.freq])} · next ${esc(shortDate(b.start))}${b.catText ? ' · ' + esc(b.catText) : ''}${b.accountId ? ' · ' + esc(acct(b.accountId).name) : ''}</div>
          ${b.dup ? `<div class="sub bad">Looks like you already have: ${esc(b.dup.name)} — left unchecked</div>` : ''}</div></li>`).join('')}</ul>
        <button class="btn" data-addpicked>Add checked bills</button>`;
      $('[data-addpicked]', out).addEventListener('click', () => {
        const picked = items.filter((_, i) => $(`[data-pick="${i}"]`, out).checked);
        for (const b of picked) {
          state.recurrings.push({ id: uid(), name: b.name, amount: b.amount, freq: b.freq, start: b.start, variable: b.variable,
            categoryId: categoryFor(b.catText, b), accountId: b.accountId, match: b.match,
            emoji: billEmoji(normPayee(b.name + ' ' + b.match), b.catText) });
        }
        save(); closeSheet(); render(); toast(`Added ${picked.length} bill${picked.length === 1 ? '' : 's'}`);
      });
    });
  });
}

function handleBillsClick(e) {
  if (e.target.closest('[data-upcomingtoggle]')) { state.ui.upcomingOpen = !state.ui.upcomingOpen; save(); render(); return true; }
  if (e.target.closest('[data-paidtoggle]')) { state.ui.paidOpen = !state.ui.paidOpen; save(); render(); return true; }
  if (e.target.closest('[data-monthtoggle]')) { state.ui.monthClosed = !state.ui.monthClosed; save(); render(); return true; }
  if (e.target.closest('[data-metertoggle]')) { state.ui.meterOpen = !state.ui.meterOpen; save(); render(); return true; }
  if (e.target.closest('[data-futuretoggle]')) { state.ui.futureOpen = !state.ui.futureOpen; save(); render(); return true; }
  if (e.target.closest('select.recat')) return true; // let the picker work without opening the budget
  const cc = e.target.closest('[data-catcharges]');
  if (cc) { const k = cc.dataset.catcharges; (state.ui.catChargesOpen ||= {})[k] = !state.ui.catChargesOpen[k]; save(); render(); return true; }
  const cb = e.target.closest('[data-catbills]');
  if (cb) { const k = cb.dataset.catbills; (state.ui.catBillsOpen ||= {})[k] = !state.ui.catBillsOpen[k]; save(); render(); return true; }
  const bg = e.target.closest('[data-bankgroup]');
  if (bg) { const k = bg.dataset.bankgroup; (state.ui.bankOpen ||= {})[k] = !state.ui.bankOpen[k]; save(); render(); return true; }
  const ms = e.target.closest('[data-method-seg] button');
  if (ms && state.paycheck) { state.paycheck.method = ms.dataset.v; save(); render(); return true; }
  const ig = e.target.closest('[data-ignoresugg]');
  if (ig) { (state.ignoredBills ||= {})[ig.dataset.ignoresugg] = 1; save(); render(); toast('Hidden — it won’t be suggested again'); return true; }
  const n = e.target.closest('[data-a]');
  if (n?.dataset.a === 'pastebills') { openPasteBills(); return true; }
  if (n?.dataset.a === 'rebrief') { writeBrief(true); return true; }
  if (n?.dataset.a === 'billcal') { openCalendarExport(); return true; }
  if (n?.dataset.a === 'coverbills') { coverBillsInBudgets(); return true; }
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
