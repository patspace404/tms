#!/usr/bin/env bash
#
# Install the WARP/database watchdog as a systemd timer. Run on the prod host:
#
#   sudo bash ~/inhouse-qase-clone/scripts/install-warp-db-watchdog.sh
#
# Idempotent — running it again just refreshes the unit files. To remove it:
#
#   sudo systemctl disable --now warp-db-watchdog.timer
#   sudo rm /etc/systemd/system/warp-db-watchdog.{timer,service} /usr/local/bin/warp-db-watchdog.sh
#   sudo systemctl daemon-reload

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo." >&2
  exit 1
fi

SRC="$(cd "$(dirname "$0")" && pwd)/warp-db-watchdog.sh"
install -m 0755 "$SRC" /usr/local/bin/warp-db-watchdog.sh

cat > /etc/systemd/system/warp-db-watchdog.service <<'UNIT'
[Unit]
Description=Reconnect WARP when the production database stops being reachable
Documentation=https://gitlab.socket9.com/qa/tms scripts/warp-db-watchdog.sh
After=warp-svc.service
Wants=warp-svc.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/warp-db-watchdog.sh
UNIT

cat > /etc/systemd/system/warp-db-watchdog.timer <<'UNIT'
[Unit]
Description=Check every minute that the production database is reachable

[Timer]
# Not OnCalendar: the fault follows WARP's daily re-registration, so the check
# is a steady heartbeat rather than something tied to a wall-clock time.
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=10s
Unit=warp-db-watchdog.service

[Install]
WantedBy=timers.target
UNIT

touch /var/log/warp-db-watchdog.log
chmod 0644 /var/log/warp-db-watchdog.log

cat > /etc/logrotate.d/warp-db-watchdog <<'UNIT'
/var/log/warp-db-watchdog.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
}
UNIT

systemctl daemon-reload
systemctl enable --now warp-db-watchdog.timer

echo
echo "Installed. Next runs:"
systemctl list-timers warp-db-watchdog.timer --no-pager | head -3
