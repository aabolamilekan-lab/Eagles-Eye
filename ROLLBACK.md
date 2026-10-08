# Rollback Procedure - Eagles Eye

This document outlines rollback procedures for both application and database. Rollbacks must be performed manually with careful verification.

## 1. Application Rollback

If the new deployment has issues but database is fine:

### Option A: Redeploy Previous Artifact

1. Identify the last known-good build artifact (from previous deployment)
2. Restore previous `.next`, `public/`, `package.json`, `node_modules` (or standalone build)
3. Restart application with same environment variables
4. Run smoke tests (see DEPLOYMENT.md)
5. Monitor logs

### Option B: Revert in Container/Platform

If using containerized deployment:
1. Roll container image/tag back to previous known-good
2. Restart with same env/config
3. Verify health

**Notes:**
- Database migrations that ran are forward-only. Rolling back app without rolling back DB is safe if DB schema is compatible with previous app version.
- If migrations introduced breaking schema changes, DB rollback is also required.

---

## 2. Database Rollback

**WARNING:** Database rollbacks are destructive and risky. Only perform if data corruption or breaking migration occurred.

### Prerequisites

- Pre-migration backup exists (from DEPLOYMENT.md step 2)
- Downtime window approved (write operations must be stopped)
- Verified backup integrity

### Procedure

1. **Stop application** to prevent writes:
```bash
# Stop Next.js process (PM2/systemd)
systemctl stop eagles-eye  # or pm2 stop
```

2. **Verify backup**
```bash
# List backup info (pg_restore --list)
pg_restore --list eagles-eye-predeploy-YYYYMMDD-HHMMSS.dump > /tmp/backup_manifest.txt
```

3. **Restore database** (TARGET DATABASE WILL BE OVERWRITTEN)
```bash
# Drop and recreate schema (clean restore) or restore to point
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="postgresql://<user>:<pass>@<host>:<port>/<db>?sslmode=require" \
  eagles-eye-predeploy-YYYYMMDD-HHMMSS.dump
```

4. **Verify restoration**
```bash
# Connect and verify counts
psql "..." -c "SELECT COUNT(*) FROM \"Story\";"
psql "..." -c "SELECT COUNT(*) FROM \"User\";"
psql "..." -c "SELECT COUNT(*) FROM \"Session\";"
```

5. **Redeploy previous app version** (compatible with restored schema)
6. **Start application**
```bash
systemctl start eagles-eye
```

7. **Smoke test** all critical flows
8. **Document incident** (what failed, what was restored, when)

---

## 3. Rollback Decision Matrix

| Scenario | App Rollback | DB Rollback | Notes |
|---|---|---|---|
| UI/logic bug, no schema change | ✅ | ❌ | Safe, common |
| Migration failed mid-way | ⚠️ | Depends | May need to fix migration or restore |
| Data corruption from code | ❌ | ✅ | Restore from backup + fix code |
| Security issue in code | ✅ | ❌ | If no DB impact |
| Breaking schema + code mismatch | ✅ | ✅ | Restore both to known-good |

---

## 4. Emergency Contacts & Logging

- Log all rollback actions with timestamp, actor, reason
- Capture application logs before/after
- Preserve failed migration SQL and error messages
- Document root cause for post-mortem

**REMEMBER:** Never edit applied migrations. Create new corrective migrations forward.
