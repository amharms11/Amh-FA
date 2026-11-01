// Pricing shared by the owner app (index.html) and the customer quote page (quote.html).
const DEFAULT_PRICING = {
  base: 100,          // every clean starts here
  perBed: 20,
  perBath: 20,
  types: {
    standard: { label: 'Standard clean', mult: 1 },
    deep: { label: 'Deep clean', mult: 1.5 },
    move: { label: 'Move-in / move-out', mult: 1.8 },
  },
  freqs: {
    once: { label: 'One time', discount: 0, days: 0 },
    weekly: { label: 'Weekly', discount: 40, days: 7 },
    biweekly: { label: 'Every 2 weeks', discount: 30, days: 14 },
    monthly: { label: 'Every 4 weeks', discount: 20, days: 28 },
  },
  addons: {
    fridge: { label: 'Inside fridge', price: 30 },
    oven: { label: 'Inside oven', price: 30 },
    cabinets: { label: 'Inside cabinets', price: 30 },
    windows: { label: 'Interior windows', price: 40 },
    laundry: { label: 'Laundry (wash & fold)', price: 20 },
  },
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Price one visit.
 * opts: { beds, baths, type: 'standard'|'deep'|'move', freq: 'once'|'weekly'|..., addons: [] }
 * The recurring discount applies to standard cleans only. Move-outs are always one time.
 */
function priceQuote(opts, pricing = DEFAULT_PRICING) {
  const p = pricing;
  const beds = Math.max(0, Number(opts.beds) || 0);
  const baths = Math.max(0, Number(opts.baths) || 0);
  const type = p.types[opts.type] ? opts.type : 'standard';
  const freq = type === 'move' ? 'once' : (p.freqs[opts.freq] ? opts.freq : 'once');
  const base = p.base + beds * p.perBed + baths * p.perBath;
  const clean = round2(base * p.types[type].mult);
  const addons = round2((opts.addons || []).reduce((s, a) => s + (p.addons[a] ? Number(p.addons[a].price) : 0), 0));
  const discount = type === 'standard' ? Number(p.freqs[freq].discount) || 0 : 0;
  const total = round2(Math.max(0, clean + addons - discount));
  return { beds, baths, type, freq, base, clean, addons, discount, total };
}

const fmtMoney = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// Encode the business info + pricing into a quote link so the customer page needs no server.
function encodeQuoteData(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeQuoteData(s) {
  try {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4)))));
  } catch { return null; }
}
