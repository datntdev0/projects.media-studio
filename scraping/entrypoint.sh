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

# A container that is restarted rather than recreated keeps the /tmp it wrote last
# time, and Xvfb refuses to start while the display's lock file is there — the same
# stale-lock problem app/browser.py clears for Chromium's profile. The leftover
# socket is the worse half: it satisfies the readiness check below, so without this
# the server would be declared ready and every browser launch would then fail with
# "Missing X server or $DISPLAY".
rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}"

Xvfb "$DISPLAY" -screen 0 1920x1080x24 -ac -nolisten tcp 2> >(grep -vE "$XKB_NOISE" >&2) &
XVFB_PID=$!
trap 'kill "$XVFB_PID" 2>/dev/null || true' EXIT

# The X socket appears a moment after the process starts; the browser fails without
# it. The process is watched as well as the socket, so a server that dies on startup
# is reported here rather than one scrape later.
for _ in $(seq 1 50); do
    kill -0 "$XVFB_PID" 2>/dev/null || break
    [ -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ] && break
    sleep 0.2
done
if ! kill -0 "$XVFB_PID" 2>/dev/null; then
    echo "Xvfb exited on startup — ${DISPLAY} is not being served" >&2
    exit 1
fi
if [ ! -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ]; then
    echo "Xvfb did not come up on ${DISPLAY}" >&2
    exit 1
fi
echo "Xvfb ready on ${DISPLAY}"

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
