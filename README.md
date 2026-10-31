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

## Automatic SoFi sync (purchases, deposits, balances)
`connector/sofi_tracker.py` is a read-only Plaid connector that runs on your computer. It can see balances and transactions but can never move money. It also works as an MCP server, so Claude Desktop can answer questions about your spending.

**One-time setup on your Mac:**
```bash
cd connector
pip install -r requirements.txt
export PLAID_CLIENT_ID=...  PLAID_SECRET=...   # from your Plaid dashboard
python sofi_tracker.py link                    # sign in to SoFi in the browser
```

**Each time you want fresh data:**
```bash
python sofi_tracker.py export
```
This pulls new transactions from SoFi and writes `iCloud Drive/AMH Finance/sofi-export.json`. In Claude Desktop you can also just ask it to "export for the app".

Then on your iPhone, open the app → ⚙️ Settings → **Import SoFi sync file** and pick that file in Files. The first time, you choose whether each SoFi account links to an existing account in the app or is created new.

What the import does:
- Adds new purchases and deposits, using Plaid's categories (groceries, dining, paycheck, check deposits, transfers…). Categories you have taught the app take priority.
- Marks pending charges. When one posts, the pending copy is replaced, so nothing is counted twice.
- Sets each account's balance to what SoFi reports.
- Keeps your edits (category, payee, notes) on transactions it has already imported, and can be re-run safely.
- Recognizes transactions you already entered by hand or from a CSV, so they are not duplicated.

The export file contains your financial data. It is stored in iCloud Drive, and with Advanced Data Protection turned on it is end-to-end encrypted. `.gitignore` keeps export files and tokens out of this repo.

## Getting your transactions in manually
Most banks and card issuers can export transactions as CSV from their website. Use **Settings → Import bank CSV**, choose the account, and confirm which columns hold the date, description and amount.

Linking banks automatically (like commercial apps do) requires a paid aggregator such as Plaid plus a backend server to hold the API secrets. That is out of scope for this private, serverless version.
