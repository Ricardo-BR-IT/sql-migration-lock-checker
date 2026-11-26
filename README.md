# SQL Migration Lock & Safety Checker

> **Category:** Database Ops | **Pricing:** $39/mo per organization | **Vendor:** Ricardo Vieira Forge Cloud

## Why Use This Action?

A single `CREATE INDEX` without `CONCURRENTLY` or `ALTER TABLE ADD COLUMN NOT NULL` locks production tables for minutes, causing outages.

**Competitive Edge:** Most teams only catch locking DDL in production; lightweight static SQL migration gating in GitHub PRs is severely underserved.

## Quick Start (Copy-Paste Workflow)

```yaml
name: SQL Migration Lock & Safety Checker
on: [pull_request]

jobs:
  sql-safety:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Audit SQL Migrations
        uses: ricardovieiraforge/sql-migration-lock-checker@v1
        with:
          migrations-dir: 'migrations'
          fail-on-error: 'true'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `migrations-dir` | Directory containing .sql migration files | `False` | `migrations` |
| `fail-on-error` | Fail workflow if table-locking DDL is detected | `False` | `true` |

## Outputs

| Output | Description |
|--------|-------------|
| `issues-count` | Number of unsafe SQL statements detected |
| `safe` | true if no unsafe DDL/DML detected |

## Local Verification

```bash
node --check src/index.js
node src/index.js --self-test
```

## License

MIT — Built by Ricardo Vieira Forge Cloud (souza@usa.com).
