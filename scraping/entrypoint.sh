#!/usr/bin/env bash
set -euo pipefail

# novel543 only clears its Cloudflare turnstile for a visible browser, so the browser
# needs a real X display. Xvfb is started directly rather than through xvfb-run: as
# PID 1 that wrapper wedges before it ever runs the command, and swallows the logs.
DISPLAY_NUM="${DISPLAY_NUM:-99}"
export DISPLAY=":${DISPLAY_NUM}"

# Xvfb compiles a keymap on startup and warns about keysyms this image's X server does
# not know (camera, marine and navigation keys). The server itself calls them non-fatal
# and nothing here uses a keyboard, so only those lines are dropped; the rest of Xvfb's
# stderr still reaches the log.
XKB_NOISE='XKEYBOARD keymap compiler|Could not resolve keysym|Errors from xkbcomp are not fatal'

Xvfb "$DISPLAY" -screen 0 1920x1080x24 -ac -nolisten tcp 2> >(grep -vE "$XKB_NOISE" >&2) &
XVFB_PID=$!
trap 'kill "$XVFB_PID" 2>/dev/null || true' EXIT

# The X socket appears a moment after the process starts; the browser fails without it.
for _ in $(seq 1 50); do
    [ -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ] && break
    sleep 0.2
done
if [ ! -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ]; then
    echo "Xvfb did not come up on ${DISPLAY}" >&2
    exit 1
fi
echo "Xvfb ready on ${DISPLAY}"

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
