# AMH Finance

A private personal finance tracker: spending, budgets, recurring bills and subscriptions, savings goals, and net worth. It is a plain HTML/CSS/JS installable web app (PWA). It has **no server, no accounts and no tracking**. All data stays in your browser's local storage on your device.

## Features
- **Home**: month-to-date spending vs. budget with pacing, net worth trend, upcoming bills, category breakdown, 6-month spending chart, recent activity
- **Activity**: search and filter all transactions (by account, category, "needs review"); add, edit and delete them
- **Budgets**: per-category monthly budgets with progress bars, month-by-month history, income vs. spending, savings goals with the monthly amount needed to reach each one
- **Recurring**: subscriptions and bills shown as a this-month grid with paid ✓ (auto-matched to transactions), upcoming items, total monthly/yearly cost, and **auto-detection** of recurring charges from your history
- **Net worth**: assets and liabilities by account type, with history (1M / 3M / 1Y / All)
- **Auto-categorization**: built-in keyword hints, plus rules learned from your edits
- **Bank CSV import**: maps columns, handles debit/credit columns, skips duplicates
- JSON backup/restore, CSV export, light/dark mode, works offline

## Run it
Any static file server works:
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Put it on your iPhone
1. Host the folder on any HTTPS static host. Free options: **GitHub Pages** (repo Settings → Pages → deploy from branch), Netlify Drop, or Cloudflare Pages.
2. Open the URL in Safari → Share → **Add to Home Screen**.
3. It then launches full-screen like a native app and works offline.

> Data is stored per browser and per device. Use **Settings → Back up** regularly. Clearing Safari website data deletes it.

## Getting your transactions in
Most banks and card issuers can export transactions as CSV from their website. Use **Settings → Import bank CSV**, choose the account, and confirm which columns hold the date, description and amount.

Linking banks automatically (like commercial apps do) requires a paid aggregator such as Plaid plus a backend server to hold the API secrets. That is out of scope for this private, serverless version.
