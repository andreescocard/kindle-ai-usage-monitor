#!/bin/sh
# Start the Kindle PNG renderer unless it is already running (used by cron @reboot and as a watchdog).
# Checks the port, not the process name: uv runs it as plain "python server.py", so pgrep on the path never matched.
ss -ltn | grep -q ":${PORT:-8788} " && exit 0
cd ~/kindle-monitor && nohup ~/.local/bin/uv run --script server.py >>~/kindle-monitor/server.log 2>&1 &
