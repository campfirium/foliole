#!/usr/bin/env node
/* global console */
import { readFileSync } from 'node:fs';
import { delimiter, relative } from 'node:path';
import { cwd, env, exit } from 'node:process';
import { execFileSync } from 'node:child_process';

const DEFAULT_ROOTS = [
  'electron/database',
  'electron/sync',
  'android/app/src/main/java/com/foliole/android',
  'ios',
  'lib/core/sync',
  'src/shared/platform'
];

const CAPABILITIES = [
  ['attach', /\bATTACH\s+DATABASE\b/i],
  ['detach', /\bDETACH\s+DATABASE\b/i],
  ['crossDatabaseReference', /\b(?:main|inc|incoming)\.[A-Za-z_][\w]*\b/i],
  ['insertSelect', /\bINSERT(?:\s+OR\s+REPLACE)?\s+INTO[\s\S]{0,600}\bSELECT\b/i],
  ['upsertReplace', /\bINSERT\s+OR\s+REPLACE\b/i],
  ['deleteThenInsert', /\bDELETE\s+FROM\b/i],
  ['explicitTransaction', /\b(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i],
  ['join', /\b(?:JOIN|LEFT\s+JOIN|INNER\s+JOIN)\b/i],
  ['exists', /\bEXISTS\s*\(/i],
  ['union', /\bUNION\b/i],
  ['cte', /\bWITH\s+(?:RECURSIVE\s+)?[A-Za-z_][\w]*\s+AS\b/i],
  ['pragma', /\bPRAGMA\b/i],
  ['sqliteMaster', /\bsqlite_master\b/i],
  ['changesFunction', /\bchanges\s*\(/i],
  ['blobTable', /\b(?:content_blob_data|attachment_blobs)\b/i],
  ['fts', /\bFTS5\b|\bMATCH\b/i],
  ['returning', /\bRETURNING\b/i],
  ['vacuum', /\bVACUUM\b/i],
  ['alterTable', /\bALTER\s+TABLE\b/i],
  ['jsonFunction', /\bjson_(?:extract|set|insert|remove|array|object)\s*\(/i]
];
const IOS_RUNTIME_CAPABILITY = 'iosRuntime';
const IOS_RUNTIME_GATE = 'npm run ios:sync:preflight';
const IOS_RUNTIME_MARKER = /\biosRuntime\b/;

const files = listFiles();
const findings = [];
const iosRuntimeMarkers = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (IOS_RUNTIME_MARKER.test(text)) {
    iosRuntimeMarkers.push(relative(cwd(), file));
  }
  const sqlFragments = extractSqlFragments(text);
  for (const fragment of sqlFragments) {
    const capabilities = CAPABILITIES
      .filter(([, pattern]) => pattern.test(fragment.sql))
      .map(([name]) => name);
    if (capabilities.length === 0) continue;
    findings.push({
      capabilities,
      file: relative(cwd(), file),
      line: fragment.line,
      sql: compactSql(fragment.sql)
    });
  }
}

const summary = summarize(findings);
console.log(JSON.stringify({ findings, summary }, null, 2));

const hardUnknowns = summary.missingCoreCapabilities.filter((name) => {
  return name !== IOS_RUNTIME_CAPABILITY || summary.iosRuntimeGap.required;
});
if (hardUnknowns.length > 0) {
  console.error(`Missing core SQL capability coverage: ${hardUnknowns.join(', ')}`);
  if (hardUnknowns.includes(IOS_RUNTIME_CAPABILITY)) {
    console.error(`iOS runtime SQL surface is in scope; run ${IOS_RUNTIME_GATE} before iOS sync work.`);
  }
  exit(1);
}

function listFiles() {
  const roots = resolveRoots();
  const output = hasCommand('rg')
    ? execFileSync('rg', ['--files', ...roots], { encoding: 'utf8' })
    : execFileSync('git', ['ls-files', ...roots], { encoding: 'utf8' });
  return output
    .split('\n')
    .filter((file) => /\.(?:ts|tsx|js|java|swift)$/.test(file));
}

function resolveRoots() {
  const value = env.SQL_SURFACE_SCAN_ROOTS ?? '';
  if (!value.trim()) return DEFAULT_ROOTS;
  return value
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
}

function hasCommand(command) {
  const result = execFileSync('sh', ['-lc', `command -v ${command} >/dev/null 2>&1; echo $?`], { encoding: 'utf8' });
  return result.trim() === '0';
}

function extractSqlFragments(text) {
  const fragments = [];
  const patterns = [
    /`([\s\S]*?)`/g,
    /'([^'\n]*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK|VACUUM)[^'\n]*)'/gi,
    /"([^"\n]*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK|VACUUM)[^"\n]*)"/gi
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1] ?? '';
      if (!looksLikeSql(raw)) continue;
      fragments.push({ line: lineNumberAt(text, match.index ?? 0), sql: raw });
    }
  }
  return fragments;
}

function looksLikeSql(value) {
  return /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK|VACUUM)\b/i.test(value);
}

function compactSql(value) {
  return value
    .replace(/\$\{[^}]+\}/g, '${...}')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function summarize(items) {
  const byCapability = Object.fromEntries(CAPABILITIES.map(([name]) => [name, 0]));
  for (const item of items) {
    for (const capability of item.capabilities) {
      byCapability[capability] += 1;
    }
  }
  const coveredCoreCapabilities = [
    'attach',
    'detach',
    'crossDatabaseReference',
    'insertSelect',
    'upsertReplace',
    'explicitTransaction',
    'join',
    'exists',
    'blobTable'
  ].filter((name) => byCapability[name] > 0);
  const coreCapabilities = [
    'attach',
    'detach',
    'crossDatabaseReference',
    'insertSelect',
    'upsertReplace',
    'explicitTransaction',
    'join',
    'exists',
    'blobTable'
  ];
  const missingCoreCapabilities = [
    ...coreCapabilities.filter((name) => byCapability[name] === 0),
    IOS_RUNTIME_CAPABILITY
  ];
  return {
    byCapability,
    coveredCoreCapabilities,
    iosRuntimeGap: {
      gate: IOS_RUNTIME_GATE,
      markers: iosRuntimeMarkers,
      required: iosRuntimeMarkers.length > 0,
      scopeRule: 'iOS related scope is determined by iosRuntime capability markers in scanned files.'
    },
    missingCoreCapabilities,
    scannedFiles: files.length,
    totalFindings: items.length
  };
}
