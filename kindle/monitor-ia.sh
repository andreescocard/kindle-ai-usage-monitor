#!/bin/sh
# Name: AI Monitor
# Author: aescocard
# Shows Claude Code / Codex usage limits rendered by kindle-monitor/server.py on the Beelink.
# Touch the screen (or press power) to exit.

BASE="http://192.168.10.31:8788"
INTERVAL=300
# Turn Wi-Fi off between updates: an awake Kindle with Wi-Fi on is what drains the battery.
WIFI_SAVE=1
FBINK=/mnt/us/libkh/bin/fbink
command -v fbink >/dev/null 2>&1 && FBINK=fbink
IMG=/tmp/monitor-ia.png
STOP=/tmp/monitor-ia.stop
LOG=/mnt/us/monitor-ia.log

get() { # get URL OUTFILE
    if command -v curl >/dev/null 2>&1; then
        curl -fsS -m 15 -o "$2" "$1"
    else
        wget -q -T 15 -O "$2" "$1"
    fi
}

# Log locally and to the Beelink (best effort, never blocks for long).
rlog() {
    echo "$(date) $*" >>"$LOG"
    get "$BASE/log?m=$(echo "$*" | tr -c 'A-Za-z0-9._:/=-' '+')" /dev/null 2>/dev/null &
}

battery() {
    lipc-get-prop com.lab126.powerd battLevel 2>/dev/null || gasgauge-info -c 2>/dev/null | tr -dc 0-9
}

wifi_on() {
    lipc-set-prop com.lab126.cmd wirelessEnable 1 2>/dev/null
    i=0
    while [ $i -lt 40 ] && [ ! -f "$STOP" ]; do
        [ "$(lipc-get-prop com.lab126.wifid cmState 2>/dev/null)" = "CONNECTED" ] && return 0
        sleep 1
        i=$((i + 1))
    done
    return 1
}

wifi_off() {
    [ "$WIFI_SAVE" = 1 ] && lipc-set-prop com.lab126.cmd wirelessEnable 0 2>/dev/null
}

fetch() {
    get "$BASE/kindle.png?bat=$(battery)&chg=$(lipc-get-prop com.lab126.powerd isCharging 2>/dev/null)" "$IMG.new"
}

run() {
    rm -f "$STOP" "$IMG"
    rlog "start bat=$(battery)"
    lipc-set-prop com.lab126.powerd preventScreenSaver 1
    lipc-set-prop com.lab126.cmd wirelessEnable 1 2>/dev/null
    # Freeze the Kindle UI (the cvm Java process) so it doesn't redraw over the monitor or react to
    # taps. Resuming it on exit takes seconds; restarting lab126_gui takes about a minute.
    # Without cvm, fall back to stopping the UI.
    PAUSED=0
    if killall -STOP cvm 2>/dev/null; then
        PAUSED=1
        # The status bar (pillow) runs outside cvm and keeps drawing the clock: hide it too.
        lipc-set-prop com.lab126.pillow disableEnablePillow disable 2>/dev/null
    else
        stop lab126_gui 2>/dev/null || stop framework 2>/dev/null
    fi
    rlog "ui paused=$PAUSED app=$(lipc-get-prop com.lab126.appmgrd activeApp 2>/dev/null)"
    sleep 2
    $FBINK -q -c -f -m -y 20 "AI Monitor - connecting..."

    # Any input event (touch, power button) ends the monitor.
    for e in /dev/input/event*; do
        (head -c 1 "$e" >/dev/null 2>&1 && touch "$STOP") &
    done

    n=0
    fails=0
    while [ ! -f "$STOP" ]; do
        wifi_on
        if fetch; then
            fails=0
            wifi_off
            # Turning Wi-Fi off makes the Kindle draw its airplane icon a moment later, so wait for it
            # and always redraw (unchanged content redraws without a visible flash).
            sleep 3
            if ! cmp -s "$IMG.new" "$IMG"; then
                mv "$IMG.new" "$IMG"
                n=$((n + 1))
            fi
            # Full flashing refresh every 10 updates to clear e-ink ghosting.
            if [ $((n % 10)) -eq 1 ] && [ "$n" != "$flashed" ]; then
                $FBINK -q -f -g file="$IMG"
                flashed=$n
            else
                $FBINK -q -g file="$IMG"
            fi
        else
            fails=$((fails + 1))
            echo "$(date) fetch failed ($fails)" >>"$LOG"
            if [ $fails -eq 2 ]; then
                if [ -f "$IMG" ]; then
                    $FBINK -q -m -y -3 "Beelink offline - showing last data"
                else
                    $FBINK -q -m -y 22 "No connection - check Wi-Fi (tap to exit)"
                fi
            fi
        fi
        # Retry quickly while offline (e.g. Wi-Fi still reconnecting after USB).
        wait_s=$INTERVAL
        [ $fails -gt 0 ] && wait_s=10
        i=0
        while [ $i -lt $wait_s ] && [ ! -f "$STOP" ]; do
            sleep 1
            i=$((i + 1))
        done
    done

    pkill -f "head -c 1 /dev/input" 2>/dev/null
    # Leave Wi-Fi on for normal use (and for the remote log).
    wifi_on
    rlog "exit requested"
    $FBINK -q -c -f -m -y 20 "Exiting AI Monitor..."
    [ "$PAUSED" = 1 ] || $FBINK -q -m -y 22 "the Kindle screen returns in about 1 minute"
    lipc-set-prop com.lab126.powerd preventScreenSaver 0
    rm -f "$STOP" "$IMG" "$IMG.new"

    if [ "$PAUSED" = 1 ]; then
        # Let the exit tap finish first so it doesn't land on the library once the UI wakes up.
        sleep 1
        killall -CONT cvm 2>/dev/null
        lipc-set-prop com.lab126.pillow disableEnablePillow enable 2>/dev/null
        # The monitor drew straight to the framebuffer, so ask X to repaint every window.
        if command -v xrefresh >/dev/null 2>&1; then
            DISPLAY=:0 xrefresh 2>/dev/null
        fi
        i=0
        app=""
        while [ $i -lt 10 ]; do
            app=$(lipc-get-prop com.lab126.appmgrd activeApp 2>/dev/null)
            case "$app" in *KPPMainApp*) break ;; esac
            sleep 1
            i=$((i + 1))
        done
        rlog "ui resumed after ${i}s app=$app xrefresh=$(command -v xrefresh)"
        case "$app" in *KPPMainApp*)
            sleep 1
            $FBINK -q -s -f
            rlog "exit done"
            return
            ;;
        esac
        # The UI didn't come back from the pause: fall back to a full restart.
        $FBINK -q -m -y 22 "the Kindle screen returns in about 1 minute"
        stop lab126_gui 2>/dev/null || stop framework 2>/dev/null
        sleep 3
    fi
    start lab126_gui 2>/dev/null || start framework 2>/dev/null
    rlog "gui start returned: $(status lab126_gui 2>&1)"

    # Wait for the library app (KPPMainApp) to come back; this takes about a minute. activeApp can
    # still report the scriptlet launcher right after the restart, so that value doesn't count.
    # Don't launch app://com.lab126.booklet.home: it doesn't exist on this firmware and shows
    # "the selected application could not be started".
    # If it never shows up (the UI can come back with the scriptlet launcher stuck in front), restart
    # the UI once more and wait again instead of leaving the exit message on screen.
    for attempt in 1 2; do
        sleep 15
        i=15
        app=""
        while [ $i -lt 150 ]; do
            app=$(lipc-get-prop com.lab126.appmgrd activeApp 2>/dev/null)
            case "$app" in *KPPMainApp*) break 2 ;; esac
            sleep 2
            i=$((i + 2))
        done
        [ $attempt = 2 ] && break
        rlog "library missing after ${i}s app=$app, restarting gui"
        $FBINK -q -m -y 24 "still loading, restarting the Kindle screen..."
        stop lab126_gui 2>/dev/null || stop framework 2>/dev/null
        sleep 3
        start lab126_gui 2>/dev/null || start framework 2>/dev/null
    done
    rlog "ui ready after ${i}s (attempt $attempt) app=$app"
    # Full-screen flash refreshes so whatever the UI drew becomes visible; repeat once in case it
    # was still painting.
    sleep 5
    $FBINK -q -s -f
    sleep 10
    $FBINK -q -s -f
    rlog "exit done"
}

# Self-update: replace this file with the Beelink's copy when it differs, then restart from it.
if [ "$1" != "--run" ] && [ "$1" != "--updated" ]; then
    if get "$BASE/monitor-ia.sh" /tmp/monitor-ia.sh.new 2>/dev/null && head -1 /tmp/monitor-ia.sh.new | grep -q '^#!/bin/sh' \
        && ! cmp -s /tmp/monitor-ia.sh.new "$0"; then
        cat /tmp/monitor-ia.sh.new >"$0" && echo "$(date) updated script" >>"$LOG"
        rm -f /tmp/monitor-ia.sh.new
        exec sh "$0" --updated
    fi
    rm -f /tmp/monitor-ia.sh.new
fi

# Detach so the scriptlet launcher returns immediately.
if [ "$1" != "--run" ]; then
    setsid sh "$0" --run >>"$LOG" 2>&1 </dev/null &
    exit 0
fi
run
