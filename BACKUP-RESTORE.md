# Database Backup and Restore Procedure - Eagles Eye

## 1. Backup Strategy

Eagles Eye uses PostgreSQL as the source of truth. Backups are required:

- **Before every production migration** (mandatory per DEPLOYMENT.md)
- **Daily** (recommended for production)
- **Before any destructive admin operation** in bulk
- **On-demand** before schema changes

Recommended: Point-in-time recovery (PITR) enabled on managed PostgreSQL (AWS RDS, Cloud SQL, etc.). Also take logical dumps before migrations as an extra safety net.

---

## 2. Automated Daily Backup (Recommended)

For managed PostgreSQL providers:
- **AWS RDS:** Enable automated backups with retention ≥7 days, PITR enabled
- **Google Cloud SQL:** Automated backups + point-in-time recovery
- **Azure Database:** Long-term retention + PITR
- **Neon/Supabase:** Follow provider backup policy

---

## 3. Manual Logical Backup (Before Migrations)

### Prerequisites

- `pg_dump` installed locally or on backup host
- Production DB connection details (read-only preferred, or admin)
- SSL required in production

### Command

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="eagles-eye-backup-${TIMESTAMP}.dump"

pg_dump --format=custom --no-owner --no-privileges \
  --compress=9 \
  "postgresql://<username>:<password>@<host>:<port>/<database>?sslmode=require" \
  -f "${BACKUP_FILE}"
```

### Verification

```bash
# Check file size
ls -lh "${BACKUP_FILE}"

# Test restore list (doesn't restore)
pg_restore --list "${BACKUP_FILE}" | head -30
```

**Storage:** Encrypt backup file at rest and store in secure off-site location. Never commit to git.

---

## 4. Restore Procedure

**CRITICAL:** Restoring overwrites target database. Stop all writes first.

### 1. Stop Application

```bash
# Prevent new writes during restore
systemctl stop eagles-eye  # systemd
# or pm2 stop eagles-eye
```

### 2. Prepare Target Database (If needed)

For clean restore to existing DB:
```bash
# Connect and terminate active connections
psql "postgresql://<user>:<pass>@<host>:<port>/<db>?sslmode=require" << 'EOF'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid();
EOF
```

### 3. Restore from Dump

```bash
BACKUP_FILE="eagles-eye-backup-YYYYMMDD-HHMMSS.dump"

pg_restore --clean --if-exists --no-owner --no-privileges \
  --jobs=4 \
  --dbname="postgresql://<user>:<pass>@<host>:<port>/<db>?sslmode=require" \
  "${BACKUP_FILE}"
```

Options:
- `--clean` — drop objects before recreating (clean slate)
- `--if-exists` — don't error if objects don't exist
- `--no-owner` — ignore original ownership
- `--no-privileges` — don't restore grants
- `--jobs=N` — parallel restore for large DBs

### 4. Verify Restore

```bash
psql "postgresql://<user>:<pass>@<host>:<port>/<db>?sslmode=require" << 'EOF'
-- Core entity counts
SELECT 'Story' as table, COUNT(*) FROM "Story" UNION ALL
SELECT 'Chapter', COUNT(*) FROM "Chapter" UNION ALL
SELECT 'Category', COUNT(*) FROM "Category" UNION ALL
SELECT 'Tag', COUNT(*) FROM "Tag" UNION ALL
SELECT 'User', COUNT(*) FROM "User" UNION ALL
SELECT 'Session', COUNT(*) FROM "Session";

-- Check for orphaned sessions
SELECT COUNT(*) FROM "Session" WHERE "revokedAt" IS NULL AND "expiresAt" < NOW();

-- Verify latest story
SELECT title, status, "publishedAt" FROM "Story" ORDER BY "updatedAt" DESC LIMIT 5;
EOF
```

### 5. Restart Application

```bash
systemctl start eagles-eye
```

### 6. Smoke Test

Run critical smoke tests from DEPLOYMENT.md step 7. Focus on:
- Public content visibility (published only)
- Admin login works
- Stories/chapters readable
- Images load

---

## 5. Point-in-Time Recovery (PITR)

For managed providers with PITR enabled:

1. Determine recovery time (just before incident)
2. Use provider console/API to restore to point-in-time
3. Restore to new instance first, verify, then promote
4. Follow provider-specific PITR procedure

---

## 6. Retention Policy

**Recommended minimums:**
- Pre-migration dumps: Keep until next successful deploy + 30 days
- Daily backups: 7-30 days (depending on compliance)
- Weekly full backups: 90 days
- Monthly archives: 12 months (if compliance requires)

Encrypt all stored backups. Test restore quarterly to verify backup integrity.

---

## 7. Emergency Notes

- **Never restore over production without stopping writes**
- **Test restore in isolated staging environment first** if time permits
- **Document:** backup filename, restore time, who performed, reason
- **Checksum:** Consider `sha256sum` for backup files
- **SSL:** Always use `sslmode=require` for production connections
