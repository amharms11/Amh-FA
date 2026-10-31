#!/usr/bin/env python3
"""
SoFi Tracker - read-only Plaid -> Claude connector (MCP server), for personal use.
Also feeds the AMH Finance app via an export file.

Commands:
  python sofi_tracker.py link            # one-time: connect SoFi in your browser
  python sofi_tracker.py sync            # optional: pull new transactions from the terminal
  python sofi_tracker.py export [PATH]   # sync, then write a file the AMH Finance app imports
  python sofi_tracker.py                 # run as an MCP server (Claude Desktop starts this for you)

Read-only by design: it can see balances and transactions. It cannot move money.
Data is stored only on your computer in ~/.sofi-tracker/
"""
import datetime as dt
import json
import os
import sys
import webbrowser
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

DATA = Path.home() / ".sofi-tracker"
TOKEN_FILE = DATA / "item.json"
TXN_FILE = DATA / "transactions.json"
PORT = 8765

# Where `export` writes by default. iCloud Drive (if present) makes the file
# show up in the iPhone Files app, so the AMH Finance app can import it.
ICLOUD = Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs"
EXPORT_NAME = "sofi-export.json"


def default_export_path() -> Path:
    if ICLOUD.is_dir():
        return ICLOUD / "AMH Finance" / EXPORT_NAME
    return DATA / EXPORT_NAME


# ---------- Plaid client & storage ----------

def client():
    import plaid
    from plaid.api import plaid_api

    env = os.environ.get("PLAID_ENV", "production").lower()
    host = plaid.Environment.Sandbox if env == "sandbox" else plaid.Environment.Production
    cfg = plaid.Configuration(
        host=host,
        api_key={
            "clientId": os.environ["PLAID_CLIENT_ID"],
            "secret": os.environ["PLAID_SECRET"],
        },
    )
    return plaid_api.PlaidApi(plaid.ApiClient(cfg))


def access_token():
    if not TOKEN_FILE.exists():
        raise RuntimeError("Not connected yet. Run: python sofi_tracker.py link")
    return json.loads(TOKEN_FILE.read_text())["access_token"]


def save_private(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, default=str))
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def load_store():
    if TXN_FILE.exists():
        return json.loads(TXN_FILE.read_text())
    return {"cursor": None, "txns": {}, "accounts": {}}


# ---------- One-time bank link ----------

LINK_PAGE = """<!doctype html><html><head><meta name=viewport content="width=device-width">
<title>Connect SoFi</title></head>
<body style="font-family:system-ui;padding:2em;max-width:30em">
<h2>Connect SoFi to your tracker</h2>
<p>Read-only. Pick SoFi and sign in when Plaid asks.</p>
<button id=b style="font-size:1.1em;padding:.6em 1.2em">Connect</button>
<p id=s></p>
<script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
<script>
const s = document.getElementById('s');
const h = Plaid.create({
  token: "%s",
  onSuccess: async (publicToken) => {
    s.textContent = 'Saving...';
    const r = await fetch('/exchange', {method: 'POST', body: publicToken});
    s.textContent = r.ok ? 'Connected. You can close this tab.' : 'Save failed - check the terminal.';
  },
  onExit: (err) => { if (err) s.textContent = 'Error: ' + (err.display_message || err.error_message); }
});
document.getElementById('b').onclick = () => h.open();
</script></body></html>"""


def link():
    import plaid
    from plaid.model.country_code import CountryCode
    from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
    from plaid.model.link_token_create_request import LinkTokenCreateRequest
    from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
    from plaid.model.products import Products

    c = client()
    req = LinkTokenCreateRequest(
        user=LinkTokenCreateRequestUser(client_user_id="me"),
        client_name="SoFi Tracker",
        products=[Products("transactions")],
        country_codes=[CountryCode("US")],
        language="en",
    )
    link_token = c.link_token_create(req).link_token
    state = {"done": False}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write((LINK_PAGE % link_token).encode())

        def do_POST(self):
            public_token = self.rfile.read(int(self.headers["Content-Length"])).decode()
            try:
                r = c.item_public_token_exchange(
                    ItemPublicTokenExchangeRequest(public_token=public_token))
                save_private(TOKEN_FILE, {"access_token": r.access_token, "item_id": r.item_id})
                state["done"] = True
                self.send_response(200)
            except plaid.ApiException as e:
                print("Exchange failed:", e.body)
                self.send_response(500)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"Opening {url} - finish connecting SoFi in the browser.")
    webbrowser.open(url)
    while not state["done"]:
        server.handle_request()
    print("Connected. Pulling your transaction history...")
    print(sync())


# ---------- Data functions ----------

def fetch_accounts(live=False):
    from plaid.model.accounts_balance_get_request import AccountsBalanceGetRequest
    from plaid.model.accounts_get_request import AccountsGetRequest

    c, tok = client(), access_token()
    if live:
        r = c.accounts_balance_get(AccountsBalanceGetRequest(access_token=tok))
    else:
        r = c.accounts_get(AccountsGetRequest(access_token=tok))
    out = []
    for a in r.to_dict()["accounts"]:
        b = a["balances"]
        out.append({
            "account_id": a["account_id"],
            "name": a.get("official_name") or a["name"],
            "mask": a.get("mask"),
            "type": str(a.get("type")),
            "subtype": str(a.get("subtype")),
            "current": b.get("current"),
            "available": b.get("available"),
            "limit": b.get("limit"),
        })
    return out


def slim(t):
    pfc = t.get("personal_finance_category") or {}
    return {
        "id": t["transaction_id"],
        "date": str(t["date"]),
        "name": t.get("name"),
        "merchant": t.get("merchant_name"),
        # Plaid convention: positive = money OUT, negative = money IN
        "amount": t["amount"],
        "account_id": t["account_id"],
        "pending": t.get("pending", False),
        "category": pfc.get("primary"),
        "subcategory": pfc.get("detailed"),
    }


def sync():
    from plaid.model.transactions_sync_request import TransactionsSyncRequest

    c, tok = client(), access_token()
    store = load_store()
    added = modified = removed = 0
    while True:
        kwargs = {"access_token": tok}
        if store["cursor"]:
            kwargs["cursor"] = store["cursor"]
        r = c.transactions_sync(TransactionsSyncRequest(**kwargs)).to_dict()
        for t in r["added"]:
            store["txns"][t["transaction_id"]] = slim(t)
        for t in r["modified"]:
            store["txns"][t["transaction_id"]] = slim(t)
        for t in r["removed"]:
            store["txns"].pop(t["transaction_id"], None)
        added += len(r["added"])
        modified += len(r["modified"])
        removed += len(r["removed"])
        store["cursor"] = r["next_cursor"]
        if not r["has_more"]:
            break
    accounts = fetch_accounts()
    store["accounts"] = {a["account_id"]: a["name"] for a in accounts}
    store["account_details"] = accounts  # balances + types, used by the app export
    store["last_sync"] = dt.datetime.now().isoformat(timespec="seconds")
    save_private(TXN_FILE, store)
    return {"added": added, "modified": modified, "removed": removed,
            "total_stored": len(store["txns"]), "last_sync": store["last_sync"]}


def query(start_date=None, end_date=None, search=None, account=None):
    store = load_store()
    names = store.get("accounts", {})
    rows = []
    for t in store["txns"].values():
        if start_date and t["date"] < start_date:
            continue
        if end_date and t["date"] > end_date:
            continue
        acct = names.get(t["account_id"], t["account_id"])
        if account and account.lower() not in acct.lower():
            continue
        text = f'{t["name"]} {t["merchant"] or ""}'.lower()
        if search and search.lower() not in text:
            continue
        rows.append({**t, "account": acct})
    rows.sort(key=lambda t: t["date"], reverse=True)
    return rows


# ---------- Export for the AMH Finance app ----------

def build_export(store: dict) -> dict:
    """Everything the app needs: accounts with balances, and every stored transaction.
    The app treats this as the full picture, so it can also drop transactions the bank removed."""
    accounts = store.get("account_details") or [
        {"account_id": k, "name": v} for k, v in store.get("accounts", {}).items()
    ]
    txns = sorted(store.get("txns", {}).values(), key=lambda t: t["date"], reverse=True)
    return {
        "format": "amh-finance-plaid/1",
        "source": "SoFi",
        "exported_at": dt.datetime.now().isoformat(timespec="seconds"),
        "last_sync": store.get("last_sync"),
        "accounts": accounts,
        "transactions": txns,
    }


def export(path=None, do_sync=True) -> dict:
    result = sync() if do_sync else {}
    out = Path(path).expanduser() if path else default_export_path()
    payload = build_export(load_store())
    save_private(out, payload)
    return {**result, "exported_to": str(out),
            "accounts": len(payload["accounts"]), "transactions": len(payload["transactions"])}


# ---------- MCP server (what Claude talks to) ----------

def serve():
    from mcp.server.fastmcp import FastMCP

    mcp = FastMCP("sofi-tracker")

    @mcp.tool()
    def get_balances(live: bool = False) -> list:
        """Balances for every connected SoFi account (checking, savings, credit card).
        live=True asks the bank for up-to-the-minute balances (slower)."""
        return fetch_accounts(live)

    @mcp.tool()
    def sync_transactions() -> dict:
        """Pull new, changed, and removed transactions from SoFi into local storage.
        Call this before answering questions about recent spending."""
        return sync()

    @mcp.tool()
    def export_for_app(path: str = "") -> dict:
        """Sync from SoFi, then write the file the AMH Finance app imports
        (Settings > Import SoFi sync file). Defaults to iCloud Drive/AMH Finance/."""
        return export(path or None)

    @mcp.tool()
    def get_transactions(start_date: str = "", end_date: str = "", search: str = "",
                         account: str = "", limit: int = 200) -> dict:
        """Stored transactions, newest first. Dates are YYYY-MM-DD.
        search matches merchant/description; account matches part of an account name.
        amount > 0 is money out, amount < 0 is money in."""
        rows = query(start_date or None, end_date or None, search or None, account or None)
        return {"count": len(rows), "transactions": rows[:limit],
                "last_sync": load_store().get("last_sync")}

    @mcp.tool()
    def spending_summary(start_date: str, end_date: str) -> dict:
        """Money in/out between two dates (YYYY-MM-DD), grouped by category and
        top merchants. Transfers between your own accounts are listed separately."""
        rows = query(start_date, end_date)
        by_cat, by_merchant = defaultdict(float), defaultdict(float)
        money_in = money_out = transfers = 0.0
        for t in rows:
            amt = t["amount"]
            if (t["category"] or "").startswith("TRANSFER"):
                transfers += abs(amt)
                continue
            if amt > 0:
                money_out += amt
                by_cat[t["category"] or "OTHER"] += amt
                by_merchant[t["merchant"] or t["name"]] += amt
            else:
                money_in += -amt
        top = sorted(by_merchant.items(), key=lambda x: -x[1])[:25]
        return {
            "money_in": round(money_in, 2),
            "money_out": round(money_out, 2),
            "net": round(money_in - money_out, 2),
            "internal_transfers": round(transfers, 2),
            "by_category": {k: round(v, 2) for k, v in sorted(by_cat.items(), key=lambda x: -x[1])},
            "top_merchants": {k: round(v, 2) for k, v in top},
        }

    mcp.run()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if cmd == "link":
        link()
    elif cmd == "sync":
        print(json.dumps(sync(), indent=1))
    elif cmd == "export":
        print(json.dumps(export(sys.argv[2] if len(sys.argv) > 2 else None), indent=1))
    else:
        serve()
