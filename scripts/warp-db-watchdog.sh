#!/usr/bin/env bash
#
# Keep the database reachable through the WARP tunnel.
#
# The production Postgres at 10.0.1.36 is reached over Cloudflare WARP: the
# split tunnel has 10.0.1.36/32 on its include list, so the route is
# `10.0.1.36 dev CloudflareWARP table 65743`.
#
# The failure this guards against: warp-svc keeps reporting `Connected /
# healthy` while the tunnel is unusable — its DoH resolver timing out is one
# way in. Traffic for the database then falls back to the VPC path on ens5 and
# meets WARP's own firewall rule, `ip saddr 10.0.1.36 drop`, which throws the
# replies away. Connections hang rather than fail, so the site serves its HTML
# and every data request times out. Twice this was noticed by a person, hours
# later.
#
# Reconnecting rebuilds the route. This checks for the fault and does that, so
# the gap is a minute instead of a morning.
#
# The daily restart in /etc/cron.d/warp-restart predates this script and is the
# blunt version of the same idea. It is belt and braces now, not the mechanism.
#
# Installed by scripts/install-warp-db-watchdog.sh as a systemd timer, run as
# root once a minute.

set -uo pipefail

DB_HOST="${WARP_WATCHDOG_DB_HOST:-10.0.1.36}"
DB_PORT="${WARP_WATCHDOG_DB_PORT:-5432}"
LOG="${WARP_WATCHDOG_LOG:-/var/log/warp-db-watchdog.log}"

log() {
  printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >> "$LOG" 2>/dev/null || true
}

reachable() {
  nc -z -w3 "$DB_HOST" "$DB_PORT" >/dev/null 2>&1
}

# The healthy case, which is almost every run: say nothing, write nothing.
if reachable; then
  exit 0
fi

# A single failed probe is not proof — a reconnect is disruptive enough to be
# worth a second look before reaching for it.
sleep 5
if reachable; then
  exit 0
fi

log "DB unreachable at ${DB_HOST}:${DB_PORT} — route was: $(ip route get "$DB_HOST" 2>&1 | head -1 | tr -s ' ')"

warp-cli --accept-tos disconnect >/dev/null 2>&1
sleep 3
warp-cli --accept-tos connect >/dev/null 2>&1

for i in $(seq 1 10); do
  sleep 2
  if reachable; then
    log "recovered after reconnect (${i} checks) — route now: $(ip route get "$DB_HOST" 2>&1 | head -1 | tr -s ' ')"
    exit 0
  fi
done

# Reconnecting did not help, so this is something else and a person needs to
# look. Exiting non-zero marks the systemd unit failed, which is visible in
# `systemctl list-units --failed`.
log "STILL UNREACHABLE after reconnect — needs a human"
exit 1
