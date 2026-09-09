#!/usr/bin/env bash
#
# Nightly Qase → QMaster reconciliation, for cron.
#
# Runs scripts/qase-backfill.ts, which is additive and idempotent: it creates
# what is missing and never overwrites a verdict someone recorded, so running
# it every night is safe and a missed night simply catches up the next one.
#
# We reconcile on a schedule rather than relying on Qase webhooks because Qase
# does not redeliver: anything it sends while the app is down is lost for good.
# A full pass has no such gap.
#
# INSTALL (on the AWS server — the DB and S3 are inside the VPC):
#   crontab -e
#   # 02:00 Asia/Bangkok — the server clock is UTC, and Thailand has no DST
#   0 19 * * * /home/ubuntu/inhouse-qase-clone/scripts/qase-sync-cron.sh
#
set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${QASE_SYNC_LOG_DIR:-$HOME/qase-sync-logs}"
KEEP_DAYS="${QASE_SYNC_LOG_KEEP_DAYS:-30}"

mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$(date -u +%Y-%m-%d_%H%M)Z.log"

cd "$APP_DIR" || exit 1

# cron gets a bare PATH; node/npx live wherever nvm or the distro put them.
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin:$PATH"

# QASE_TOKEN and DATABASE_URL come from the app's own .env, so there is one
# place to rotate a credential rather than two.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

{
  echo "=== args: ${*:-(none)}"
  echo "=== Qase sync started $(date -u '+%Y-%m-%d %H:%M:%S')Z ($(TZ=Asia/Bangkok date '+%H:%M') Bangkok) ==="
  START=$(date +%s)

  # Arguments pass straight through, so the same wrapper can be used to check
  # the cron environment safely (`--dry-run`) or to sync one project by hand.
  npx tsx scripts/qase-backfill.ts "$@"
  STATUS=$?

  echo "=== finished in $(( $(date +%s) - START ))s, exit $STATUS ==="
  exit $STATUS
} >> "$LOG" 2>&1

STATUS=$?

# A one-line summary of every run, so "did last night work?" is one command:
#   tail ~/qase-sync-logs/summary.log
SUMMARY=$(grep -E "^\[.*ALL DONE" "$LOG" | tail -1)
printf '%s  exit=%s  %s\n' \
  "$(date -u '+%Y-%m-%d %H:%M')Z" "$STATUS" "${SUMMARY:-no summary — see $LOG}" \
  >> "$LOG_DIR/summary.log"

# Keep the logs bounded; a nightly job left alone fills a disk eventually.
find "$LOG_DIR" -name '*Z.log' -type f -mtime "+$KEEP_DAYS" -delete 2>/dev/null

exit $STATUS
