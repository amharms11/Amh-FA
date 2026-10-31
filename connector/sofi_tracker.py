#!/usr/bin/env python3
"""
SoFi Tracker - read-only Plaid -> Claude connector (MCP server), for personal use.
Also feeds the AMH Finance app via an export file.

Commands:
  python sofi_tracker.py setup           # one-time: save your Plaid keys on this computer
  python sofi_tracker.py link            # one-time: connect SoFi in your browser
  python sofi_tracker.py app             # open the AMH Finance app with a "Sync now" button
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
import warnings
import webbrowser
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

# Older Macs ship Python with LibreSSL; the warning it triggers is harmless noise.
warnings.filterwarnings("ignore", message=".*OpenSSL.*")

DATA = Path.home() / ".sofi-tracker"
TOKEN_FILE = DATA / "item.json"
TXN_FILE = DATA / "transactions.json"
CONFIG_FILE = DATA / "config.env"
PORT = 8765
APP_PORT = 8770  # keep fixed: the browser stores app data per address
APP_DIR = Path(__file__).resolve().parent.parent  # folder with index.html

# Where `export` writes by default. iCloud Drive (if present) makes the file
# show up in the iPhone Files app, so the AMH Finance app can import it.
ICLOUD = Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs"
EXPORT_NAME = "sofi-export.json"


def default_export_path() -> Path:
    if ICLOUD.is_dir():
        return ICLOUD / "AMH Finance" / EXPORT_NAME
    return DATA / EXPORT_NAME


# ---------- Plaid client & storage ----------

def load_config():
    """Read keys saved by `setup` (real environment variables win)."""
    if CONFIG_FILE.exists():
        for line in CONFIG_FILE.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


def _ask_hidden_after(prompt):
    """Visible while pasting (less confusing than a blank prompt), then masked on screen."""
    val = input(prompt).strip()
    if val and sys.stdout.isatty():
        sys.stdout.write("\033[1A\033[2K")
        print(prompt + "\u2022" * 10 + "  (saved)")
    return val


def plaid_problem(exc):
    """Turn a Plaid/network error into (code, plain-English message)."""
    body = {}
    try:
        body = json.loads(getattr(exc, "body", None) or "{}")
    except (TypeError, ValueError):
        pass
    code = body.get("error_code") or ""
    if code == "INVALID_API_KEYS":
        return code, ("Plaid didn't accept those keys. Usually the secret doesn't match the "
                      "Sandbox/Production choice, or a key was pasted in the wrong place.")
    if code:
        return code, f"Plaid said: {body.get('error_message') or code}"
    return "", f"Couldn't reach Plaid ({exc.__class__.__name__}). Check your internet connection."


def check_keys():
    """None if Plaid accepts the current keys, otherwise a plain-English problem."""
    try:
        _link_token(client())
        return None
    except Exception as e:  # noqa: BLE001 - shown to the user
        return plaid_problem(e)[1]


def setup():
    print("To pull in your SoFi transactions automatically, enter your Plaid keys.")
    print("Find them at https://dashboard.plaid.com  ->  Developers  ->  Keys.")
    print("No keys yet? Just press Return to skip - the app still works without them.\n")
    DATA.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        cid = input("STEP 1 of 3 - Paste your Plaid client ID and press Return: ").strip()
        if not cid:
            (DATA / ".skip").write_text("skipped bank connection\n")
            print("Skipped. Open AMH Finance and type k when you're ready to connect SoFi.")
            return False

        print("\nSTEP 2 of 3 - Which secret are you going to paste?")
        print("   S = Sandbox    (Plaid's pretend bank - good for a first test)")
        print("   P = Production (your real SoFi account)")
        env = ""
        while env not in ("sandbox", "production"):
            ans = input("   Type the letter S or P, then press Return: ").strip().lower()
            env = {"s": "sandbox", "sandbox": "sandbox", "p": "production", "production": "production"}.get(ans, "")
            if not env and len(ans) > 12:
                print("   That looks like a key. This step only needs the single letter S or P.")

        secret = ""
        while not secret:
            secret = _ask_hidden_after(f"\nSTEP 3 of 3 - Paste your {env.title()} secret and press Return: ")
            if secret == cid:
                print("   That's the client ID again - copy the one labelled Secret instead.")
                secret = ""
            elif not secret:
                print("   Nothing was pasted. Copy the secret from the Plaid page, then paste it here.")

        (DATA / ".skip").unlink(missing_ok=True)
        CONFIG_FILE.write_text(f"PLAID_CLIENT_ID={cid}\nPLAID_SECRET={secret}\nPLAID_ENV={env}\n")
        try:
            os.chmod(CONFIG_FILE, 0o600)
        except OSError:
            pass
        os.environ.update(PLAID_CLIENT_ID=cid, PLAID_SECRET=secret, PLAID_ENV=env)

        print("\nChecking your keys with Plaid...")
        problem = check_keys()
        if not problem:
            print("\u2713 Plaid accepted your keys.")
            return True
        print(f"\u2717 {problem}")
        CONFIG_FILE.unlink(missing_ok=True)
        if attempt < 2:
            print("Let's try again.\n")
    print("Setup didn't finish. Open AMH Finance again any time to retry.")
    return False


def client():
    import plaid
    from plaid.api import plaid_api

    load_config()
    if not os.environ.get("PLAID_CLIENT_ID") or not os.environ.get("PLAID_SECRET"):
        raise RuntimeError("Plaid keys missing. Run: python sofi_tracker.py setup")
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


def _link_token(c):
    from plaid.model.country_code import CountryCode
    from plaid.model.link_token_create_request import LinkTokenCreateRequest
    from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
    from plaid.model.products import Products

    req = LinkTokenCreateRequest(
        user=LinkTokenCreateRequestUser(client_user_id="me"),
        client_name="SoFi Tracker",
        products=[Products("transactions")],
        country_codes=[CountryCode("US")],
        language="en",
    )
    return c.link_token_create(req).link_token


def link():
    import plaid
    from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest

    c = client()
    try:
        link_token = _link_token(c)
    except Exception as e:  # noqa: BLE001
        code, msg = plaid_problem(e)
        print(msg)
        if code != "INVALID_API_KEYS" or not setup():
            raise SystemExit(1)
        c = client()
        link_token = _link_token(c)
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


# ---------- Local app server (computer-only use) ----------

def run_app(port=APP_PORT):
    """Serve the AMH Finance app at http://localhost:<port> with a small local API:
    GET /api/status, GET /api/export (stored data), POST /api/sync (pull from SoFi first).
    Listens on this computer only."""
    import functools
    from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

    allowed_hosts = {f"localhost:{port}", f"127.0.0.1:{port}"}

    class Handler(SimpleHTTPRequestHandler):
        def _ok_request(self):
            # Blocks other websites (incl. DNS-rebinding tricks) from reading your data.
            if self.headers.get("Host") not in allowed_hosts:
                self.send_error(403)
                return False
            return True

        def _json(self, data, code=200):
            body = json.dumps(data, default=str).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_GET(self):
            if not self._ok_request():
                return
            path = self.path.split("?")[0]
            if path == "/api/status":
                store = load_store()
                return self._json({"connected": TOKEN_FILE.exists(), "last_sync": store.get("last_sync"),
                                   "transactions": len(store.get("txns", {}))})
            if path == "/api/export":
                return self._json(build_export(load_store()))
            if path.startswith(("/.git", "/connector", "/api")):
                return self.send_error(404)
            return super().do_GET()

        def do_POST(self):
            if not self._ok_request():
                return
            if self.path.split("?")[0] != "/api/sync" or self.headers.get("X-AMH") != "1":
                return self.send_error(404)
            try:
                sync()
                self._json(build_export(load_store()))
            except Exception as e:  # show the reason in the app
                self._json({"error": str(e)}, 500)

        def log_message(self, *args):
            pass

    url = f"http://localhost:{port}"
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=str(APP_DIR)))
    except OSError:  # already running (e.g. opened twice)
        print(f"AMH Finance is already running - opening {url}")
        webbrowser.open(url)
        return
    print(f"AMH Finance is running at {url}  (press Ctrl+C to stop)")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


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
    if cmd == "setup":
        setup()
    elif cmd == "app":
        run_app()
    elif cmd == "link":
        link()
    elif cmd == "sync":
        print(json.dumps(sync(), indent=1))
    elif cmd == "export":
        print(json.dumps(export(sys.argv[2] if len(sys.argv) > 2 else None), indent=1))
    else:
        serve()
