# AMH Finance

A private personal finance tracker: spending, budgets, recurring bills and subscriptions, savings goals, and net worth. It is a plain HTML/CSS/JS installable web app (PWA). It has **no server, no accounts and no tracking**. All data stays in your browser's local storage on your device.

## Features
- **Ask Claude** (✨ button): ask questions about your money in plain English, e.g. "How much did I spend eating out last month?". It uses your Claude account through Claude Code (set it up from the Desktop launcher by typing `c`), or an Anthropic API key if you add `ANTHROPIC_API_KEY=...` to `~/.sofi-tracker/config.env`. Your question and a summary of your finances are sent to Claude to answer.
- **Heads up**: bill reminders (1–7 days ahead, optional desktop pop-ups), budgets near or over their limit, unusual or possibly doubled charges, and accounts that may not cover this week's bills
- **This week**: spending so far this week vs the same days last week
- **Reports**: spending by category, store or month, for any period, with month-by-month income/spending/net and a CSV download
- **Split transactions**: divide one purchase across several categories
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

## Easiest install (Mac)
Open **Terminal** (press ⌘ + Space, type `Terminal`, press Return), paste this line, and press Return:
```bash
curl -fsSL https://raw.githubusercontent.com/amharms11/Amh-FA/main/install.sh | bash
```
That's it. An **AMH Finance** icon appears on your Desktop: double-click it whenever you want to use the app. **It updates itself every time you open it.**

## Automatic SoFi sync (purchases, deposits, balances)
`connector/sofi_tracker.py` is a read-only Plaid connector. It can see balances and transactions but can never move money. Everything stays on your computer.

### Computer-only setup (recommended)
```bash
git clone https://github.com/amharms11/Amh-FA.git
cd Amh-FA/connector
python3 -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python sofi_tracker.py setup     # paste Plaid client ID + secret (saved to ~/.sofi-tracker/config.env)
python sofi_tracker.py link      # sign in to SoFi in the browser, once
python sofi_tracker.py app       # opens http://localhost:8770
```
In the app, click **Start with my SoFi data**, then confirm the accounts. After that, click **Sync now** whenever you want fresh purchases, deposits and balances. When the app opens it also loads anything synced in the meantime, for example by Claude Desktop.

To use it again later: `cd Amh-FA/connector`, `source .venv/bin/activate`, then `python sofi_tracker.py app`. Always use the same address (`http://localhost:8770`), because the browser keeps your app data per address and per browser.

### iPhone (optional)
`python sofi_tracker.py export` writes `iCloud Drive/AMH Finance/sofi-export.json`. In the app on your phone, go to ⚙️ Settings → **Import SoFi sync file**.

### What a sync does
- Adds new purchases and deposits, using Plaid's categories. Categories you've taught the app take priority.
- Marks pending charges and replaces them when they post, so nothing is counted twice.
- Sets each account's balance to what SoFi reports.
- Keeps your edits on transactions it has already imported, and can be re-run safely.
- Recognizes transactions you already entered by hand or from a CSV, so they are not duplicated.

The local server only accepts connections from your own computer. `.gitignore` keeps export files and tokens out of this repo.

## Getting your transactions in manually
Most banks and card issuers can export transactions as CSV from their website. Use **Settings → Import bank CSV**, choose the account, and confirm which columns hold the date, description and amount.

Linking banks automatically (like commercial apps do) requires a paid aggregator such as Plaid plus a backend server to hold the API secrets. That is out of scope for this private, serverless version.
