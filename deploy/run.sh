#!/bin/sh
# Start the Kindle PNG renderer unless it is already running (used by cron @reboot and as a watchdog).
pgrep -f "kindle-monitor/server.py" >/dev/null && exit 0
cd ~/kindle-monitor && nohup ~/.local/bin/uv run --script server.py >>~/kindle-monitor/server.log 2>&1 &
