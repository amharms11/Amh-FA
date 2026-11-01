/* Booking HQ — run a cleaning booking business from your phone.
   Plain JS, no server. Everything is saved in this browser's localStorage. */
'use strict';

// ---------- State ----------
const STORE_KEY = 'bookinghq-v1';
const SOURCES = ['Thumbtack', 'Google', 'Nextdoor', 'Facebook', 'Referral', 'Website', 'Other'];
const EXPENSE_CATS = ['Lead fees', 'Insurance', 'Software / AI tools', 'LLC & legal', 'Marketing', 'Supplies', 'Other'];
const ISSUE_KINDS = ['Missed spots', 'Late / no-show', 'Damage', 'Rude / unprofessional', 'Other'];
const RESOLUTIONS = ['Free re-clean', 'Partial refund', 'Full refund', 'Apology / credit', 'None needed'];

const DEFAULT_TEMPLATES = {
  quote: 'Hi {name}! Thanks for reaching out to {biz}. For a {beds} bed / {baths} bath {type}, your price is {price}{freqNote}. Our cleaners are background-checked, insured and bring all their own supplies.\n\nSee options and book here: {link}\n\nAny questions? Just reply here.',
  followup: 'Hi {name}, just checking in on your cleaning quote from {biz} ({price}). We still have openings this week. Want me to grab a spot for you? {link}',
  booked: 'You\'re booked, {name}! Your {type} is set for {date} at {time}. We\'ll text you the day before. Reply here anytime if anything changes.',
  dispatch: 'New job: {address}, {date} at {time}. {beds}bd/{baths}ba {type}{addons}. Your pay {pay}. First to reply YES gets it.',
  confirmCleaner: 'It\'s yours, {cleaner}! {address}, {date} at {time}. {beds}bd/{baths}ba {type}{addons}. Notes: {notes}\nPlease text me when you arrive and when you finish (with a few photos). Thank you!',
  filled: 'Thanks everyone, the {date} job has been taken. More coming soon!',
  reminder: 'Hi {name}, reminder from {biz}: your cleaning is tomorrow, {date} at {time}. {cleaner} will be there. Reply here if you need to reschedule.',
  review: 'Thanks for choosing {biz}, {name}! If {cleaner} did a great job, a quick review would mean a lot to us: {review}',
  complaint: 'I\'m really sorry about that, {name}. That\'s not the standard we hold ourselves to. I\'d like to make it right: we can send someone back to fix it at no charge. What day works for you?',
  reschedule: 'No problem, {name}! What day and time work better for you? We\'ll move your {date} cleaning.',
};

const DEFAULT_FAQS = [
  { q: 'What\'s the difference between standard and deep clean?', k: 'deep difference standard', a: 'A standard clean keeps a home that\'s already in decent shape fresh: dusting, vacuuming and mopping floors, wiping kitchen counters and appliance exteriors, and cleaning bathrooms (toilet, tub/shower, sink, mirrors).\n\nA deep clean covers all of that plus the built-up stuff: baseboards, door frames, light switches, ceiling fans, behind and under furniture we can move, scrubbing grout and soap scum, and detailed kitchen work. We recommend a deep clean for a first visit or if it\'s been 4+ weeks.' },
  { q: 'What\'s included in a standard clean?', k: 'include included what', a: 'Kitchen: counters, sink, stovetop, appliance exteriors, microwave inside, floors.\nBathrooms: toilet, tub/shower, sink, mirrors, floors.\nLiving areas & bedrooms: dusting reachable surfaces, making beds, vacuuming, mopping, emptying trash.\nInside the fridge, oven, cabinets and windows are add-ons.' },
  { q: 'Do I need to provide supplies?', k: 'supplies supply products vacuum bring equipment', a: 'Nope! Our cleaners bring their own supplies and equipment. If you prefer specific products (for example fragrance-free), just leave them out and let us know.' },
  { q: 'Are you insured?', k: 'insured insurance bonded licensed damage', a: 'Yes, we carry general liability insurance, and every cleaner is vetted before they join our team.' },
  { q: 'How long does a cleaning take?', k: 'long time hours take', a: 'Most standard cleans take 2–4 hours depending on the size of the home. Deep cleans and move-outs take longer, usually 4–6 hours.' },
  { q: 'Do I need to be home?', k: 'home there key lockbox present', a: 'Not at all. Many clients leave a key, lockbox or door code. Just let us know how to get in.' },
  { q: 'Do you clean homes with pets?', k: 'pet pets dog cat', a: 'Of course! Just let us know what pets you have so your cleaner is prepared. If a pet is nervous around visitors, we suggest keeping them in one room.' },
  { q: 'What\'s your cancellation policy?', k: 'cancel cancellation reschedule', a: 'You can cancel or reschedule for free with at least 24 hours\' notice. Cancellations within 24 hours have a {cancelFee} fee because your cleaner has already reserved that time.' },
  { q: 'How does payment work?', k: 'pay payment card charge cash venmo', a: 'You book and pay securely online with a card. Recurring cleans are charged after each visit. No cash needed, and tips for your cleaner are always appreciated but never expected.' },
  { q: 'Do you offer a recurring discount?', k: 'recurring weekly biweekly monthly discount regular', a: 'Yes! Regular cleans save you money on every visit: {freqDiscounts}. You can pause or cancel anytime.' },
  { q: 'What if I\'m not happy with the cleaning?', k: 'happy unhappy guarantee satisfied bad', a: 'Let us know within 24 hours and we\'ll send someone back to fix anything we missed at no charge.' },
];

const SETUP_STEPS = [
  ['llc', 'Form an LLC', 'Through your state\'s website, usually $50–300. Keeps business debts separate from you.'],
  ['ein', 'Get a free EIN from the IRS', 'irs.gov → Apply for an EIN. Needed for the bank account and 1099s.'],
  ['bank', 'Open a business bank account', 'Keep every payment and payout in one place.'],
  ['insurance', 'Buy general liability insurance', 'Required. Many cleaning policies are $30–60/month. A janitorial bond is a cheap extra.'],
  ['payments', 'Set up online payments', 'Stripe, Square or your booking tool. Paste your payment link in Settings.'],
  ['texting', 'Set up the AI texting / booking tool', 'Used to answer leads instantly. Paste your templates and FAQ from this app into it.'],
  ['pricing', 'Set your prices', 'More → Pricing. Check them against local competitors.'],
  ['agreement', 'Write your contractor + non-solicit agreement', 'More → Templates has a starting draft. Have a local attorney review it.'],
  ['cleaners', 'Recruit 3–5 cleaners', 'Indeed, Facebook groups, local cleaners who already work solo. Collect a W-9 and signed agreement from each.'],
  ['thumbtack', 'Create a Thumbtack profile', 'Fast first leads, but you pay per lead. Track each lead\'s cost here.'],
  ['gbp', 'Create a Google Business Profile', 'Free. Ask every happy client for a review.'],
  ['nextdoor', 'Post on Nextdoor', 'Free business page plus neighborhood posts.'],
  ['facebook', 'Join local Facebook groups', 'Free. Post offers and answer "looking for a cleaner" posts.'],
  ['quote', 'Test your quote link', 'Settings → copy the quote link and open it on your phone.'],
];

const NONSOLICIT = `INDEPENDENT CONTRACTOR & NON-SOLICITATION AGREEMENT (starting draft — have a local attorney review before use)

This agreement is between {biz} ("Company") and ____________________ ("Contractor").

1. Independent contractor. Contractor is an independent contractor, not an employee. Contractor chooses which jobs to accept, sets their own schedule, supplies their own tools, equipment and cleaning products, and is responsible for their own taxes. Company will issue a Form 1099 when required.

2. Pay. Contractor is paid the amount stated in each job offer for jobs they accept and complete. Payment is sent within ___ days after the job is completed.

3. Quality. Contractor will perform each job in a professional manner. If a customer reports a problem within 24 hours, Contractor will have the first opportunity to return and correct it at no extra charge.

4. Non-solicitation. During this agreement and for 12 months after it ends, Contractor will not directly or indirectly offer or provide cleaning services to any customer Contractor was introduced to through Company, other than through Company, and will not encourage any such customer to stop using Company.

5. Confidentiality. Contractor will keep customer names, addresses, door codes and other customer information private and use it only to perform jobs for Company.

6. Insurance & conduct. Contractor will follow customer instructions, respect customer property and report any damage to Company immediately.

7. Ending the agreement. Either party may end this agreement at any time with written notice. Sections 4 and 5 continue after it ends.

Company: ____________________   Date: ________
Contractor: __________________   Date: ________`;

function defaultState() {
  return {
    settings: {
      bizName: 'Sparkle Booking Co.', ownerName: '', bizPhone: '', area: '',
      paymentLink: '', reviewLink: '', quoteBaseUrl: '',
      cancelFee: 40, cleanerPct: 75, cardPct: 2.9, cardFixed: 0.30, goal: 2000, threshold1099: 2000,
      apiKey: '', pricing: JSON.parse(JSON.stringify(DEFAULT_PRICING)),
    },
    templates: { ...DEFAULT_TEMPLATES },
    faqs: DEFAULT_FAQS.map((f) => ({ ...f })),
    leads: [], clients: [], jobs: [], cleaners: [], issues: [], expenses: [], setup: {},
  };
}

let S = load();
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw), base = defaultState();
      return { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) }, templates: { ...base.templates, ...(d.templates || {}) } };
    }
  } catch (e) { console.warn('Could not load saved data', e); }
  return defaultState();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) { toast('Could not save. Is storage full or blocked?'); }
}

// ---------- Helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = fmtMoney;
const money0 = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return ymd(d); };
const fmtDate = (s) => s ? parseDate(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`; };
const monthLabel = (mk) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); };
const shiftMonth = (mk, n) => { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const digits = (p) => String(p || '').replace(/[^\d+]/g, '');
const smsHref = (phone, body) => `sms:${digits(phone)}?&body=${encodeURIComponent(body)}`;
const P = () => S.settings.pricing;
const typeLabel = (t) => (P().types[t] || P().types.standard).label.toLowerCase();
const freqLabel = (f) => (P().freqs[f] || P().freqs.once).label;
const addonText = (a) => (a && a.length ? ' + ' + a.map((x) => (P().addons[x] || { label: x }).label.toLowerCase()).join(', ') : '');
const byId = (list, id) => S[list].find((x) => x.id === id);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}
async function copy(text, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(what); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(what); }
}
function fill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k === 'notes' && !vars.notes ? 'none' : vars[k] !== undefined && vars[k] !== null ? vars[k] : m));
}

// ---------- Money math ----------
const cardFee = (price) => (price > 0 ? round2(price * S.settings.cardPct / 100 + Number(S.settings.cardFixed)) : 0);
const defaultPay = (price) => round2(price * S.settings.cleanerPct / 100);
function jobGross(j) { return round2(j.price - j.cleanerPay - cardFee(j.price)); }

function monthStats(mk) {
  const inM = (d) => d && d.startsWith(mk);
  const done = S.jobs.filter((j) => j.status === 'done' && inM(j.date));
  const booked = S.jobs.filter((j) => (j.status === 'open' || j.status === 'assigned') && inM(j.date));
  const revenue = sum(done, (j) => j.price);
  const pay = sum(done, (j) => j.cleanerPay);
  const fees = sum(done, (j) => cardFee(j.price));
  const leadCost = sum(S.leads.filter((l) => inM(l.created)), (l) => l.cost);
  const refunds = sum(S.issues.filter((i) => inM(i.date)), (i) => i.refund);
  const expenses = sum(S.expenses.filter((e) => inM(e.date)), (e) => e.amount);
  const net = round2(revenue - pay - fees - leadCost - refunds - expenses);
  const paidJobs = done.filter((j) => j.price > 0);
  const avgGross = paidJobs.length ? (revenue - pay - fees) / paidJobs.length : null;
  return { done, booked, revenue, pay, fees, leadCost, refunds, expenses, net, avgGross, bookedRevenue: sum(booked, (j) => j.price) };
}

function typicalGross() {
  // Average gross profit per paid job (all time), or an estimate from a 2 bed / 2 bath every-2-weeks clean.
  const paid = S.jobs.filter((j) => j.status === 'done' && j.price > 0);
  if (paid.length >= 3) return sum(paid, jobGross) / paid.length;
  const q = priceQuote({ beds: 2, baths: 2, type: 'standard', freq: 'biweekly' }, P());
  return q.total - defaultPay(q.total) - cardFee(q.total);
}

function cleanerYTD(cid, year = new Date().getFullYear()) {
  return sum(S.jobs.filter((j) => j.cleanerId === cid && j.status === 'done' && j.date.startsWith(String(year))), (j) => j.cleanerPay);
}
function cleanerRating(cid) {
  const r = S.jobs.filter((j) => j.cleanerId === cid && j.rating);
  return r.length ? sum(r, (j) => j.rating) / r.length : null;
}
const cleanerReady = (c) => c.active && c.agreement && c.w9;

// ---------- Quote link ----------
function quoteBase() {
  if (S.settings.quoteBaseUrl) return S.settings.quoteBaseUrl.replace(/\/?$/, '/') + 'quote.html';
  return new URL('quote.html', location.href.split('#')[0]).href;
}
function quoteLink(lead) {
  const s = S.settings;
  const data = {
    n: s.bizName, ph: s.bizPhone, pay: s.paymentLink, ar: s.area, cf: s.cancelFee, pr: s.pricing,
    l: lead ? { name: lead.name, beds: lead.beds, baths: lead.baths, type: lead.type, freq: lead.freq, addons: lead.addons || [] } : null,
  };
  return quoteBase() + '#d=' + encodeQuoteData(data);
}

// ---------- Message variables ----------
function vars({ lead, client, job } = {}) {
  const s = S.settings;
  const who = lead || client || (job && byId('clients', job.clientId)) || {};
  const c = job ? byId('cleaners', job.cleanerId) : null;
  const src = job || who;
  const q = priceQuote(src, P());
  const price = job ? job.price : (who.price || q.total);
  const freq = src.freq || who.freq;
  return {
    biz: s.bizName, owner: s.ownerName, name: (who.name || '').split(' ')[0] || 'there',
    beds: src.beds ?? who.beds, baths: src.baths ?? who.baths, type: typeLabel(src.type || who.type),
    freq: freqLabel(freq), freqNote: freq && freq !== 'once' && (src.type || who.type) === 'standard' ? ` per visit (${freqLabel(freq).toLowerCase()}, includes ${money(P().freqs[freq].discount)} off for recurring)` : '',
    price: money(price), link: quoteLink(lead || who), addons: addonText(src.addons || who.addons),
    address: (job && job.address) || who.address || '(address)', date: job ? fmtDate(job.date) : undefined, time: job ? fmtTime(job.time) : undefined,
    pay: job ? money(job.cleanerPay) : undefined, cleaner: c ? c.name.split(' ')[0] : 'your cleaner',
    notes: (job && job.notes) || who.notes || '', review: s.reviewLink || '(review link)', cancelFee: money(s.cancelFee),
    freqDiscounts: Object.entries(P().freqs).filter(([k]) => k !== 'once').map(([, f]) => `${f.label.toLowerCase()} ${money(f.discount)} off`).join(', '),
  };
}
const msg = (key, ctx) => fill(S.templates[key] || '', vars(ctx));

// ---------- Router ----------
let route = { tab: 'home', sub: null };
let ui = { month: today().slice(0, 7), leadFilter: 'new', jobFilter: 'upcoming', srcPeriod: 'all' };
const TITLES = { home: 'Home', leads: 'Leads', jobs: 'Jobs', cleaners: 'Cleaners', more: 'More',
  clients: 'Clients', sources: 'Lead sources', issues: 'Complaints', expenses: 'Expenses', setup: 'Startup checklist',
  templates: 'Messages & FAQ', pricing: 'Pricing', settings: 'Settings', data: 'Backup & data' };

function go(tab, sub = null) {
  route = { tab, sub };
  const h = '#' + tab + (sub ? '/' + sub : '');
  if (location.hash !== h) history.replaceState(null, '', h);
  render();
  window.scrollTo(0, 0);
}
function readHash() {
  const [tab, sub] = location.hash.slice(1).split('/');
  route = { tab: ['home', 'leads', 'jobs', 'cleaners', 'more'].includes(tab) ? tab : 'home', sub: sub || null };
}

function render() {
  const key = route.sub || route.tab;
  $('#pageTitle').textContent = TITLES[key] || 'Booking HQ';
  $('#backBtn').classList.toggle('ghost', !route.sub);
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === route.tab));
  const views = { home: viewHome, leads: viewLeads, jobs: viewJobs, cleaners: viewCleaners, more: viewMore,
    clients: viewClients, sources: viewSources, issues: viewIssues, expenses: viewExpenses, setup: viewSetup,
    templates: viewTemplates, pricing: viewPricing, settings: viewSettings, data: viewData };
  $('#view').innerHTML = (views[key] || viewHome)();
  updateBadges();
}
function updateBadges() {
  const counts = { leads: S.leads.filter((l) => l.status === 'new').length, jobs: unclaimedSoon().length };
  $$('.tabbar button').forEach((b) => {
    b.querySelector('.badge')?.remove();
    const n = counts[b.dataset.tab];
    if (n) b.insertAdjacentHTML('beforeend', `<span class="badge">${n}</span>`);
  });
}
const unclaimedSoon = () => S.jobs.filter((j) => j.status === 'open' && j.date <= addDays(today(), 7));

// ---------- Views ----------
function viewHome() {
  if (!S.leads.length && !S.jobs.length && !S.cleaners.length) return welcome();
  const st = monthStats(ui.month);
  const goal = Number(S.settings.goal) || 0;
  const pct = goal ? Math.max(0, Math.min(100, (st.net / goal) * 100)) : 0;
  const per = st.avgGross ?? typicalGross();
  const overhead = st.leadCost + st.expenses + st.refunds;
  const jobsNeeded = per > 0 ? Math.ceil((goal + overhead) / per) : 0;
  const t = today();

  const attention = [];
  const newLeads = S.leads.filter((l) => l.status === 'new');
  if (newLeads.length) attention.push(row('💬', `${newLeads.length} new lead${newLeads.length > 1 ? 's' : ''} to answer`, 'Reply fast. The first business to answer usually wins.', 'go', 'leads'));
  const unc = unclaimedSoon();
  if (unc.length) attention.push(row('📣', `${unc.length} job${unc.length > 1 ? 's' : ''} not claimed yet`, unc.slice(0, 2).map((j) => fmtDate(j.date)).join(', ') + ' — send to your cleaners', 'go', 'jobs', 'data-filter="unclaimed"'));
  const stale = S.jobs.filter((j) => j.status === 'assigned' && j.date < t);
  if (stale.length) attention.push(row('✅', `${stale.length} past job${stale.length > 1 ? 's' : ''} to mark done`, 'Marking done schedules the next recurring clean', 'go', 'jobs', 'data-filter="upcoming"'));
  const tomorrow = S.jobs.filter((j) => j.status === 'assigned' && j.date === addDays(t, 1) && !j.reminded);
  tomorrow.forEach((j) => attention.push(row('⏰', `Remind ${esc(byId('clients', j.clientId)?.name || 'client')} about tomorrow`, `${fmtTime(j.time)} · send the reminder text`, 'job', j.id)));
  const unpaid = S.jobs.filter((j) => j.status === 'done' && !j.customerPaid && j.price > 0);
  if (unpaid.length) attention.push(row('💳', `${unpaid.length} job${unpaid.length > 1 ? 's' : ''} not marked paid by customer`, money(sum(unpaid, (j) => j.price)) + ' outstanding', 'go', 'jobs', 'data-filter="done"'));
  const openIssues = S.issues.filter((i) => !i.resolved);
  if (openIssues.length) attention.push(row('⚠️', `${openIssues.length} open complaint${openIssues.length > 1 ? 's' : ''}`, 'The customer blames you, so fix these first', 'go', 'more', 'data-sub="issues"'));
  const notReady = S.cleaners.filter((c) => c.active && !(c.agreement && c.w9));
  if (notReady.length) attention.push(row('📝', `${notReady.length} cleaner${notReady.length > 1 ? 's' : ''} missing paperwork`, 'Get a signed non-solicit agreement and W-9', 'go', 'cleaners'));

  const upcoming = S.jobs.filter((j) => (j.status === 'open' || j.status === 'assigned') && j.date >= t && j.date <= addDays(t, 7)).sort(byDate);

  const owed = {};
  S.jobs.filter((j) => j.status === 'done' && !j.cleanerPaid && j.cleanerId && j.cleanerPay > 0).forEach((j) => { owed[j.cleanerId] = (owed[j.cleanerId] || 0) + j.cleanerPay; });

  const recurring = S.clients.filter((c) => c.active && c.freq !== 'once');
  const mrr = sum(recurring, (c) => c.price * (30.4 / (P().freqs[c.freq]?.days || 30)));
  const mrrGross = sum(recurring, (c) => (c.price - defaultPay(c.price) - cardFee(c.price)) * (30.4 / (P().freqs[c.freq]?.days || 30)));

  return `
  <div class="month-nav"><button data-act="month" data-n="-1" aria-label="Previous month">‹</button><b>${monthLabel(ui.month)}</b><button data-act="month" data-n="1" aria-label="Next month">›</button></div>
  <div class="card">
    <h2>Your profit <span class="muted">${st.done.length} jobs done</span></h2>
    <div class="big ${st.net < 0 ? 'bad' : ''}">${money(st.net)}</div>
    ${goal ? `<div class="bar"><i style="width:${pct}%"></i></div>
    <div class="spread small muted" style="margin-top:6px"><span>${Math.round(pct)}% of ${money0(goal)} goal</span><span>${st.bookedRevenue ? money(st.bookedRevenue) + ' more booked' : ''}</span></div>
    <p class="small muted" style="margin:10px 0 0">At ${money(per)} kept per job${st.avgGross == null ? ' (estimate)' : ''}, reaching ${money0(goal)} takes about <b>${jobsNeeded} jobs</b> this month after costs.</p>` : ''}
  </div>
  ${attention.length ? `<div class="card alert"><h2>Needs you</h2><ul class="list">${attention.join('')}</ul></div>` : ''}
  <div class="card">
    <h2>Where the money went</h2>
    <table class="ledger">
      <tr><td>Customers paid</td><td>${money(st.revenue)}</td></tr>
      <tr><td>Cleaner pay</td><td>−${money(st.pay)}</td></tr>
      <tr><td>Card fees</td><td>−${money(st.fees)}</td></tr>
      <tr><td>Lead costs</td><td>−${money(st.leadCost)}</td></tr>
      ${st.refunds ? `<tr><td>Refunds</td><td>−${money(st.refunds)}</td></tr>` : ''}
      <tr><td>Other expenses</td><td>−${money(st.expenses)}</td></tr>
      <tr class="total"><td>You keep</td><td>${money(st.net)}</td></tr>
    </table>
  </div>
  <div class="card">
    <h2>Next 7 days <button class="link" data-act="go" data-tab="jobs">All jobs</button></h2>
    ${upcoming.length ? `<ul class="list">${upcoming.map(jobRow).join('')}</ul>` : '<div class="empty small">Nothing scheduled this week.</div>'}
  </div>
  <div class="card">
    <h2>Recurring clients</h2>
    <div class="stats">
      <div class="stat"><div class="l">Active</div><div class="v">${recurring.length}</div></div>
      <div class="stat"><div class="l">Kept per month</div><div class="v">${money(mrrGross)}</div></div>
    </div>
    <p class="small muted" style="margin:10px 0 0">≈ ${money(mrr)}/month in bookings. Recurring clients are how you hit your goal: you pay for the lead once.</p>
  </div>
  ${Object.keys(owed).length ? `<div class="card"><h2>Owed to cleaners</h2><ul class="list">${Object.entries(owed).map(([cid, amt]) => {
    const c = byId('cleaners', cid);
    return `<li class="static"><div class="emoji">🧽</div><div class="grow"><div class="title">${esc(c?.name || 'Unknown')}</div></div><b class="num">${money(amt)}</b><button class="btn small secondary" data-act="payCleaner" data-id="${cid}">Mark paid</button></li>`;
  }).join('')}</ul></div>` : ''}`;
}

function welcome() {
  return `<div class="card" style="text-align:center;padding:28px 18px">
    <img src="icons/icon.svg" alt="" width="72" height="72" style="border-radius:18px" />
    <h2 style="justify-content:center;font-size:22px;text-transform:none;letter-spacing:0;color:var(--text);margin:14px 0 6px">Booking HQ</h2>
    <p class="muted" style="margin:0 0 18px">Your command center for a cleaning booking business: answer leads, send quotes, text jobs to your cleaners, and see what you keep from every job.</p>
    <div class="btn-row" style="flex-direction:column">
      <button class="btn" data-act="go" data-tab="more" data-sub="settings">1. Add your business info</button>
      <button class="btn secondary" data-act="newCleaner">2. Add your first cleaner</button>
      <button class="btn secondary" data-act="newLead">3. Add a lead</button>
      <button class="btn secondary" data-act="go" data-tab="more" data-sub="setup">See the startup checklist</button>
      <button class="link" style="margin-top:6px" data-act="sample">Or explore with sample data</button>
    </div>
  </div>
  <div class="card"><h2>How it works</h2>
    <ul class="list">
      ${row('💬', 'A lead comes in', 'Log it with its lead cost. The app writes the reply and a quote link.', 'noop')}
      ${row('💳', 'They book and pay online', 'Convert the lead into a client and a job.', 'noop')}
      ${row('📣', 'Text the job to your cleaners', '"New job … your pay $112.50. First to reply gets it."', 'noop')}
      ${row('💰', 'You keep the spread', 'About 25% before lead and card fees. The Home tab tracks it.', 'noop')}
    </ul></div>`;
}

function row(emoji, title, sub, act, id, extra = '') {
  return `<li data-act="${act}" ${act === 'go' ? `data-tab="${id}"` : `data-id="${id || ''}"`} ${extra}><div class="emoji">${emoji}</div><div class="grow"><div class="title">${title}</div><div class="sub">${sub}</div></div></li>`;
}
const byDate = (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''));

const JOB_STATUS = { open: ['Unclaimed', 'warn'], assigned: ['Assigned', ''], done: ['Done', 'good'], cancelled: ['Cancelled', 'gray'] };
function jobRow(j) {
  const c = byId('clients', j.clientId), cl = byId('cleaners', j.cleanerId);
  const [label, cls] = JOB_STATUS[j.status];
  return `<li data-act="job" data-id="${j.id}"><div class="emoji">${j.type === 'deep' ? '🧼' : j.type === 'move' ? '📦' : '🧹'}</div>
    <div class="grow"><div class="title ellipsis">${esc(c?.name || 'Client')} · ${fmtDate(j.date)}</div>
    <div class="sub ellipsis">${fmtTime(j.time)} · ${j.beds}bd/${j.baths}ba ${typeLabel(j.type)}${cl ? ' · ' + esc(cl.name) : ''}</div></div>
    <div style="text-align:right"><div class="num">${money(j.price)}</div><span class="pill ${cls}">${label}</span></div></li>`;
}

const LEAD_STATUS = { new: ['New', 'bad'], quoted: ['Quoted', 'warn'], booked: ['Booked', 'good'], lost: ['Lost', 'gray'] };
function viewLeads() {
  const f = ui.leadFilter;
  const list = S.leads.filter((l) => f === 'all' || l.status === f).sort((a, b) => b.created.localeCompare(a.created));
  const counts = Object.fromEntries(Object.keys(LEAD_STATUS).map((k) => [k, S.leads.filter((l) => l.status === k).length]));
  const mk = today().slice(0, 7);
  const spend = sum(S.leads.filter((l) => l.created.startsWith(mk)), (l) => l.cost);
  return `
  <div class="segmented">${[...Object.keys(LEAD_STATUS), 'all'].map((k) => `<button class="${f === k ? 'on' : ''}" data-act="leadFilter" data-f="${k}">${k === 'all' ? 'All' : LEAD_STATUS[k][0]}${k !== 'all' && counts[k] ? ' ' + counts[k] : ''}</button>`).join('')}</div>
  <div class="card">
    ${list.length ? `<ul class="list">${list.map((l) => {
      const q = priceQuote(l, P()); const [lab, cls] = LEAD_STATUS[l.status];
      return `<li data-act="lead" data-id="${l.id}"><div class="emoji">${l.status === 'new' ? '💬' : l.status === 'booked' ? '🎉' : '👤'}</div>
        <div class="grow"><div class="title ellipsis">${esc(l.name)}</div><div class="sub ellipsis">${esc(l.source)} · ${l.beds}bd/${l.baths}ba ${typeLabel(l.type)} · ${fmtDate(l.created)}</div></div>
        <div style="text-align:right"><div class="num">${money(q.total)}</div><span class="pill ${cls}">${lab}</span></div></li>`;
    }).join('')}</ul>` : `<div class="empty"><div class="e">💬</div>No ${f === 'all' ? '' : LEAD_STATUS[f][0].toLowerCase() + ' '}leads.<br><button class="btn small" style="margin-top:12px" data-act="newLead">Add a lead</button></div>`}
  </div>
  <p class="small muted" style="text-align:center">Lead spend this month: <b>${money(spend)}</b> · <button class="link" data-act="go" data-tab="more" data-sub="sources">Which sources pay off?</button></p>`;
}

function viewJobs() {
  const f = ui.jobFilter, t = today();
  let list = S.jobs;
  if (f === 'upcoming') list = list.filter((j) => j.status === 'open' || j.status === 'assigned');
  if (f === 'unclaimed') list = list.filter((j) => j.status === 'open');
  if (f === 'done') list = list.filter((j) => j.status === 'done');
  list = [...list].sort(byDate);
  if (f === 'done' || f === 'all') list.reverse();
  const groups = {};
  list.forEach((j) => { const k = f === 'done' || f === 'all' ? monthLabel(j.date.slice(0, 7)) : (j.date < t ? 'Past due' : j.date === t ? 'Today' : j.date === addDays(t, 1) ? 'Tomorrow' : fmtDate(j.date)); (groups[k] = groups[k] || []).push(j); });
  return `
  <div class="segmented">${[['upcoming', 'Upcoming'], ['unclaimed', 'Unclaimed'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-act="jobFilter" data-f="${k}">${l}</button>`).join('')}</div>
  ${list.length ? Object.entries(groups).map(([g, js]) => `<div class="section-title">${g}</div><div class="card" style="padding:4px 14px"><ul class="list">${js.map(jobRow).join('')}</ul></div>`).join('')
    : `<div class="card"><div class="empty"><div class="e">📅</div>No jobs here.<br><button class="btn small" style="margin-top:12px" data-act="newJob">Schedule a job</button></div></div>`}`;
}

function viewCleaners() {
  const list = [...S.cleaners].sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
  return `
  <div class="card">
    ${list.length ? `<ul class="list">${list.map((c) => {
      const r = cleanerRating(c.id), jobs = S.jobs.filter((j) => j.cleanerId === c.id && j.status === 'done').length;
      const badge = !c.active ? '<span class="pill gray">Inactive</span>' : cleanerReady(c) ? '<span class="pill good">Ready</span>' : '<span class="pill warn">Paperwork</span>';
      return `<li data-act="cleaner" data-id="${c.id}"><div class="emoji">🧽</div><div class="grow"><div class="title ellipsis">${esc(c.name)}</div>
        <div class="sub">${jobs} jobs${r ? ' · ★ ' + r.toFixed(1) : ''} · ${money(cleanerYTD(c.id))} this year</div></div>${badge}</li>`;
    }).join('')}</ul>` : `<div class="empty"><div class="e">🧽</div>No cleaners yet.<br><button class="btn small" style="margin-top:12px" data-act="newCleaner">Add a cleaner</button></div>`}
  </div>
  <div class="card"><h2>Keep it legal</h2>
    <p class="small" style="margin:0">Cleaners should be <b>1099 independent contractors</b>: they choose which jobs to take, set their own schedule and bring their own tools and supplies. Before their first job, get a signed <b>contractor + non-solicit agreement</b> and a <b>W-9</b>. You'll file a 1099-NEC for anyone you pay ${money(S.settings.threshold1099)} or more in a year (confirm the current threshold with your tax preparer).</p>
    <div class="btn-row"><button class="btn secondary small" data-act="go" data-tab="more" data-sub="templates">Agreement template</button></div>
  </div>`;
}

function viewMore() {
  const items = [
    ['clients', '🏠', 'Clients', `${S.clients.filter((c) => c.active).length} active`],
    ['sources', '📊', 'Lead sources', 'Which sources make money'],
    ['issues', '⚠️', 'Complaints', `${S.issues.filter((i) => !i.resolved).length} open`],
    ['expenses', '🧾', 'Expenses', 'Insurance, tools, ads'],
    ['setup', '✅', 'Startup checklist', `${SETUP_STEPS.filter(([k]) => S.setup[k]).length} of ${SETUP_STEPS.length} done`],
    ['templates', '✉️', 'Messages & FAQ', 'Texts, answers, agreement'],
    ['pricing', '🏷️', 'Pricing', 'Rates, discounts, add-ons'],
    ['settings', '⚙️', 'Settings', 'Business info, links, AI'],
    ['data', '💾', 'Backup & data', 'Export, import, reset'],
  ];
  return `<div class="card" style="padding:4px 14px"><ul class="list">${items.map(([k, e, t, s]) => `<li data-act="go" data-tab="more" data-sub="${k}"><div class="emoji">${e}</div><div class="grow"><div class="title">${t}</div><div class="sub">${s}</div></div><span class="muted">›</span></li>`).join('')}</ul></div>
  <div class="card"><h2>Your quote link</h2><p class="small muted" style="margin:0 0 10px">Customers pick options, see the price and book. Put it in your Thumbtack replies, Google profile and Facebook posts.</p>
    <div class="btn-row"><button class="btn small" data-act="copyQuote">Copy link</button><a class="btn small secondary" href="${esc(quoteLink(null))}" target="_blank" rel="noopener">Open</a></div></div>`;
}

function viewClients() {
  const list = [...S.clients].sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
  return `<div class="card">${list.length ? `<ul class="list">${list.map((c) => {
    const done = S.jobs.filter((j) => j.clientId === c.id && j.status === 'done');
    return `<li data-act="client" data-id="${c.id}"><div class="emoji">🏠</div><div class="grow"><div class="title ellipsis">${esc(c.name)}</div>
      <div class="sub ellipsis">${freqLabel(c.freq)} · ${money(c.price)} · ${done.length} cleans · ${money(sum(done, (j) => j.price))} lifetime</div></div>
      ${c.active ? (c.freq !== 'once' ? '<span class="pill good">Recurring</span>' : '') : '<span class="pill gray">Inactive</span>'}</li>`;
  }).join('')}</ul>` : '<div class="empty"><div class="e">🏠</div>Clients appear here when you book a lead.</div>'}</div>`;
}

function viewSources() {
  const p = ui.srcPeriod, mk = today().slice(0, 7);
  const inP = (d) => p === 'all' || (d && d.startsWith(mk));
  const rows = SOURCES.map((s) => {
    const leads = S.leads.filter((l) => l.source === s && inP(l.created));
    const spend = sum(leads, (l) => l.cost) + sum(S.expenses.filter((e) => e.source === s && inP(e.date)), (e) => e.amount);
    const booked = leads.filter((l) => l.status === 'booked').length;
    const clientIds = new Set(S.clients.filter((c) => c.source === s).map((c) => c.id));
    const jobs = S.jobs.filter((j) => clientIds.has(j.clientId) && j.status === 'done' && inP(j.date));
    const kept = sum(jobs, jobGross);
    return { s, n: leads.length, spend, booked, conv: leads.length ? booked / leads.length : 0, cpb: booked ? spend / booked : null, kept, roi: kept - spend };
  }).filter((r) => r.n || r.spend || r.kept);
  return `<div class="segmented"><button class="${p === 'month' ? 'on' : ''}" data-act="srcPeriod" data-f="month">This month</button><button class="${p === 'all' ? 'on' : ''}" data-act="srcPeriod" data-f="all">All time</button></div>
  <div class="card">${rows.length ? `<div class="scroll-x"><table class="rtable"><tr><th>Source</th><th>Leads</th><th>Booked</th><th>Spent</th><th>Per booking</th><th>Kept</th></tr>
    ${rows.map((r) => `<tr><td>${r.s}</td><td>${r.n}</td><td>${r.booked} <span class="muted">(${Math.round(r.conv * 100)}%)</span></td><td>${money(r.spend)}</td><td>${r.cpb == null ? '—' : money(r.cpb)}</td><td class="${r.roi < 0 ? 'bad' : 'good'}">${money(r.kept)}</td></tr>`).join('')}</table></div>
    <p class="small muted" style="margin:10px 0 0">"Kept" is what you made from those clients' completed jobs after cleaner pay and card fees. A paid source is worth it when Kept grows past Spent. Free sources (Google, Nextdoor, Facebook, referrals) usually win long term.</p>`
    : '<div class="empty">Add leads with their source and cost to see this.</div>'}</div>`;
}

function viewIssues() {
  const list = [...S.issues].sort((a, b) => (a.resolved - b.resolved) || b.date.localeCompare(a.date));
  return `<div class="card">${list.length ? `<ul class="list">${list.map((i) => {
    const j = byId('jobs', i.jobId), c = j && byId('clients', j.clientId), cl = j && byId('cleaners', j.cleanerId);
    return `<li data-act="issue" data-id="${i.id}"><div class="emoji">${i.resolved ? '✔️' : '⚠️'}</div><div class="grow"><div class="title ellipsis">${esc(i.kind)} · ${esc(c?.name || '')}</div>
      <div class="sub ellipsis">${fmtDate(i.date)}${cl ? ' · ' + esc(cl.name) : ''} · ${esc(i.resolution)}${i.refund ? ' · ' + money(i.refund) + ' refund' : ''}</div></div>
      <span class="pill ${i.resolved ? 'good' : 'bad'}">${i.resolved ? 'Resolved' : 'Open'}</span></li>`;
  }).join('')}</ul>` : '<div class="empty"><div class="e">🎉</div>No complaints. Log one from a job when it happens.</div>'}</div>
  <div class="card"><h2>Quality control tips</h2><p class="small" style="margin:0">Ask cleaners for before/after photos on every job. Text each client after their first clean. Offer a free re-clean within 24 hours, which usually costs less than a refund. Stop sending jobs to cleaners who get repeat complaints.</p></div>`;
}

function viewExpenses() {
  const list = [...S.expenses].sort((a, b) => b.date.localeCompare(a.date));
  const mk = today().slice(0, 7);
  return `<div class="card"><h2>This month <b class="num" style="color:var(--text)">${money(sum(list.filter((e) => e.date.startsWith(mk)), (e) => e.amount))}</b></h2>
  ${list.length ? `<ul class="list">${list.map((e) => `<li data-act="expense" data-id="${e.id}"><div class="emoji">🧾</div><div class="grow"><div class="title ellipsis">${esc(e.note || e.category)}</div><div class="sub">${fmtDate(e.date)} · ${esc(e.category)}${e.source ? ' · ' + esc(e.source) : ''}</div></div><b class="num">${money(e.amount)}</b></li>`).join('')}</ul>`
    : '<div class="empty">No expenses yet. Add insurance, your texting tool, ads, etc. Per-lead fees go on each lead instead.</div>'}
  <button class="btn" style="margin-top:10px" data-act="newExpense">Add expense</button></div>`;
}

function viewSetup() {
  const done = SETUP_STEPS.filter(([k]) => S.setup[k]).length;
  return `<div class="card"><h2>Startup checklist <span class="muted">${done}/${SETUP_STEPS.length}</span></h2>
    <div class="bar" style="margin:0 0 10px"><i style="width:${(done / SETUP_STEPS.length) * 100}%"></i></div>
    ${SETUP_STEPS.map(([k, t, d]) => `<label class="check-item ${S.setup[k] ? 'done' : ''}"><input type="checkbox" data-act="setup" data-id="${k}" ${S.setup[k] ? 'checked' : ''}/><div><div class="title">${t}</div><div class="sub">${d}</div></div></label>`).join('')}
  </div>
  <div class="card"><h2>Realistic numbers</h2><p class="small" style="margin:0">Startup: $300–1,000 (LLC, insurance, tools, first leads). Expect about $20–30 net per job after lead and card fees, so $2,000/month takes roughly 70–100 jobs. Plan on 8–10 hours a week at first, mostly complaints and reschedules.</p></div>`;
}

function viewTemplates() {
  const labels = { quote: 'Quote reply to a new lead', followup: 'Follow-up (no reply yet)', booked: 'Booking confirmation to customer', dispatch: 'Job offer to cleaners', confirmCleaner: 'Job confirmation to the cleaner who claimed it', filled: 'Job filled (to other cleaners)', reminder: 'Day-before reminder to customer', review: 'Review request', complaint: 'Complaint response', reschedule: 'Reschedule reply' };
  return `<div class="card"><h2>Text templates</h2><p class="small muted" style="margin:0 0 6px">Placeholders like {name}, {price}, {link}, {date}, {time}, {address}, {pay}, {cleaner} are filled in automatically. Paste these into your AI texting tool too.</p>
    <ul class="list">${Object.keys(DEFAULT_TEMPLATES).map((k) => `<li data-act="editTemplate" data-id="${k}"><div class="grow"><div class="title">${labels[k]}</div><div class="sub ellipsis">${esc(S.templates[k])}</div></div><span class="muted">›</span></li>`).join('')}</ul></div>
  <div class="card"><h2>FAQ answers <button class="link" data-act="copyFaq">Copy all</button></h2>
    ${S.faqs.map((f, i) => `<details class="faq"><summary>${esc(f.q)}</summary><p>${esc(faqAnswer(f))}</p><div class="btn-row" style="margin-top:4px"><button class="btn small secondary" data-act="copyOneFaq" data-id="${i}">Copy</button><button class="btn small secondary" data-act="editFaq" data-id="${i}">Edit</button></div></details>`).join('')}
    <button class="btn secondary" style="margin-top:10px" data-act="editFaq" data-id="new">Add a question</button></div>
  <div class="card"><h2>Contractor + non-solicit agreement</h2><p class="small muted" style="margin:0 0 10px">A plain-language starting draft. Laws differ by state (some limit non-solicits), so have a local attorney review it before cleaners sign.</p>
    <div class="btn-row"><button class="btn small" data-act="copyAgreement">Copy agreement</button><button class="btn small secondary" data-act="viewAgreement">Read it</button></div></div>`;
}
const faqAnswer = (f) => fill(f.a, vars());

function viewPricing() {
  const p = P();
  const ex = priceQuote({ beds: 2, baths: 2, type: 'standard', freq: 'biweekly' }, p);
  return `<form id="pricingForm">
  <div class="card"><h2>Example: 2 bed / 2 bath, every 2 weeks</h2>
    <table class="ledger"><tr><td>Customer pays</td><td>${money(ex.total)}</td></tr><tr><td>Cleaner gets (${S.settings.cleanerPct}%)</td><td>${money(defaultPay(ex.total))}</td></tr><tr><td>Card fee</td><td>${money(cardFee(ex.total))}</td></tr><tr class="total"><td>You keep before lead cost</td><td>${money(ex.total - defaultPay(ex.total) - cardFee(ex.total))}</td></tr></table></div>
  <div class="card"><h2>Base price</h2><div class="grid3">
    ${numField('base', 'Starting price', p.base)}${numField('perBed', 'Per bedroom', p.perBed)}${numField('perBath', 'Per bathroom', p.perBath)}</div>
    <div class="grid3">${Object.entries(p.types).map(([k, t]) => numField('mult_' + k, t.label + ' ×', t.mult, '0.05')).join('')}</div></div>
  <div class="card"><h2>Recurring discount (per visit, standard cleans)</h2><div class="grid3">
    ${Object.entries(p.freqs).filter(([k]) => k !== 'once').map(([k, f]) => numField('disc_' + k, f.label + ' $ off', f.discount)).join('')}</div></div>
  <div class="card"><h2>Add-ons</h2><div class="grid2">${Object.entries(p.addons).map(([k, a]) => numField('addon_' + k, a.label, a.price)).join('')}</div></div>
  <div class="card"><h2>Your cut</h2><div class="grid3">
    ${numField('cleanerPct', 'Cleaner gets %', S.settings.cleanerPct)}${numField('cardPct', 'Card fee %', S.settings.cardPct, '0.01')}${numField('cardFixed', 'Card fee $', S.settings.cardFixed, '0.01')}</div>
    ${numField('cancelFee', 'Late-cancellation fee', S.settings.cancelFee)}</div>
  <button class="btn" type="submit">Save prices</button>
  <button class="btn danger" type="button" style="margin-top:10px" data-act="resetPricing">Reset to defaults</button>
  </form>`;
}
const numField = (name, label, val, step = '1') => `<label class="field"><span>${label}</span><input name="${name}" type="number" inputmode="decimal" step="${step}" min="0" value="${esc(val)}"/></label>`;
const textField = (name, label, val, type = 'text', attrs = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(val ?? '')}" ${attrs}/></label>`;
const selectField = (name, label, opts, val) => `<label class="field"><span>${label}</span><select name="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const checkField = (name, label, on) => `<label class="field check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}/><span>${label}</span></label>`;

function viewSettings() {
  const s = S.settings;
  return `<form id="settingsForm">
  <div class="card"><h2>Business</h2>
    ${textField('bizName', 'Business name', s.bizName)}${textField('ownerName', 'Your name', s.ownerName)}
    ${textField('bizPhone', 'Business phone / text number', s.bizPhone, 'tel')}${textField('area', 'Service area', s.area, 'text', 'placeholder="e.g. Austin & Round Rock"')}</div>
  <div class="card"><h2>Links</h2>
    ${textField('paymentLink', 'Online booking / payment link', s.paymentLink, 'url', 'placeholder="https://buy.stripe.com/…"')}
    ${textField('reviewLink', 'Google review link', s.reviewLink, 'url', 'placeholder="https://g.page/r/…/review"')}
    ${textField('quoteBaseUrl', 'Where this app is hosted (for quote links)', s.quoteBaseUrl, 'url', `placeholder="${esc(location.href.split('#')[0].replace(/index\.html$/, ''))}"`)}
    <p class="small muted" style="margin:-4px 0 0">Leave blank to use this page's address. Quote links only work for customers if the app is on a public HTTPS host (for example GitHub Pages).</p></div>
  <div class="card"><h2>Goals & taxes</h2><div class="grid2">
    ${numField('goal', 'Monthly profit goal', s.goal)}${numField('threshold1099', '1099-NEC threshold', s.threshold1099)}</div></div>
  <div class="card"><h2>AI reply drafts (optional)</h2>
    <p class="small muted" style="margin:0 0 10px">Add an Anthropic API key to have Claude draft replies to customer questions using your prices and FAQ. Without a key, the app matches the question to your FAQ instead. The key stays in this browser, and the lead's message plus your business info are sent to Anthropic when you tap Draft.</p>
    ${textField('apiKey', 'Anthropic API key', s.apiKey, 'password', 'autocomplete="off" placeholder="sk-ant-…"')}</div>
  <button class="btn" type="submit">Save settings</button></form>`;
}

function viewData() {
  return `<div class="card"><h2>Backup</h2><p class="small muted" style="margin:0 0 10px">Your data lives only in this browser on this device. Back it up regularly.</p>
    <div class="btn-row"><button class="btn small" data-act="export">Download backup</button><label class="btn small secondary">Restore backup<input type="file" accept=".json,application/json" id="importFile" hidden/></label></div></div>
  <div class="card"><h2>Spreadsheet</h2><div class="btn-row"><button class="btn small secondary" data-act="exportCsv">Download jobs CSV</button></div></div>
  <div class="card"><h2>Start over</h2><div class="btn-row"><button class="btn small secondary" data-act="sample">Load sample data</button><button class="btn small danger" data-act="reset">Erase everything</button></div></div>`;
}

// ---------- Sheets ----------
function openSheet(title, body, onMount) {
  $('#sheetRoot').innerHTML = `<div class="sheet-backdrop" data-act="closeSheetBg"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="grab"></div><h3><span>${title}</span><button class="close-x" data-act="closeSheet" aria-label="Close">✕</button></h3>${body}</div></div>`;
  document.body.style.overflow = 'hidden';
  if (onMount) onMount($('#sheetRoot .sheet'));
}
function closeSheet() { $('#sheetRoot').innerHTML = ''; document.body.style.overflow = ''; }
function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') { if (el.dataset.multi) { (o[el.name] = o[el.name] || []); if (el.checked) o[el.name].push(el.value); } else o[el.name] = el.checked; }
    else if (el.type === 'number') o[el.name] = el.value === '' ? 0 : Number(el.value);
    else o[el.name] = el.value.trim();
  }
  return o;
}
const smsBtn = (phone, body, label = 'Text') => phone ? `<a class="btn small" href="${esc(smsHref(phone, body))}">${label}</a>` : '';
function msgBlock(title, text, phone, extraAttr = '') {
  return `<div class="section-title">${title}</div><div class="msg-box">${esc(text)}</div>
  <div class="btn-row"><button type="button" class="btn small secondary" data-act="copyText" data-text="${esc(text)}" ${extraAttr}>Copy</button>${phone ? `<a class="btn small" href="${esc(smsHref(phone, text))}" data-act="markOnly" ${extraAttr}>Text</a>` : ''}</div>`;
}

function homeFields(o) {
  const p = P();
  return `<div class="grid3">
    ${numField('beds', 'Bedrooms', o.beds ?? 2)}${numField('baths', 'Bathrooms', o.baths ?? 2, '0.5')}
    ${selectField('type', 'Clean', Object.entries(p.types).map(([k, t]) => [k, t.label]), o.type || 'standard')}</div>
    ${selectField('freq', 'How often', Object.entries(p.freqs).map(([k, f]) => [k, f.label + (f.discount ? ` (−${money(f.discount)})` : '')]), o.freq || 'once')}
    <div class="field"><span>Add-ons</span><div class="chips">${Object.entries(p.addons).map(([k, a]) => `<label class="chip"><input type="checkbox" name="addons" data-multi="1" value="${k}" ${(o.addons || []).includes(k) ? 'checked' : ''} style="margin:0 6px 0 0"/>${a.label} +${money(a.price)}</label>`).join('')}</div></div>`;
}
function liveQuote(sheet, target) {
  const f = $('form', sheet), out = $(target, sheet);
  const upd = () => { const d = formData(f); const q = priceQuote(d, P()); out.innerHTML = quoteSummary(q); };
  f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
}
function quoteSummary(q) {
  return `<table class="ledger"><tr><td>${P().types[q.type].label}, ${q.beds} bed / ${q.baths} bath</td><td>${money(q.clean)}</td></tr>
    ${q.addons ? `<tr><td>Add-ons</td><td>+${money(q.addons)}</td></tr>` : ''}${q.discount ? `<tr><td>${freqLabel(q.freq)} discount</td><td>−${money(q.discount)}</td></tr>` : ''}
    <tr class="total"><td>Customer pays</td><td>${money(q.total)}</td></tr>
    <tr><td class="muted">Cleaner ${money(defaultPay(q.total))} · card fee ${money(cardFee(q.total))}</td><td class="good">You keep ${money(q.total - defaultPay(q.total) - cardFee(q.total))}</td></tr></table>`;
}

// Lead
function leadForm(l = {}) {
  const isNew = !l.id;
  openSheet(isNew ? 'New lead' : 'Edit lead', `<form id="f">
    <div class="grid2">${textField('name', 'Name', l.name, 'text', 'required')}${textField('phone', 'Phone', l.phone, 'tel')}</div>
    ${textField('address', 'Address (optional)', l.address)}
    <div class="grid2">${selectField('source', 'Source', SOURCES.map((s) => [s, s]), l.source || 'Thumbtack')}${numField('cost', 'Lead cost $', l.cost ?? 0, '0.01')}</div>
    ${homeFields(l)}
    <div class="card" id="q" style="padding:12px"></div>
    <label class="field"><span>Notes / their message</span><textarea name="notes">${esc(l.notes || '')}</textarea></label>
    <button class="btn" type="submit">${isNew ? 'Save lead' : 'Save'}</button>
    ${isNew ? '' : `<button class="btn danger" type="button" style="margin-top:10px" data-act="deleteLead" data-id="${l.id}">Delete lead</button>`}
  </form>`, (sh) => {
    liveQuote(sh, '#q');
    $('form', sh).onsubmit = (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (isNew) { const lead = { id: uid(), status: 'new', created: today(), ...d }; S.leads.push(lead); save(); render(); leadDetail(lead.id); }
      else { Object.assign(l, d); save(); render(); leadDetail(l.id); }
    };
  });
}

function leadDetail(id) {
  const l = byId('leads', id); if (!l) return;
  const q = priceQuote(l, P());
  const reply = msg('quote', { lead: l });
  openSheet(esc(l.name), `
    <div class="row" style="margin-bottom:10px;flex-wrap:wrap;gap:6px"><span class="pill ${LEAD_STATUS[l.status][1]}">${LEAD_STATUS[l.status][0]}</span><span class="pill gray">${esc(l.source)}${l.cost ? ' · ' + money(l.cost) : ''}</span><span class="pill gray">${fmtDate(l.created)}</span>${l.phone ? `<a class="pill" href="tel:${esc(digits(l.phone))}">📞 ${esc(l.phone)}</a>` : ''}</div>
    <div class="card" style="padding:12px">${quoteSummary(q)}</div>
    ${l.notes ? `<div class="section-title">Their message</div><div class="msg-box">${esc(l.notes)}</div>` : ''}
    ${msgBlock('Your reply with quote link', reply, l.phone, `data-mark="quoted" data-id="${l.id}"`)}
    <div class="section-title">Answer a question</div>
    <label class="field"><textarea id="askQ" placeholder="Paste what the customer asked, e.g. what's the difference between standard and deep clean?">${esc(l.lastQ || '')}</textarea></label>
    <button class="btn secondary" data-act="draft" data-id="${l.id}">✨ Draft a reply</button>
    <div id="draftOut"></div>
    ${l.status === 'quoted' ? msgBlock('Follow-up if they go quiet', msg('followup', { lead: l }), l.phone) : ''}
    <div class="btn-row" style="margin-top:18px">
      ${l.status !== 'booked' ? `<button class="btn" data-act="bookLead" data-id="${l.id}">🎉 They booked</button>` : `<button class="btn secondary" data-act="client" data-id="${l.clientId}">Open client</button>`}
      ${l.status !== 'lost' && l.status !== 'booked' ? `<button class="btn secondary" data-act="leadStatus" data-id="${l.id}" data-s="lost">Mark lost</button>` : ''}
      ${l.status === 'lost' ? `<button class="btn secondary" data-act="leadStatus" data-id="${l.id}" data-s="quoted">Reopen</button>` : ''}
      <button class="btn secondary" data-act="editLead" data-id="${l.id}">Edit</button>
    </div>`);
}

function faqMatch(text) {
  const t = text.toLowerCase();
  return S.faqs.map((f) => ({ f, score: (f.k || f.q).toLowerCase().split(/\s+/).filter((w) => w.length > 2 && t.includes(w)).length })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 2).map((x) => x.f);
}

async function draftReply(l, question) {
  const v = vars({ lead: l });
  if (!S.settings.apiKey) {
    const hits = faqMatch(question);
    if (!hits.length) return { text: `Hi ${v.name}! Great question. ${S.settings.ownerName ? S.settings.ownerName + ' here, ' : ''}let me check and get right back to you.\n\nIn the meantime, your price for a ${v.beds} bed / ${v.baths} bath ${v.type} is ${v.price}. Book here: ${v.link}`, note: 'No FAQ matched. Add an API key in Settings for AI drafts, or add this question to your FAQ.' };
    return { text: `Hi ${v.name}! ${hits.map(faqAnswer).join('\n\n')}\n\nYour price for a ${v.beds} bed / ${v.baths} bath ${v.type} is ${v.price}. Book here: ${v.link}`, note: 'Built from your FAQ. Add an API key in Settings for AI drafts.' };
  }
  const p = P();
  const system = `You write SMS replies for ${S.settings.bizName}, a home cleaning booking business${S.settings.area ? ' serving ' + S.settings.area : ''}. Reply as the business, warm and brief (under 90 words), plain text, no markdown. Answer the customer's question using only the facts below; if the facts don't cover it, say you'll check and get back to them. Never invent prices, availability or policies. End by inviting them to book with their quote link.

PRICING: starts at ${money(p.base)} + ${money(p.perBed)} per bedroom + ${money(p.perBath)} per bathroom for a standard clean. ${Object.values(p.types).map((t) => `${t.label} ×${t.mult}`).join(', ')}. Recurring discounts per visit (standard cleans): ${v.freqDiscounts}. Add-ons: ${Object.values(p.addons).map((a) => `${a.label} ${money(a.price)}`).join(', ')}.

FAQ:
${S.faqs.map((f) => `Q: ${f.q}\nA: ${faqAnswer(f)}`).join('\n\n')}`;
  const content = `Customer: ${l.name}. Home: ${l.beds} bed / ${l.baths} bath. Wants: ${v.type}, ${v.freq.toLowerCase()}${v.addons}. Their quoted price: ${v.price}. Quote link: ${v.link}

Customer's message:
${question}`;
  const { default: Anthropic } = await import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.65.0/+esm');
  const client = new Anthropic({ apiKey: S.settings.apiKey, dangerouslyAllowBrowser: true });
  const res = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 2000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content }],
  });
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to write this reply. Try rephrasing.');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!text) throw new Error('Claude returned an empty reply.');
  return { text, note: 'Drafted by Claude. Read it before sending.' };
}

// Booking a lead
function bookForm(l) {
  const q = priceQuote(l, P());
  openSheet('Book ' + esc(l.name), `<form id="f">
    ${textField('address', 'Address', l.address, 'text', 'required')}
    <div class="grid2">${textField('date', 'First clean', addDays(today(), 2), 'date', 'required')}${textField('time', 'Time', '09:00', 'time', 'required')}</div>
    ${homeFields({ ...l, freq: q.freq })}
    <div class="grid2">${numField('price', 'Price', q.total, '0.01')}${numField('cleanerPay', 'Cleaner pay', defaultPay(q.total), '0.01')}</div>
    <p class="small muted" style="margin:-4px 0 10px" id="payHint"></p>
    ${checkField('customerPaid', 'Customer already paid online', true)}
    <label class="field"><span>Notes for the cleaner (entry, pets, focus areas)</span><textarea name="notes"></textarea></label>
    <button class="btn" type="submit">Create client & job</button></form>`, (sh) => {
    const f = $('form', sh);
    let manual = false;
    f.price.addEventListener('input', () => { manual = true; });
    f.cleanerPay.addEventListener('input', () => { manual = true; });
    const upd = (e) => {
      if (e && ['beds', 'baths', 'type', 'freq', 'addons'].includes(e.target.name) && !manual) { const t = priceQuote(formData(f), P()).total; f.price.value = t; f.cleanerPay.value = defaultPay(t); }
      const pr = Number(f.price.value) || 0, pay = Number(f.cleanerPay.value) || 0;
      const fd = formData(f), lt = fd.freq !== 'once' && fd.type === 'deep' ? priceQuote({ ...fd, type: 'standard', addons: [] }, P()).total : null;
      $('#payHint', sh).textContent = (lt ? `After this deep clean, ${freqLabel(fd.freq).toLowerCase()} visits are standard cleans at ${money(lt)}. ` : '') + `You keep ${money(pr - pay - cardFee(pr))} after the ${money(cardFee(pr))} card fee${l.cost ? `, ${money(pr - pay - cardFee(pr) - l.cost)} after this lead's cost` : ''}.`;
    };
    f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = formData(f);
      const freq = d.type === 'move' ? 'once' : d.freq;
      // A first deep clean followed by recurring visits: later visits are standard cleans at the recurring price.
      const later = freq !== 'once' && d.type !== 'standard' ? priceQuote({ ...d, type: 'standard', addons: [] }, P()) : null;
      const client = { id: uid(), name: l.name, phone: l.phone, address: d.address, source: l.source, leadId: l.id, beds: d.beds, baths: d.baths, type: later ? 'standard' : d.type, freq, addons: later ? [] : d.addons, price: later ? later.total : d.price, notes: d.notes, active: true, since: today() };
      S.clients.push(client);
      const job = newJobFor(client, d.date, d.time, { type: d.type, addons: d.addons, price: d.price, cleanerPay: d.cleanerPay, customerPaid: d.customerPaid, notes: d.notes });
      if (later) toast(`Booked! Visits after this ${typeLabel(d.type)} are standard cleans at ${money(later.total)}.`);
      Object.assign(l, { status: 'booked', clientId: client.id, address: d.address });
      save(); render(); jobDetail(job.id, true);
      if (!later) toast('Booked! Now send it to your cleaners.');
    };
  });
}

function newJobFor(client, date, time, extra = {}) {
  const job = { id: uid(), clientId: client.id, date, time, address: client.address, beds: client.beds, baths: client.baths, type: client.type, freq: client.freq, addons: client.addons || [], price: client.price, cleanerPay: defaultPay(client.price), status: 'open', cleanerId: null, customerPaid: false, cleanerPaid: false, notes: client.notes || '', ...extra };
  S.jobs.push(job);
  return job;
}

// Job
function jobDetail(id, justBooked = false) {
  const j = byId('jobs', id); if (!j) return;
  const c = byId('clients', j.clientId) || {}, cl = byId('cleaners', j.cleanerId);
  const ready = S.cleaners.filter(cleanerReady);
  const others = S.cleaners.filter((x) => x.active && !cleanerReady(x));
  const [lab, cls] = JOB_STATUS[j.status];
  let actions = '';
  if (j.status === 'open') {
    const offer = msg('dispatch', { job: j });
    actions = `${justBooked ? msgBlock('Confirmation to customer', msg('booked', { job: j }), c.phone) : ''}
      ${msgBlock('Job offer to your cleaners', offer, null)}
      <div class="btn-row" style="margin-top:6px"><button class="btn small secondary" data-act="copyNumbers">Copy all cleaner numbers</button></div>
      ${ready.length ? `<ul class="list" style="margin-top:6px">${ready.map((x) => `<li class="static"><div class="grow"><div class="title">${esc(x.name)}</div><div class="sub">${S.jobs.filter((y) => y.cleanerId === x.id && y.date === j.date && y.status !== 'cancelled').length ? 'Already has a job that day · ' : ''}${cleanerRating(x.id) ? '★ ' + cleanerRating(x.id).toFixed(1) : 'New'}</div></div>${smsBtn(x.phone, offer)}</li>`).join('')}</ul>`
        : '<p class="small warn">No cleaners are ready yet. Add one, with a signed agreement and W-9, on the Cleaners tab.</p>'}
      ${others.length ? `<p class="small muted">Not shown until paperwork is in: ${others.map((x) => esc(x.name)).join(', ')}</p>` : ''}
      <div class="section-title">Who claimed it?</div>
      <div class="chips">${S.cleaners.filter((x) => x.active).map((x) => `<button class="chip" data-act="assign" data-id="${j.id}" data-c="${x.id}">${esc(x.name)}</button>`).join('') || '<span class="small muted">Add cleaners first.</span>'}</div>`;
  } else if (j.status === 'assigned') {
    const notify = S.cleaners.filter((x) => x.active && x.id !== j.cleanerId);
    actions = `${msgBlock('Confirm with ' + esc(cl?.name || 'cleaner'), msg('confirmCleaner', { job: j }), cl?.phone)}
      ${notify.length ? msgBlock('Tell the others it\'s taken', msg('filled', { job: j }), null) : ''}
      ${msgBlock('Day-before reminder to customer', msg('reminder', { job: j }), c.phone, `data-mark="reminded" data-id="${j.id}"`)}
      <div class="btn-row"><button class="btn" data-act="doneJob" data-id="${j.id}">✅ Mark done</button><button class="btn secondary" data-act="unassign" data-id="${j.id}">Re-offer</button></div>`;
  } else if (j.status === 'done') {
    actions = `<div class="section-title">How did it go?</div><div class="stars">${[1, 2, 3, 4, 5].map((n) => `<button class="${(j.rating || 0) >= n ? 'on' : ''}" data-act="rate" data-id="${j.id}" data-n="${n}" aria-label="${n} stars">★</button>`).join('')}</div>
      ${checkFieldAct('customerPaid', 'Customer paid', j)}${checkFieldAct('cleanerPaid', `Cleaner paid ${money(j.cleanerPay)}`, j)}
      ${msgBlock('Ask for a review', msg('review', { job: j }), c.phone)}
      <div class="btn-row"><button class="btn secondary" data-act="newIssue" data-id="${j.id}">⚠️ Log a complaint</button></div>`;
  }
  openSheet(`${esc(c.name || 'Job')} · ${fmtDate(j.date)}`, `
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:10px"><span class="pill ${cls}">${lab}</span><span class="pill gray">${fmtTime(j.time)}</span><span class="pill gray">${freqLabel(j.freq)}</span>${cl ? `<span class="pill">🧽 ${esc(cl.name)}</span>` : ''}${c.phone ? `<a class="pill" href="tel:${esc(digits(c.phone))}">📞 Client</a>` : ''}</div>
    <div class="card" style="padding:12px"><table class="ledger">
      <tr><td>${esc(j.address || '')}</td><td></td></tr>
      <tr><td>${j.beds} bed / ${j.baths} bath ${typeLabel(j.type)}${addonText(j.addons)}</td><td></td></tr>
      <tr><td>Customer pays</td><td>${money(j.price)}</td></tr><tr><td>Cleaner pay</td><td>−${money(j.cleanerPay)}</td></tr><tr><td>Card fee</td><td>−${money(cardFee(j.price))}</td></tr>
      <tr class="total"><td>You keep</td><td>${money(jobGross(j))}</td></tr></table>
      ${j.notes ? `<p class="small" style="margin:10px 0 0"><b>Notes:</b> ${esc(j.notes)}</p>` : ''}</div>
    ${actions}
    <div class="btn-row" style="margin-top:18px">
      <button class="btn secondary small" data-act="editJob" data-id="${j.id}">Edit</button>
      ${c.phone ? `<button class="btn secondary small" data-act="copyText" data-text="${esc(msg('reschedule', { job: j }))}">Copy reschedule reply</button>` : ''}
      ${j.status !== 'cancelled' && j.status !== 'done' ? `<button class="btn danger small" data-act="cancelJob" data-id="${j.id}">Cancel job</button>` : ''}
      ${j.status === 'cancelled' ? `<button class="btn danger small" data-act="deleteJob" data-id="${j.id}">Delete</button>` : ''}
    </div>`);
}
const checkFieldAct = (k, label, j) => `<label class="field check" style="margin-top:10px"><input type="checkbox" data-act="toggleJob" data-id="${j.id}" data-k="${k}" ${j[k] ? 'checked' : ''}/><span>${label}</span></label>`;

function jobForm(j = null, clientId = null) {
  const isNew = !j;
  const c = j ? byId('clients', j.clientId) : clientId ? byId('clients', clientId) : null;
  if (isNew && !S.clients.length) { toast('Book a lead first. Clients come from leads.'); return leadForm(); }
  const base = j || (c ? { ...c, date: addDays(today(), 1), time: '09:00', cleanerPay: defaultPay(c.price) } : { date: addDays(today(), 1), time: '09:00' });
  openSheet(isNew ? 'Schedule a job' : 'Edit job', `<form id="f">
    ${isNew ? selectField('clientId', 'Client', S.clients.filter((x) => x.active).map((x) => [x.id, x.name]), c?.id) : ''}
    <div class="grid2">${textField('date', 'Date', base.date, 'date', 'required')}${textField('time', 'Time', base.time, 'time', 'required')}</div>
    ${textField('address', 'Address', base.address || c?.address)}
    ${homeFields(base)}
    <div class="grid2">${numField('price', 'Price', base.price ?? 0, '0.01')}${numField('cleanerPay', 'Cleaner pay', base.cleanerPay ?? 0, '0.01')}</div>
    ${!isNew ? selectField('cleanerId', 'Cleaner', [['', 'Unclaimed'], ...S.cleaners.map((x) => [x.id, x.name])], j.cleanerId || '') : ''}
    <label class="field"><span>Notes</span><textarea name="notes">${esc(base.notes || '')}</textarea></label>
    <button class="btn" type="submit">Save job</button></form>`, (sh) => {
    const f = $('form', sh);
    if (isNew) f.clientId.onchange = () => { const cc = byId('clients', f.clientId.value); if (cc) { f.address.value = cc.address || ''; f.price.value = cc.price; f.cleanerPay.value = defaultPay(cc.price); f.beds.value = cc.beds; f.baths.value = cc.baths; f.type.value = cc.type; f.freq.value = cc.freq; } };
    if (isNew && !c) f.clientId.onchange();
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = formData(f);
      if (isNew) { const cc = byId('clients', d.clientId); if (!cc) return toast('Pick a client'); const nj = newJobFor(cc, d.date, d.time, d); save(); render(); jobDetail(nj.id); }
      else {
        Object.assign(j, d, { cleanerId: d.cleanerId || null });
        if (j.status === 'open' && j.cleanerId) j.status = 'assigned';
        if (j.status === 'assigned' && !j.cleanerId) j.status = 'open';
        save(); render(); jobDetail(j.id);
      }
    };
  });
}

function markDone(j) {
  j.status = 'done';
  const c = byId('clients', j.clientId);
  let next = null;
  if (c && c.active && c.freq !== 'once' && P().freqs[c.freq]?.days) {
    const hasFuture = S.jobs.some((x) => x.clientId === c.id && x.id !== j.id && x.date > j.date && x.status !== 'cancelled');
    if (!hasFuture) {
      next = newJobFor(c, addDays(j.date, P().freqs[c.freq].days), j.time, { cleanerId: j.cleanerId, status: j.cleanerId ? 'assigned' : 'open', customerPaid: false });
    }
  }
  save(); render(); jobDetail(j.id);
  toast(next ? `Done! Next clean scheduled for ${fmtDate(next.date)} with the same cleaner.` : 'Marked done');
}

// Cleaner
function cleanerForm(c = {}) {
  const isNew = !c.id;
  openSheet(isNew ? 'New cleaner' : 'Edit cleaner', `<form id="f">
    <div class="grid2">${textField('name', 'Name', c.name, 'text', 'required')}${textField('phone', 'Phone', c.phone, 'tel')}</div>
    ${textField('email', 'Email', c.email, 'email')}${textField('areas', 'Areas they cover', c.areas)}
    ${checkField('agreement', 'Signed contractor + non-solicit agreement', c.agreement)}
    ${checkField('w9', 'W-9 on file', c.w9)}
    ${checkField('ownSupplies', 'Brings own supplies & equipment', c.ownSupplies ?? true)}
    ${checkField('background', 'Background check done', c.background)}
    ${checkField('active', 'Active (gets job offers)', c.active ?? true)}
    <label class="field"><span>Notes</span><textarea name="notes">${esc(c.notes || '')}</textarea></label>
    <button class="btn" type="submit">Save cleaner</button>
    ${isNew ? '' : `<button class="btn danger" type="button" style="margin-top:10px" data-act="deleteCleaner" data-id="${c.id}">Delete cleaner</button>`}</form>`, (sh) => {
    $('form', sh).onsubmit = (e) => {
      e.preventDefault(); const d = formData(e.target);
      if (isNew) { const n = { id: uid(), since: today(), ...d }; S.cleaners.push(n); save(); render(); cleanerDetail(n.id); }
      else { Object.assign(c, d); save(); render(); cleanerDetail(c.id); }
    };
  });
}
function cleanerDetail(id) {
  const c = byId('cleaners', id); if (!c) return;
  const ytd = cleanerYTD(c.id), r = cleanerRating(c.id);
  const jobs = S.jobs.filter((j) => j.cleanerId === c.id).sort(byDate).reverse();
  const issues = S.issues.filter((i) => byId('jobs', i.jobId)?.cleanerId === c.id);
  const owed = sum(jobs.filter((j) => j.status === 'done' && !j.cleanerPaid), (j) => j.cleanerPay);
  const check = (on, label) => `<div class="small">${on ? '✅' : '⬜️'} ${label}</div>`;
  openSheet(esc(c.name), `
    <div class="stats"><div class="stat"><div class="l">Paid this year</div><div class="v">${money(ytd)}</div></div><div class="stat"><div class="l">Rating</div><div class="v">${r ? '★ ' + r.toFixed(1) : '—'}</div></div>
      <div class="stat"><div class="l">Jobs done</div><div class="v">${jobs.filter((j) => j.status === 'done').length}</div></div><div class="stat"><div class="l">Complaints</div><div class="v ${issues.length ? 'bad' : ''}">${issues.length}</div></div></div>
    ${ytd >= S.settings.threshold1099 ? `<p class="small warn">Paid ${money(ytd)} this year: you'll need to file a 1099-NEC for ${esc(c.name)}.</p>` : ''}
    ${owed ? `<p class="small">You owe ${money(owed)} for completed jobs. <button class="link" data-act="payCleaner" data-id="${c.id}">Mark paid</button></p>` : ''}
    <div class="card" style="padding:12px;margin-top:12px">${check(c.agreement, 'Contractor + non-solicit agreement')}${check(c.w9, 'W-9')}${check(c.ownSupplies, 'Own supplies')}${check(c.background, 'Background check')}${c.areas ? `<div class="small muted" style="margin-top:6px">Covers: ${esc(c.areas)}</div>` : ''}${c.notes ? `<div class="small muted">${esc(c.notes)}</div>` : ''}</div>
    <div class="btn-row">${c.phone ? `<a class="btn small" href="sms:${esc(digits(c.phone))}">Text</a><a class="btn small secondary" href="tel:${esc(digits(c.phone))}">Call</a>` : ''}<button class="btn small secondary" data-act="editCleaner" data-id="${c.id}">Edit</button></div>
    ${jobs.length ? `<div class="section-title">Jobs</div><div class="card" style="padding:4px 14px"><ul class="list">${jobs.slice(0, 20).map(jobRow).join('')}</ul></div>` : ''}`);
}

// Client
function clientDetail(id) {
  const c = byId('clients', id); if (!c) return;
  const jobs = S.jobs.filter((j) => j.clientId === c.id).sort(byDate).reverse();
  const done = jobs.filter((j) => j.status === 'done');
  const lead = byId('leads', c.leadId);
  openSheet(esc(c.name), `
    <div class="stats"><div class="stat"><div class="l">Lifetime paid</div><div class="v">${money(sum(done, (j) => j.price))}</div></div><div class="stat"><div class="l">You kept</div><div class="v">${money(sum(done, jobGross) - (lead?.cost || 0))}</div></div></div>
    <div class="card" style="padding:12px;margin-top:12px"><div class="small">${esc(c.address || '')}</div><div class="small muted">${c.beds} bed / ${c.baths} bath · ${typeLabel(c.type)} · ${freqLabel(c.freq)} · ${money(c.price)}/visit · from ${esc(c.source || '')}</div>${c.notes ? `<div class="small muted">${esc(c.notes)}</div>` : ''}</div>
    <div class="btn-row">${c.phone ? `<a class="btn small" href="sms:${esc(digits(c.phone))}">Text</a>` : ''}<button class="btn small secondary" data-act="newJob" data-id="${c.id}">Schedule a clean</button><button class="btn small secondary" data-act="editClient" data-id="${c.id}">Edit</button></div>
    ${jobs.length ? `<div class="section-title">Cleans</div><div class="card" style="padding:4px 14px"><ul class="list">${jobs.map(jobRow).join('')}</ul></div>` : ''}`);
}
function clientForm(c) {
  openSheet('Edit client', `<form id="f">
    <div class="grid2">${textField('name', 'Name', c.name, 'text', 'required')}${textField('phone', 'Phone', c.phone, 'tel')}</div>
    ${textField('address', 'Address', c.address)}${homeFields(c)}
    ${numField('price', 'Price per visit', c.price, '0.01')}
    <label class="field"><span>Notes for cleaners</span><textarea name="notes">${esc(c.notes || '')}</textarea></label>
    ${checkField('active', 'Active client (keep scheduling)', c.active)}
    <button class="btn" type="submit">Save</button></form>`, (sh) => {
    $('form', sh).onsubmit = (e) => { e.preventDefault(); Object.assign(c, formData(e.target)); save(); render(); clientDetail(c.id); };
  });
}

// Issues
function issueForm(jobId, i = null) {
  const j = byId('jobs', jobId || i?.jobId);
  const isNew = !i;
  openSheet(isNew ? 'Log a complaint' : 'Complaint', `<form id="f">
    ${selectField('kind', 'What happened', ISSUE_KINDS.map((k) => [k, k]), i?.kind)}
    <label class="field"><span>Details</span><textarea name="desc">${esc(i?.desc || '')}</textarea></label>
    ${selectField('resolution', 'How you\'ll fix it', RESOLUTIONS.map((k) => [k, k]), i?.resolution || 'Free re-clean')}
    ${numField('refund', 'Refund amount $', i?.refund ?? 0, '0.01')}
    ${checkField('resolved', 'Resolved', i?.resolved)}
    ${isNew ? checkField('reclean', 'Schedule a free re-clean for tomorrow (same cleaner, $0)', true) : ''}
    ${j ? msgBlock('Reply to the customer', msg('complaint', { job: j }), byId('clients', j.clientId)?.phone) : ''}
    <button class="btn" type="submit" style="margin-top:12px">Save</button>
    ${isNew ? '' : `<button class="btn danger" type="button" style="margin-top:10px" data-act="deleteIssue" data-id="${i.id}">Delete</button>`}</form>`, (sh) => {
    $('form', sh).onsubmit = (e) => {
      e.preventDefault(); const d = formData(e.target);
      if (isNew) {
        const { reclean, ...rest } = d;
        S.issues.push({ id: uid(), jobId, date: today(), ...rest });
        if (reclean && d.resolution === 'Free re-clean' && j) {
          const c = byId('clients', j.clientId);
          newJobFor(c, addDays(today(), 1), j.time, { price: 0, cleanerPay: 0, cleanerId: j.cleanerId, status: j.cleanerId ? 'assigned' : 'open', freq: 'once', type: j.type, notes: 'Free re-clean: ' + (d.desc || d.kind), customerPaid: true, cleanerPaid: true });
        }
      } else Object.assign(i, d);
      save(); closeSheet(); render(); toast('Saved');
    };
  });
}

function expenseForm(x = null) {
  openSheet(x ? 'Expense' : 'New expense', `<form id="f">
    <div class="grid2">${numField('amount', 'Amount $', x?.amount ?? '', '0.01')}${textField('date', 'Date', x?.date || today(), 'date')}</div>
    ${selectField('category', 'Category', EXPENSE_CATS.map((k) => [k, k]), x?.category)}
    ${selectField('source', 'For a lead source? (optional)', [['', '—'], ...SOURCES.map((s) => [s, s])], x?.source || '')}
    ${textField('note', 'Note', x?.note, 'text', 'placeholder="e.g. Liability insurance, November"')}
    <button class="btn" type="submit">Save</button>
    ${x ? `<button class="btn danger" type="button" style="margin-top:10px" data-act="deleteExpense" data-id="${x.id}">Delete</button>` : ''}</form>`, (sh) => {
    $('form', sh).onsubmit = (e) => { e.preventDefault(); const d = formData(e.target); if (x) Object.assign(x, d); else S.expenses.push({ id: uid(), ...d }); save(); closeSheet(); render(); };
  });
}

// ---------- Actions ----------
function applyMark(el) {
  if (el.dataset.mark === 'quoted') { const l = byId('leads', el.dataset.id); if (l && l.status === 'new') { l.status = 'quoted'; save(); render(); } }
  if (el.dataset.mark === 'reminded') { const j = byId('jobs', el.dataset.id); if (j) { j.reminded = true; save(); render(); } }
}
const acts = {
  noop() {},
  go(d) { closeSheet(); if (d.filter) ui.jobFilter = d.filter; go(d.tab, d.sub || null); },
  month(d) { ui.month = shiftMonth(ui.month, Number(d.n)); render(); },
  leadFilter(d) { ui.leadFilter = d.f; render(); },
  jobFilter(d) { ui.jobFilter = d.f; render(); },
  srcPeriod(d) { ui.srcPeriod = d.f; render(); },
  closeSheet() { closeSheet(); },
  closeSheetBg(d, el, e) { if (e.target === el) closeSheet(); },
  newLead() { leadForm(); },
  lead(d) { leadDetail(d.id); },
  editLead(d) { leadForm(byId('leads', d.id)); },
  deleteLead(d) { if (confirm('Delete this lead?')) { S.leads = S.leads.filter((l) => l.id !== d.id); save(); closeSheet(); render(); } },
  leadStatus(d) { byId('leads', d.id).status = d.s; save(); render(); leadDetail(d.id); },
  bookLead(d) { bookForm(byId('leads', d.id)); },
  copyText(d, el) { copy(d.text); applyMark(el); },
  markOnly(d, el) { applyMark(el); },
  async draft(d, el) {
    const l = byId('leads', d.id), q = $('#askQ').value.trim(), out = $('#draftOut');
    if (!q) { toast('Paste the customer\'s question first'); return; }
    l.lastQ = q; save();
    el.disabled = true; el.textContent = 'Drafting…';
    try {
      const r = await draftReply(l, q);
      out.innerHTML = msgBlock('Draft reply', r.text, l.phone) + `<p class="small muted">${esc(r.note)}</p>`;
    } catch (err) {
      out.innerHTML = `<p class="small bad">${esc(err?.status === 401 ? 'That API key was rejected. Check it in Settings.' : err?.message || 'Could not reach Claude.')}</p>`;
    } finally { el.disabled = false; el.textContent = '✨ Draft a reply'; }
  },
  newJob(d) { jobForm(null, d.id || null); },
  job(d) { jobDetail(d.id); },
  editJob(d) { jobForm(byId('jobs', d.id)); },
  assign(d) { const j = byId('jobs', d.id); j.cleanerId = d.c; j.status = 'assigned'; save(); render(); jobDetail(j.id); toast('Assigned. Send the confirmation.'); },
  unassign(d) { const j = byId('jobs', d.id); j.cleanerId = null; j.status = 'open'; save(); render(); jobDetail(j.id); },
  doneJob(d) { markDone(byId('jobs', d.id)); },
  cancelJob(d) {
    if (!confirm('Cancel this job?')) return;
    const j = byId('jobs', d.id); j.status = 'cancelled'; save(); render(); jobDetail(j.id);
  },
  deleteJob(d) { S.jobs = S.jobs.filter((j) => j.id !== d.id); save(); closeSheet(); render(); },
  rate(d) { const j = byId('jobs', d.id); j.rating = Number(d.n); save(); jobDetail(j.id); },
  toggleJob(d, el) { const j = byId('jobs', d.id); j[d.k] = el.checked; save(); render(); },
  copyNumbers() { const nums = S.cleaners.filter(cleanerReady).map((c) => c.phone).filter(Boolean); if (!nums.length) return toast('No ready cleaners with phone numbers'); copy(nums.join(', '), `Copied ${nums.length} numbers. Paste into a group text.`); },
  payCleaner(d) {
    const js = S.jobs.filter((j) => j.cleanerId === d.id && j.status === 'done' && !j.cleanerPaid);
    if (!confirm(`Mark ${money(sum(js, (j) => j.cleanerPay))} as paid to ${byId('cleaners', d.id)?.name}?`)) return;
    js.forEach((j) => { j.cleanerPaid = true; }); save(); render(); if ($('.sheet')) cleanerDetail(d.id);
  },
  newCleaner() { cleanerForm(); },
  cleaner(d) { cleanerDetail(d.id); },
  editCleaner(d) { cleanerForm(byId('cleaners', d.id)); },
  deleteCleaner(d) { if (confirm('Delete this cleaner? Their past jobs stay.')) { S.cleaners = S.cleaners.filter((c) => c.id !== d.id); save(); closeSheet(); render(); } },
  client(d) { clientDetail(d.id); },
  editClient(d) { clientForm(byId('clients', d.id)); },
  newIssue(d) { issueForm(d.id); },
  issue(d) { const i = byId('issues', d.id); issueForm(i.jobId, i); },
  deleteIssue(d) { S.issues = S.issues.filter((i) => i.id !== d.id); save(); closeSheet(); render(); },
  newExpense() { expenseForm(); },
  expense(d) { expenseForm(byId('expenses', d.id)); },
  deleteExpense(d) { S.expenses = S.expenses.filter((x) => x.id !== d.id); save(); closeSheet(); render(); },
  setup(d, el) { S.setup[d.id] = el.checked; save(); render(); },
  copyQuote() { copy(quoteLink(null), 'Quote link copied'); },
  editTemplate(d) {
    openSheet('Edit message', `<form id="f"><label class="field"><textarea name="t" style="min-height:180px">${esc(S.templates[d.id])}</textarea></label>
      <div class="section-title">Preview</div><div class="msg-box" id="pv"></div>
      <div class="btn-row"><button class="btn" type="submit">Save</button><button class="btn secondary" type="button" data-act="resetTemplate" data-id="${d.id}">Reset</button></div></form>`, (sh) => {
      const f = $('form', sh), pv = $('#pv', sh);
      const sampleJob = S.jobs[0];
      const upd = () => { pv.textContent = fill(f.t.value, vars(sampleJob ? { job: sampleJob } : {})); };
      f.t.oninput = upd; upd();
      f.onsubmit = (e) => { e.preventDefault(); S.templates[d.id] = f.t.value; save(); closeSheet(); render(); toast('Saved'); };
    });
  },
  resetTemplate(d) { S.templates[d.id] = DEFAULT_TEMPLATES[d.id]; save(); closeSheet(); render(); },
  editFaq(d) {
    const isNew = d.id === 'new', f0 = isNew ? { q: '', a: '', k: '' } : S.faqs[Number(d.id)];
    openSheet(isNew ? 'New FAQ' : 'Edit FAQ', `<form id="f">${textField('q', 'Question', f0.q, 'text', 'required')}
      <label class="field"><span>Answer (you can use {cancelFee} and {freqDiscounts})</span><textarea name="a" style="min-height:140px" required>${esc(f0.a)}</textarea></label>
      ${textField('k', 'Keywords that trigger it', f0.k, 'text', 'placeholder="pets dog cat"')}
      <button class="btn" type="submit">Save</button>${isNew ? '' : `<button class="btn danger" type="button" style="margin-top:10px" data-act="deleteFaq" data-id="${d.id}">Delete</button>`}</form>`, (sh) => {
      $('form', sh).onsubmit = (e) => { e.preventDefault(); const v = formData(e.target); if (isNew) S.faqs.push(v); else Object.assign(f0, v); save(); closeSheet(); render(); };
    });
  },
  deleteFaq(d) { S.faqs.splice(Number(d.id), 1); save(); closeSheet(); render(); },
  copyFaq() { copy(S.faqs.map((f) => `Q: ${f.q}\nA: ${faqAnswer(f)}`).join('\n\n'), 'FAQ copied. Paste it into your AI texting tool.'); },
  copyOneFaq(d) { copy(faqAnswer(S.faqs[Number(d.id)])); },
  copyAgreement() { copy(fill(NONSOLICIT, vars()), 'Agreement copied'); },
  viewAgreement() { openSheet('Agreement draft', `<div class="msg-box small">${esc(fill(NONSOLICIT, vars()))}</div><div class="btn-row"><button class="btn" data-act="copyAgreement">Copy</button></div>`); },
  resetPricing() { if (confirm('Reset all prices to the defaults?')) { S.settings.pricing = JSON.parse(JSON.stringify(DEFAULT_PRICING)); save(); render(); } },
  export() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `booking-hq-backup-${today()}.json`; a.click(); URL.revokeObjectURL(a.href);
  },
  exportCsv() {
    const head = ['date', 'time', 'client', 'address', 'type', 'beds', 'baths', 'frequency', 'status', 'cleaner', 'price', 'cleaner_pay', 'card_fee', 'kept', 'customer_paid', 'cleaner_paid'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [...S.jobs].sort(byDate).map((j) => [j.date, j.time, byId('clients', j.clientId)?.name, j.address, j.type, j.beds, j.baths, j.freq, j.status, byId('cleaners', j.cleanerId)?.name, j.price, j.cleanerPay, cardFee(j.price), jobGross(j), j.customerPaid ? 'yes' : 'no', j.cleanerPaid ? 'yes' : 'no'].map(q).join(','));
    const blob = new Blob([[head.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `booking-hq-jobs-${today()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  },
  sample() {
    if ((S.leads.length || S.jobs.length) && !confirm('Replace your data with sample data?')) return;
    const keep = S.settings; S = sampleData(); S.settings = { ...S.settings, ...keep, pricing: keep.pricing };
    save(); go('home'); toast('Sample data loaded');
  },
  reset() { if (confirm('Erase all data in this browser? Download a backup first if you need it.')) { S = defaultState(); save(); go('home'); } },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = acts[el.dataset.act];
  if (fn) fn(el.dataset, el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('input[type=checkbox][data-act]')) acts[el.dataset.act]?.(el.dataset, el, e);
  if (el.id === 'importFile' && el.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try { const d = JSON.parse(r.result); if (!d || !Array.isArray(d.jobs)) throw new Error(); if (!confirm('Replace all current data with this backup?')) return; localStorage.setItem(STORE_KEY, JSON.stringify(d)); S = load(); render(); toast('Backup restored'); }
      catch { toast('That file is not a Booking HQ backup'); }
    };
    r.readAsText(el.files[0]);
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'settingsForm') {
    e.preventDefault(); Object.assign(S.settings, formData(e.target)); save(); render(); toast('Settings saved');
  }
  if (e.target.id === 'pricingForm') {
    e.preventDefault();
    const d = formData(e.target), p = S.settings.pricing;
    p.base = d.base; p.perBed = d.perBed; p.perBath = d.perBath;
    Object.keys(p.types).forEach((k) => { p.types[k].mult = d['mult_' + k] || 1; });
    Object.keys(p.freqs).forEach((k) => { if (k !== 'once') p.freqs[k].discount = d['disc_' + k]; });
    Object.keys(p.addons).forEach((k) => { p.addons[k].price = d['addon_' + k]; });
    ['cleanerPct', 'cardPct', 'cardFixed', 'cancelFee'].forEach((k) => { S.settings[k] = d[k]; });
    save(); render(); toast('Prices saved');
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

$$('.tabbar button').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
$('#backBtn').addEventListener('click', () => go(route.tab));
$('#addBtn').addEventListener('click', () => {
  const k = route.sub || route.tab;
  if (k === 'jobs' || k === 'clients') return jobForm();
  if (k === 'cleaners') return cleanerForm();
  if (k === 'expenses') return expenseForm();
  if (k === 'templates') return acts.editFaq({ id: 'new' });
  leadForm();
});
window.addEventListener('hashchange', () => { readHash(); render(); });

// ---------- Sample data ----------
function sampleData() {
  const s = defaultState();
  const t = today();
  const cl = (name, phone, extra = {}) => ({ id: uid(), name, phone, agreement: true, w9: true, ownSupplies: true, background: true, active: true, since: addDays(t, -60), ...extra });
  const maria = cl('Maria Lopez', '555-201-1101', { areas: 'North side' });
  const dee = cl('Dee Johnson', '555-201-1102', { areas: 'Downtown, East' });
  const kim = cl('Kim Tran', '555-201-1103', { w9: false, agreement: false, background: false, since: addDays(t, -3) });
  s.cleaners = [maria, dee, kim];
  const lead = (name, src, cost, beds, baths, type, freq, status, daysAgo, notes = '') => ({ id: uid(), name, phone: '555-310-' + String(1000 + Math.floor(Math.random() * 8999)).slice(0, 4), source: src, cost, beds, baths, type, freq, addons: [], status, created: addDays(t, -daysAgo), notes, address: '' });
  const l1 = lead('Jenna Carter', 'Thumbtack', 18, 2, 2, 'standard', 'biweekly', 'booked', 40, 'Hi, need a quote for a 2 bed 2 bath.');
  const l2 = lead('Marcus Reed', 'Nextdoor', 0, 3, 2, 'standard', 'weekly', 'booked', 30);
  const l3 = lead('Priya Shah', 'Google', 0, 1, 1, 'move', 'once', 'booked', 12);
  const l4 = lead('Tom Alvarez', 'Thumbtack', 22, 3, 2.5, 'deep', 'once', 'new', 0, 'What\'s the difference between standard and deep clean? Do you bring supplies?');
  const l5 = lead('Sara Kim', 'Facebook', 0, 2, 1, 'standard', 'monthly', 'quoted', 2);
  const l6 = lead('Ben Ortiz', 'Thumbtack', 15, 4, 3, 'standard', 'once', 'lost', 9);
  s.leads = [l1, l2, l3, l4, l5, l6];
  const mkClient = (l, address) => { const q = priceQuote(l, s.settings.pricing); const c = { id: uid(), name: l.name, phone: l.phone, address, source: l.source, leadId: l.id, beds: l.beds, baths: l.baths, type: l.type, freq: l.freq, addons: [], price: q.total, notes: '', active: l.freq !== 'once', since: l.created }; l.clientId = c.id; l.address = address; return c; };
  const c1 = mkClient(l1, '412 Oak St'), c2 = mkClient(l2, '88 Pine Ave'), c3 = mkClient(l3, '19 Elm Ct #4');
  s.clients = [c1, c2, c3];
  const pay = (p) => round2(p * s.settings.cleanerPct / 100);
  const job = (c, date, status, cleaner, extra = {}) => ({ id: uid(), clientId: c.id, date, time: '10:00', address: c.address, beds: c.beds, baths: c.baths, type: c.type, freq: c.freq, addons: [], price: c.price, cleanerPay: pay(c.price), status, cleanerId: cleaner?.id || null, customerPaid: status === 'done', cleanerPaid: status === 'done' && date < addDays(t, -7), notes: '', ...extra });
  s.jobs = [
    job(c1, addDays(t, -28), 'done', maria, { rating: 5 }), job(c1, addDays(t, -14), 'done', maria, { rating: 4 }), job(c1, t, 'assigned', maria),
    job(c2, addDays(t, -21), 'done', dee, { rating: 5 }), job(c2, addDays(t, -14), 'done', dee, { rating: 5 }), job(c2, addDays(t, -7), 'done', dee, { rating: 3 }), job(c2, addDays(t, 1), 'assigned', dee),
    job(c3, addDays(t, 3), 'open', null, { notes: 'Lockbox code 4821. Empty apartment.' }),
  ];
  s.issues = [{ id: uid(), jobId: s.jobs[5].id, date: addDays(t, -6), kind: 'Missed spots', desc: 'Guest bathroom mirror and baseboards', resolution: 'Free re-clean', refund: 0, resolved: true }];
  s.expenses = [
    { id: uid(), date: addDays(t, -20), amount: 45, category: 'Insurance', note: 'General liability (monthly)' },
    { id: uid(), date: addDays(t, -18), amount: 49, category: 'Software / AI tools', note: 'AI texting & booking tool' },
  ];
  s.setup = { llc: true, ein: true, insurance: true, payments: true, pricing: true, thumbtack: true };
  s.settings.bizName = 'Sparkle Booking Co.';
  return s;
}

// ---------- Start ----------
readHash();
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
