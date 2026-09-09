# Qase → QMaster live sync

Mirrors suites, cases, runs, results and evidence from Qase.io into QMaster as
they happen, driven by Qase webhooks.

This replaces re-running `scripts/migrate-qase.ts` by hand. The scripts are
still the right tool for the **first** import of a project; webhooks keep it
current afterwards.

## The one rule: sync only ever adds

Sync never overwrites and never deletes. It creates records that do not exist
yet, and fills fields that are still empty on records it created itself
(matched by `externalId`). Anything a person typed in QMaster is safe — the
worst a broken sync can do is fail to add something.

The one nuance is run results. Creating a run also creates a result row per
case, so by the time Qase reports an outcome the row already exists:

| Row state | What sync does |
| --- | --- |
| `IN_PROGRESS` (a placeholder sync made) | Fills in the verdict, comment, duration, evidence |
| Any real verdict (`PASSED`, `FAILED`, …) | **Leaves it alone**, logs it as SKIPPED with the reason |

Deleting a case in Qase leaves it in QMaster. That is deliberate: a run that
already references the case would otherwise lose its history.

## Setup

### 1. Environment

```bash
QASE_TOKEN=…            # already set — the same token the migration scripts use
QASE_WEBHOOK_SECRET=…   # new: any long random string, must match Qase exactly
```

Generate a secret with `openssl rand -hex 32`. Without `QASE_WEBHOOK_SECRET`
the endpoint rejects **every** delivery — an unconfigured receiver must not
accept anonymous writes.

### 2. Point a QMaster project at its Qase project

Sync is opt-in per project. Set `Project.qaseProjectCode` to the Qase project
code; a project without it is ignored (and its events logged as SKIPPED, so
you can see they arrived).

```sql
UPDATE "Project" SET "qaseProjectCode" = 'BO' WHERE code = 'BCP';
```

The column is unique, so one Qase project maps to exactly one QMaster project.

### 3. Add the webhook in Qase

Qase → **Settings → Webhooks → Create**:

| Field | Value |
| --- | --- |
| Endpoint | `https://tms.socket9.com/api/webhooks/qase` |
| Secret | the same `QASE_WEBHOOK_SECRET` |
| Events | test case, suite, test run and result events |

One endpoint handles every event; subscribe to as many as you like. Anything
without a handler is logged and ignored rather than failing.

Check the endpoint is live first — no event required:

```bash
curl https://tms.socket9.com/api/webhooks/qase
```

`configured: true` means the secret is set on the server.

### 4. Seed the project first

Webhooks only carry what changes **from now on**. Import the existing content
once, or the project starts empty and fills in only as cases are edited:

```bash
QASE_TOKEN=… QASE_PROJECT=BO TARGET_PROJECT=BCP npx tsx scripts/migrate-qase.ts --runs
QASE_TOKEN=… QASE_PROJECT=BO TARGET_PROJECT=BCP npx tsx scripts/migrate-attachments.ts
```

Both must run **on the AWS server** — the database and S3 bucket are not
reachable from a laptop. See `memory/prod-access-via-aws.md`.

## Watching it work

Every delivery is recorded in `QaseWebhookEvent` before it is acted on, so
"did Qase send it?" and "did we handle it?" are separate questions:

```sql
SELECT "receivedAt", "projectCode", "eventName", status, message
FROM "QaseWebhookEvent"
ORDER BY "receivedAt" DESC
LIMIT 20;
```

| Status | Meaning |
| --- | --- |
| `RECEIVED` | Stored, still processing (or the app died mid-flight) |
| `PROCESSED` | Applied — `message` says what changed |
| `SKIPPED` | Deliberately not applied — `message` says why |
| `FAILED` | The handler threw. `payload` is kept, so it can be replayed |

A `PROCESSED` result that could not copy its screenshots still says so:

```
Result for case 1 → PASSED. 1 attachment(s) FAILED — s3 shot.png: Could not load credentials
```

## Design notes

**Payloads are used only to identify what changed.** The record itself is
re-fetched from the REST API. Qase's payload shape varies between event types
and versions, but the API is the shape the migration scripts already handle —
so a renamed payload field cannot corrupt what is stored.

**Events for one project are processed one at a time** (`lib/qase/queue.ts`).
Qase delivers related events together, and handling them concurrently made
every "does this exist yet?" check race its neighbour — two handlers both found
no run and both created one. Different projects still run in parallel. This is
an in-process queue and assumes a **single** pm2 instance in fork mode; scaling
to multiple workers requires a database-level lock instead.

**The newest result wins.** Qase keeps every attempt, so one case in one run can
have several result records — a first pass, a `retest`, then the real one. Only
the newest carries the final verdict and screenshots.

**Qase's run detail endpoint does not return the case list**, only stats. The
roster comes from the run's results, which carry `case_id`.

**Run status:** `0 in_progress · 1 passed · 2 aborted · 3 failed`. Both `passed`
and `failed` are *finished* runs — the verdict lives on the results — so both
map to `COMPLETED`. A run's status is only ever advanced, never reopened.

## Known limits

- **Order matters on a cold project.** A run event arriving before its cases
  exist produces a run with a partial checklist; the missing cases are added
  only when their own result events arrive. Seeding with the migration script
  first (step 4) avoids this.
- **Deliveries missed while the app is down are not retried.** Qase does not
  redeliver on its own. Re-running the migration scripts closes any gap.
- **Edits in Qase are not mirrored**, by design — a renamed or re-written case
  keeps its original text in QMaster. The event is logged as SKIPPED so you can
  see what diverged.
