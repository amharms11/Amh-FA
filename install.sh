#!/bin/bash
# AMH Finance - one-step installer for Mac.
# Run it by pasting this into Terminal:
#   curl -fsSL https://raw.githubusercontent.com/amharms11/Amh-FA/main/install.sh | bash
# Running it again later updates the app. Your data is never touched.
set -euo pipefail

APP_HOME="$HOME/AMH Finance"
LAUNCHER="$HOME/Desktop/AMH Finance.command"
DOWNLOAD="https://codeload.github.com/amharms11/Amh-FA/tar.gz/refs/heads/main"

say()  { printf "\n\033[1;34m==>\033[0m \033[1m%s\033[0m\n" "$1"; }
fail() { printf "\n\033[1;31mSomething went wrong:\033[0m %s\n" "$1"; exit 1; }

say "Installing AMH Finance. This takes a few minutes."

# 1. Python. Macs get it with Apple's free "Command Line Tools".
python_ok() { python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1; }
if [ "$(uname)" = "Darwin" ] && ! xcode-select -p >/dev/null 2>&1 && ! python_ok; then
  say "Your Mac needs Apple's free developer tools first."
  echo "    A window will pop up. Click \"Install\", then \"Agree\"."
  echo "    It can take 5-15 minutes. Leave this window open - it continues automatically."
  xcode-select --install >/dev/null 2>&1 || true
  until xcode-select -p >/dev/null 2>&1; do sleep 10; done
fi
python_ok || fail "Python 3 is not available. Install it from https://www.python.org/downloads/ and run this again."
echo "    Python $(python3 -c 'import platform; print(platform.python_version())') found."

# 2. Download the app (replaces program files only; your data lives elsewhere).
say "Downloading the app..."
TMP="$(mktemp -d)"
curl -fsSL "$DOWNLOAD" | tar -xz -C "$TMP" || fail "Download failed. Check your internet connection and try again."
mkdir -p "$APP_HOME"
cp -R "$TMP"/*/. "$APP_HOME"/
rm -rf "$TMP"

# 3. Private Python environment with the bank connector's packages.
say "Installing the bank connector (read-only)..."
[ -x "$APP_HOME/.venv/bin/python" ] || python3 -m venv "$APP_HOME/.venv"
PY="$APP_HOME/.venv/bin/python"
"$PY" -m pip install --quiet --upgrade pip >/dev/null 2>&1 || true
"$PY" -m pip install --quiet "plaid-python" || fail "Could not install the Plaid package."
# The Claude Desktop connector part needs Python 3.10+; the app works without it.
if "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
  "$PY" -m pip install --quiet "mcp" || echo "    (Skipped the Claude Desktop add-on - the app still works.)"
fi

# 4. Desktop icon you double-click to open the app.
say "Adding \"AMH Finance\" to your Desktop..."
mkdir -p "$HOME/Desktop"
cat > "$LAUNCHER" <<'EOF'
#!/bin/bash
# Double-click to open AMH Finance. Keep the window open while you use it.
cd "$HOME/AMH Finance/connector" || { echo "AMH Finance isn't installed. Run the installer again."; read -r; exit 1; }
PY="$HOME/AMH Finance/.venv/bin/python"
clear
printf "\033[1mAMH Finance\033[0m\n\n"
if [ ! -f "$HOME/.sofi-tracker/config.env" ] && [ -f "$HOME/.sofi-tracker/.skip" ]; then
  echo "SoFi isn't connected. To connect it now, type  k  and press Return (or wait 5 seconds)."
  read -r -t 5 answer || true
  [ "${answer:-}" = "k" ] || [ "${answer:-}" = "K" ] && rm -f "$HOME/.sofi-tracker/.skip"
fi
if [ ! -f "$HOME/.sofi-tracker/config.env" ] && [ ! -f "$HOME/.sofi-tracker/.skip" ]; then
  "$PY" sofi_tracker.py setup
fi
if [ -f "$HOME/.sofi-tracker/config.env" ] && [ ! -f "$HOME/.sofi-tracker/item.json" ]; then
  echo; echo "Next: connect SoFi. Your browser will open - choose SoFi and sign in."
  "$PY" sofi_tracker.py link || echo "Connecting SoFi didn't finish. You can try again next time you open AMH Finance."
fi
echo
echo "Opening the app in your browser..."
echo "Keep this window open while you use AMH Finance. Close it when you're done."
"$PY" sofi_tracker.py app
EOF
chmod +x "$LAUNCHER"

say "Done! Opening AMH Finance..."
echo "    Next time, just double-click \"AMH Finance\" on your Desktop."
if [ "$(uname)" = "Darwin" ]; then open "$LAUNCHER"; fi
