import { controlledElectronSqliteTests } from './native-sqlite-test-policy.mjs';

const NATIVE_SQLITE_POLICY_FILES = [
  /^package\.json$/u,
  /^scripts\/.*\.(?:cjs|js|mjs|ts)$/u
];
const NATIVE_SQLITE_POLICY_EXCLUDED_FILES = [
  /^scripts\/pre-commit-validation\.mjs$/u,
  /^scripts\/pre-commit-native-sqlite-policy\.mjs$/u,
  /\.test\.(?:cjs|js|mjs|ts)$/u
];

const NATIVE_SQLITE_POLICY_PATTERNS = [
  {
    pattern: /\bnpm\s+rebuild\s+better-sqlite3\b/iu,
    reason: 'use npm run electron:rebuild:native instead of plain npm rebuild better-sqlite3'
  },
  {
    pattern: /\bnode(?:\s+--experimental-strip-types)?\s+scripts\/(?:(?:sqlite-maintenance|node-kind-report|backfill-node-opening-text|backfill-source-disposition-states)\.(?:cjs|js|mjs|ts)|android\/(?:android-device-data-protection|android-preview-sync-state|android-reset-sync-data|android-sync-audit|android-sync-cleanup-device-private|android-sync-scenario-sampler)\.mjs)\b/iu,
    reason: 'route real sqlite maintenance scripts through the controlled Electron ABI runner'
  },
  {
    pattern: /\b(?:import[\s\S]*?\sfrom\s*|require\s*\()\s*['"]better-sqlite3['"]/u,
    reason: 'do not add new ordinary Node scripts that load root better-sqlite3 directly'
  }
];
const ORDINARY_NODE_TEST_ENTRY_PATTERN =
  /\b(?:(?:npm\s+run\s+test:files\s+--)|(?:node\s+scripts\/test-files\.mjs)|(?:node\s+scripts\/run-vitest-with-summary\.mjs\b)|(?:vitest\b))(?<args>[^\n]*)/giu;
const TEST_FILE_ARG_PATTERN = /(?:^|\s)(?<file>[^\s"'`]+\.test\.(?:mjs|ts|tsx))(?=$|[\s"'`,}])/giu;
const DATABASE_CONNECTION_IMPORT_PATTERN =
  /\b(?:import\b[\s\S]*?\bfrom\s+|import\s*\()\s*['"](?:\.{1,2}\/(?:[\w.-]+\/)*connection|\.{1,2}\/database\/connection)\.js['"]/u;
const ELECTRON_SQLITE_TESTS = new Set(controlledElectronSqliteTests);

function normalizeRepoPath(file) {
  return file.replaceAll('\\', '/');
}

function fileImportsDatabaseConnection(file, readStagedFile) {
  if (!file.startsWith('electron/')) {
    return false;
  }
  try {
    return DATABASE_CONNECTION_IMPORT_PATTERN.test(readStagedFile(file));
  } catch {
    return false;
  }
}

function collectOrdinaryNodeSqliteTestTargets(content, readStagedFile) {
  const targets = [];
  for (const command of content.matchAll(ORDINARY_NODE_TEST_ENTRY_PATTERN)) {
    const args = command.groups?.args ?? '';
    for (const match of args.matchAll(TEST_FILE_ARG_PATTERN)) {
      const file = normalizeRepoPath(match.groups?.file ?? '');
      if (ELECTRON_SQLITE_TESTS.has(file) || fileImportsDatabaseConnection(file, readStagedFile)) {
        targets.push(file);
      }
    }
  }
  return targets;
}

function shouldCheckFile(file) {
  return (
    NATIVE_SQLITE_POLICY_FILES.some((pattern) => pattern.test(file)) &&
    !NATIVE_SQLITE_POLICY_EXCLUDED_FILES.some((pattern) => pattern.test(file))
  );
}

export function runNativeSqlitePolicyGuard(files, readAddedLines, readStagedFile) {
  const violations = [];
  for (const file of files.filter(shouldCheckFile)) {
    const content = readAddedLines(file);
    for (const { pattern, reason } of NATIVE_SQLITE_POLICY_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`${file}: ${reason}`);
      }
    }
    const ordinaryNodeSqliteTests = collectOrdinaryNodeSqliteTestTargets(content, readStagedFile);
    if (ordinaryNodeSqliteTests.length > 0) {
      violations.push(
        `${file}: route real sqlite tests through npm run test:sqlite:electron (${ordinaryNodeSqliteTests.join(', ')})`
      );
    }
  }
  if (violations.length === 0) {
    return;
  }
  throw new Error([
    'native sqlite ABI policy violation: keep root better-sqlite3 owned by the Electron ABI.',
    ...violations
  ].join('\n'));
}
