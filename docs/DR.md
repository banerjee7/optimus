# Kiln backup and disaster recovery runbook

**Owner:** Bidyut Banerjee · <bidyut.banerjee@gmail.com> · +91-8297140808

## Scope

Kiln's authoritative server state is one JSON document. In production it lives in the private Vercel Blob object `kiln/db.json`; the local cache is disposable. Uploaded/generated exports are regenerated from that state. The recovery objective is a valid, checksummed snapshot restored to the primary Blob path.

## Backups

- An administrator creates a snapshot from **Operations** or `POST /api/admin/backups`.
- Snapshots are written to `kiln/backups/<backup-id>.json` in the same private Blob store.
- Every snapshot records its SHA-256 checksum, byte size, actor and timestamp in `db.backups`.
- The latest 20 snapshots are retained. Older objects and metadata are deleted.
- A pre-restore safety snapshot is always created before a restore.
- Scheduled backups can be queued with `POST /api/admin/jobs/run` after enqueueing `backup.create`, or with the cron endpoint below.

```bash
curl -X POST https://kiln-kohl.vercel.app/api/internal/jobs/run \
  -H "Authorization: Bearer $KILN_CRON_SECRET"
```

## Restore

1. Sign in as the configured `KILN_ADMIN_EMAIL` account.
2. Open **Operations → Backups** and choose a snapshot, or call:

```bash
curl -X POST https://kiln-kohl.vercel.app/api/admin/backups/<backup-id>/restore \
  -H "Cookie: kiln_session=<admin-session>"
```

3. Kiln downloads the snapshot, verifies its checksum and required collections, writes a safety snapshot, then replaces the current database.
4. Confirm `/api/health`, `/api/status` and the console load. Verify recent users, projects and billing records.
5. If the wrong snapshot was chosen, restore the pre-restore safety snapshot listed in the response.

## Verification

- `GET /api/admin/backups` shows the snapshot list and retention status.
- `GET /api/admin/observability` shows queue depth, storage mode and the latest backup timestamp.
- A checksum mismatch returns `409 BACKUP_CORRUPT` and writes nothing.
- A missing snapshot object returns `404` and writes nothing.

## Failure modes

| Failure | Response |
| --- | --- |
| Blob write fails | Backup endpoint returns an error; current database is untouched. |
| Blob read fails | Restore aborts before `replaceDb`. |
| Checksum mismatch | Restore aborts with `BACKUP_CORRUPT`. |
| Bad JSON or wrong schema | Restore aborts with `422`. |
| Restore succeeds but app is wrong | Restore the pre-restore safety snapshot. |
| Blob store unavailable | The API remains available on the local cache but durability is degraded; do not accept writes you cannot lose. Restore service before continuing. |

## Local development

Without `BLOB_READ_WRITE_TOKEN`, snapshots are written under `KILN_DATA_DIR/backups/`. This is useful for testing but is not durable on Vercel.

## Test-mode caveats

Billing, transactional email and CRM integration remain explicitly in test mode until real Stripe, email-provider and CRM credentials are configured. Backups still capture the state those test-mode flows created.
