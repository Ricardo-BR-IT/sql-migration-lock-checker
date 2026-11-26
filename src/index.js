'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function getInput(name, fallback = '') {
  const key = 'INPUT_' + name.replace(/ /g, '_').toUpperCase();
  return (process.env[key] ?? fallback).trim();
}

function setOutput(name, value) {
  const outFile = process.env.GITHUB_OUTPUT;
  if (outFile) fs.appendFileSync(outFile, `${name}=${String(value)}\n`, 'utf8');
}

function writeSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) fs.appendFileSync(summaryFile, markdown + '\n', 'utf8');
}

const SQL_RULES = [
  { id: 'INDEX_WITHOUT_CONCURRENTLY', severity: 'error', msg: 'CREATE INDEX without CONCURRENTLY locks table writes', test: (s) => /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(s) && !/\bCONCURRENTLY\b/i.test(s) },
  { id: 'ADD_NOT_NULL_NO_DEFAULT', severity: 'error', msg: 'ALTER TABLE ADD COLUMN NOT NULL without DEFAULT causes full table rewrite', test: (s) => /\bALTER\s+TABLE\b[\s\S]*\bADD\s+(?:COLUMN\s+)?[\w"]+\s+[\w()]+[\s\S]*\bNOT\s+NULL\b/i.test(s) && !/\bDEFAULT\b/i.test(s) },
  { id: 'DESTRUCTIVE_DROP', severity: 'warning', msg: 'DROP TABLE or DROP COLUMN breaks zero-downtime rolling deploys', test: (s) => /\bDROP\s+(?:TABLE|COLUMN)\b/i.test(s) },
  { id: 'TRUNCATE_TABLE', severity: 'error', msg: 'TRUNCATE acquires ACCESS EXCLUSIVE lock and wipes data', test: (s) => /\bTRUNCATE\s+(?:TABLE\s+)?/i.test(s) },
  { id: 'UNFILTERED_DML', severity: 'error', msg: 'UPDATE or DELETE without WHERE clause affects entire table', test: (s) => /^\s*(?:UPDATE\s+\S+\s+SET|DELETE\s+FROM)\b/i.test(s) && !/\bWHERE\b/i.test(s) },
];

function scanSqlDir(dir) {
  if (!fs.existsSync(dir)) return { files: 0, issues: [] };
  const sqlFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => path.join(dir, f));
  const issues = [];

  for (const file of sqlFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const stmts = content.split(';');
    let lineOffset = 1;
    for (const stmt of stmts) {
      const trimmed = stmt.trim();
      if (trimmed) {
        for (const rule of SQL_RULES) {
          if (rule.test(trimmed)) {
            issues.push({
              file: path.relative(dir, file) || path.basename(file),
              line: lineOffset,
              rule: rule.id,
              severity: rule.severity,
              message: rule.msg,
            });
          }
        }
      }
      lineOffset += (stmt.match(/\n/g) || []).length;
    }
  }
  return { files: sqlFiles.length, issues };
}

function runSelfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-lock-'));
  try {
    fs.writeFileSync(path.join(tmp, '001_idx.sql'), 'CREATE INDEX idx_users_email ON users(email);\nDELETE FROM sessions;\n', 'utf8');
    const res = scanSqlDir(tmp);
    if (res.issues.length < 2) {
      throw new Error(`Expected >= 2 SQL issues, got ${res.issues.length}`);
    }
    console.log(`[SELF-TEST OK] sql-migration-lock-checker caught ${res.issues.length} locking/unsafe statements.`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes('--self-test')) return runSelfTest();

  const dir = getInput('migrations-dir', 'migrations');
  const failOnError = getInput('fail-on-error', 'true').toLowerCase() !== 'false';
  const res = scanSqlDir(dir);

  for (const iss of res.issues) {
    console.log(`::${iss.severity} file=${iss.file},line=${iss.line}::[${iss.rule}] ${iss.message}`);
  }

  const hasErrors = res.issues.some((i) => i.severity === 'error');
  const safe = !hasErrors;
  setOutput('issues-count', res.issues.length);
  setOutput('safe', safe ? 'true' : 'false');

  const lines = [
    '## SQL Migration Lock & Safety Checker',
    '',
    `- **SQL Files Scanned:** ${res.files} | **Issues Found:** ${res.issues.length} | **Status:** ${safe ? 'SAFE' : 'UNSAFE'}`,
    '',
  ];
  if (res.issues.length > 0) {
    lines.push('| File | Line | Severity | Rule | Message |');
    lines.push('|------|------|----------|------|---------|');
    for (const i of res.issues) lines.push(`| \`${i.file}\` | ${i.line} | ${i.severity.toUpperCase()} | ${i.rule} | ${i.message} |`);
  }
  writeSummary(lines.join('\n'));

  if (!safe && failOnError) process.exitCode = 1;
}

main();
