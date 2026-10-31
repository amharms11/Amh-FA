#!/bin/bash
# AMH Finance - one-step installer for Mac.
# Run it by pasting this into Terminal:
#   curl -fsSL https://raw.githubusercontent.com/amharms11/Amh-FA/main/install.sh | bash
# The Desktop icon re-runs this quietly (AMH_UPDATE=1) each time it opens, so the app stays up to date.
# Your data is never touched: it lives in your browser and in ~/.sofi-tracker.
set -euo pipefail

APP_HOME="$HOME/AMH Finance"
LAUNCHER="$HOME/Desktop/AMH Finance.command"
DOWNLOAD="https://codeload.github.com/amharms11/Amh-FA/tar.gz/refs/heads/main"
UPDATE="${AMH_UPDATE:-0}"

say()  { [ "$UPDATE" = 1 ] || printf "\n\033[1;34m==>\033[0m \033[1m%s\033[0m\n" "$1"; }
info() { [ "$UPDATE" = 1 ] || echo "$1"; }
fail() { printf "\n\033[1;31mSomething went wrong:\033[0m %s\n" "$1"; exit 1; }

say "Installing AMH Finance. This takes a few minutes."

# 1. Python. Macs get it with Apple's free "Command Line Tools".
python_ok() { python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1; }
if [ ! -x "$APP_HOME/.venv/bin/python" ]; then
  if [ "$(uname)" = "Darwin" ] && ! xcode-select -p >/dev/null 2>&1 && ! python_ok; then
    say "Your Mac needs Apple's free developer tools first."
    echo "    A window will pop up. Click \"Install\", then \"Agree\"."
    echo "    It can take 5-15 minutes. Leave this window open - it continues automatically."
    xcode-select --install >/dev/null 2>&1 || true
    until xcode-select -p >/dev/null 2>&1; do sleep 10; done
  fi
  python_ok || fail "Python 3 is not available. Install it from https://www.python.org/downloads/ and run this again."
  info "    Python $(python3 -c 'import platform; print(platform.python_version())') found."
fi

# 2. Download the app (replaces program files only).
say "Downloading the app..."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL --max-time 60 "$DOWNLOAD" | tar -xz -C "$TMP" || fail "Download failed. Check your internet connection and try again."
mkdir -p "$APP_HOME"
cp -R "$TMP"/*/. "$APP_HOME"/

# 3. Private Python environment. Packages are only reinstalled when the list changes.
[ -x "$APP_HOME/.venv/bin/python" ] || { say "Setting up Python..."; python3 -m venv "$APP_HOME/.venv"; }
PY="$APP_HOME/.venv/bin/python"
REQ="$APP_HOME/connector/requirements.txt"
STAMP="$APP_HOME/.venv/.amh-installed"
if ! cmp -s "$REQ" "$STAMP" 2>/dev/null; then
  say "Installing the bank connector and Claude add-on..."
  [ "$UPDATE" = 1 ] && echo "Installing an app update - one moment..."
  "$PY" -m pip install --quiet --upgrade pip >/dev/null 2>&1 || true
  "$PY" -m pip install --quiet -r "$REQ" || fail "Could not install the app's Python packages."
  # The Claude Desktop connector part needs Python 3.10+; the app works without it.
  if "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
    "$PY" -m pip install --quiet "mcp" >/dev/null 2>&1 || true
  fi
  cp "$REQ" "$STAMP"
fi

# 4. Desktop icon. Written to a temp file and moved into place, so updating it while it runs is safe.
say "Adding \"AMH Finance\" to your Desktop..."
mkdir -p "$HOME/Desktop"
NEW_LAUNCHER="$(mktemp "$HOME/Desktop/.amh-launcher.XXXXXX")"
cat > "$NEW_LAUNCHER" <<'EOF'
#!/bin/bash
# Double-click to open AMH Finance. Keep the window open while you use it.
APP="$HOME/AMH Finance"
PY="$APP/.venv/bin/python"
CFG="$HOME/.sofi-tracker"
clear
printf "\033[1mAMH Finance\033[0m\n\n"

# Get the latest version (quietly; skipped when offline).
echo "Checking for updates..."
UPD="$(mktemp)"
if curl -fsSL --max-time 20 https://raw.githubusercontent.com/amharms11/Amh-FA/main/install.sh -o "$UPD" \
   && AMH_UPDATE=1 bash "$UPD"; then
  echo "You have the latest version."
else
  echo "Couldn't check for updates - opening the version you have."
fi
rm -f "$UPD"

cd "$APP/connector" || { echo "AMH Finance isn't installed. Run the installer again."; read -r; exit 1; }

claude_cli() { command -v claude 2>/dev/null || { [ -x "$HOME/.local/bin/claude" ] && echo "$HOME/.local/bin/claude"; }; }
claude_ready() {
  grep -q '^ANTHROPIC_API_KEY=' "$CFG/config.env" 2>/dev/null && return 0
  CL="$(claude_cli)"; [ -n "$CL" ] && "$CL" auth status --json 2>/dev/null | grep -q '"loggedIn": *true'
}
setup_claude() {
  echo
  echo "Ask Claude lets you ask questions about your money inside the app."
  echo "It uses your Claude account - the same one you chat with."
  if [ -z "$(claude_cli)" ]; then
    echo; echo "Installing Claude Code (Anthropic's free helper program)..."
    curl -fsSL https://claude.ai/install.sh | bash || { echo "Install didn't finish - try again next time."; return; }
  fi
  CL="$(claude_cli)"
  [ -n "$CL" ] || { echo "Couldn't find Claude Code after installing. Try again next time."; return; }
  echo; echo "Your browser will open. Sign in to Claude and click Authorize, then come back here."
  "$CL" auth login || echo "Sign-in didn't finish - you can try again next time."
}

# Offer to connect anything that isn't set up yet.
MENU=""
[ -f "$CFG/item.json" ] || MENU="$MENU   k = connect SoFi\n"
claude_ready || MENU="$MENU   c = set up Ask Claude\n"
if [ -n "$MENU" ]; then
  echo; printf "Optional:\n$MENU"
  echo "Type a letter and press Return, or just wait 6 seconds to open the app."
  read -r -t 6 answer || true
  case "${answer:-}" in
    k|K) rm -f "$CFG/.skip"
         { [ -f "$CFG/config.env" ] || "$PY" sofi_tracker.py setup; } && "$PY" sofi_tracker.py link \
           || echo "Connecting SoFi didn't finish. You can try again next time." ;;
    c|C) setup_claude ;;
  esac
fi

echo
echo "Opening the app in your browser..."
echo "Keep this window open while you use AMH Finance. Close it when you're done."
"$PY" sofi_tracker.py app
EOF
chmod +x "$NEW_LAUNCHER"
mv -f "$NEW_LAUNCHER" "$LAUNCHER"

# 5. Automatic sync with SoFi at 7:00 am and 8:00 pm (a macOS launch agent; runs even when the app is closed).
#    If the Mac is asleep at that time, macOS runs it as soon as the Mac wakes up.
if [ "$(uname)" = "Darwin" ]; then
  AGENT="$HOME/Library/LaunchAgents/com.amhfinance.autosync.plist"
  mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.sofi-tracker"
  NEW_AGENT="$(mktemp)"
  cat > "$NEW_AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.amhfinance.autosync</string>
  <key>ProgramArguments</key>
  <array>
    <string>$APP_HOME/.venv/bin/python</string>
    <string>$APP_HOME/connector/sofi_tracker.py</string>
    <string>autosync</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>StandardOutPath</key><string>$HOME/.sofi-tracker/autosync-output.log</string>
  <key>StandardErrorPath</key><string>$HOME/.sofi-tracker/autosync-output.log</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
PLIST
  if ! cmp -s "$NEW_AGENT" "$AGENT" 2>/dev/null || ! launchctl print "gui/$(id -u)/com.amhfinance.autosync" >/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)" "$AGENT" >/dev/null 2>&1 || true
    mv -f "$NEW_AGENT" "$AGENT"
    launchctl bootstrap "gui/$(id -u)" "$AGENT" >/dev/null 2>&1 || launchctl load -w "$AGENT" >/dev/null 2>&1 || true
    info "    Automatic SoFi sync set for 7:00 am and 8:00 pm every day."
  else
    rm -f "$NEW_AGENT"
  fi
fi

if [ "$UPDATE" != 1 ]; then
  say "Done! Opening AMH Finance..."
  echo "    Next time, just double-click \"AMH Finance\" on your Desktop."
  if [ "$(uname)" = "Darwin" ]; then open "$LAUNCHER"; fi
fi
