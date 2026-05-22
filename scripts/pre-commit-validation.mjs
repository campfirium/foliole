#!/usr/bin/env node
/* global URL, console, process */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runNativeSqlitePolicyGuard } from './pre-commit-native-sqlite-policy.mjs';
import { runWindowsLibraryPathPolicyGuard } from './pre-commit-windows-library-path-policy.mjs';
import { resolveCriticalTestFiles } from './quality-critical-test-routes.mjs';

const RUN_VITEST_WITH_SUMMARY_SCRIPT = fileURLToPath(new URL('./run-vitest-with-summary.mjs', import.meta.url));
const LINTABLE_FILE_PATTERN = /\.(cjs|js|jsx|mjs|ts|tsx)$/u;
const TEST_MAINTENANCE_FILE_PATTERN =
  /(?:^|\/)(?:src\/test|tests|__tests__)\/|(?:\.test|\.spec|\.testSupport)\.(?:cjs|js|jsx|mjs|ts|tsx)$/u;
const CONTRACT_SENSITIVE_PATTERNS = [
  /^src\/(?:app|companion|features|shared\/ui)\/.*\.(?:ts|tsx)$/u,
  /(?:schema|migration|manifest|generated|metadata)/iu,
  /(?:sync|Sync|payload|Payload|apply|Apply|sql|SQL)/u,
  /(?:bridge|Bridge|adapter|Adapter|runtime|Runtime|platform)/u,
  /(?:security|sanitize|sanitizer|safe|unsafe|url|Url|URL|html|Html|markdown|Markdown|link|Link)/u,
  /(?:props|Props)\.(?:ts|tsx)$/u
];
const PRE_PUSH_COVERED_CONTRACT_PATTERNS = [
  /^(lib\/core\/sync\/syncPack|electron\/database\/syncPack|electron\/sync\/syncPack|src\/shared\/platform\/companionSyncPack)/u
];
const WINDOWS_SHELL_POLICY_FILES = [
  /^package\.json$/u,
  /^scripts\/windows\/.*\.(?:cmd|bat|mjs|ps1|sh)$/u
];

const WINDOWS_SHELL_POLICY_PATTERNS = [
  {
    pattern: /\bpowershell(?:\.exe)?\b[\s\S]*\s-Command\s/iu,
    reason: 'use a checked-in Node runner or a PowerShell -File entrypoint instead of inline powershell -Command'
  },
  {
    pattern: /\bcmd(?:\.exe)?\b[\s\S]*\s\/[cd]\s[\s\S]*(?:&&|\bset\s+[A-Za-z_][A-Za-z0-9_]*=|>>?|2>>?|\bstart\s+)/iu,
    reason: 'put complex cmd.exe /c logic in a checked-in .cmd/.mjs runner instead of an inline command string'
  }
];
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    input: options.input,
    stdio: options.stdio ?? (options.input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'])
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `${command} ${args.join(' ')} failed`);
  }
  return result.stdout ?? '';
}

function stagedFiles(diffFilter) {
  return run('git', ['diff', '--cached', '--name-only', `--diff-filter=${diffFilter}`, '--', '.'])
    .split(/\r?\n/u)
    .map((file) => file.trim())
    .filter(Boolean);
}

function collectStagedFiles() {
  return stagedFiles('ACMR').filter((file) => !file.startsWith('.lab/'));
}

function runStep(label, command, args) {
  console.log(`[pre-commit-validation] ${label}`);
  run(command, args, { stdio: 'inherit' });
}

function runAddedFileChecks(files) {
  if (files.length === 0) {
    return;
  }
  runStep('added or renamed files detected; checking file budget', 'node', ['scripts/check-file-budget.mjs', ...files]);
}

function runStagedCodeLint(files) {
  const lintableFiles = files.filter((file) => LINTABLE_FILE_PATTERN.test(file));
  if (lintableFiles.length === 0) {
    return;
  }
  runStep('linting staged code files', 'bash', ['scripts/lint-changed.sh', ...lintableFiles]);
}

function isTestMaintenanceFile(file) {
  return TEST_MAINTENANCE_FILE_PATTERN.test(file);
}

function isContractSensitiveFile(file) {
  if (
    !LINTABLE_FILE_PATTERN.test(file) ||
    isTestMaintenanceFile(file) ||
    PRE_PUSH_COVERED_CONTRACT_PATTERNS.some((pattern) => pattern.test(file))
  ) {
    return false;
  }
  return CONTRACT_SENSITIVE_PATTERNS.some((pattern) => pattern.test(file));
}

function runTestDriftGuard(files) {
  const contractFiles = files.filter(isContractSensitiveFile);
  if (contractFiles.length === 0 || files.some(isTestMaintenanceFile)) {
    return;
  }
  const routedTests = resolveCriticalTestFiles(contractFiles);
  if (routedTests.length > 0) {
    return;
  }
  throw new Error([
    'contract-sensitive changes require paired test maintenance or critical routed tests.',
    `files: ${contractFiles.join(', ')}`,
    'stage a related *.test.*, *.spec.*, *.testSupport.* file, or add a critical test route if existing tests already cover this contract.'
  ].join('\n'));
}

function stagedAddedLines(file) {
  return run('git', ['diff', '--cached', '--unified=0', '--', file])
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
}

function runWindowsShellPolicyGuard(files) {
  const checkedFiles = files.filter((file) => WINDOWS_SHELL_POLICY_FILES.some((pattern) => pattern.test(file)));
  const violations = [];
  for (const file of checkedFiles) {
    const content = stagedAddedLines(file);
    for (const { pattern, reason } of WINDOWS_SHELL_POLICY_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`${file}: ${reason}`);
      }
    }
  }
  if (violations.length === 0) {
    return;
  }
  throw new Error([
    'windows shell policy violation: do not persist fragile inline Windows shell commands.',
    ...violations
  ].join('\n'));
}

function stagedFileContent(file) {
  return run('git', ['show', `:${file}`]);
}

function runCriticalTests(files) {
  if (files.length === 0 || !existsSync('scripts/quality-critical-test-routes.mjs')) {
    return;
  }
  const output = run('node', ['scripts/quality-critical-test-routes.mjs'], {
    input: `${files.join('\n')}\n`
  }).trim();
  if (!output) {
    return;
  }
  const tests = output.split(/\r?\n/u).filter(Boolean);
  runStep('running critical routed tests', 'node', [
    RUN_VITEST_WITH_SUMMARY_SCRIPT,
    '.tmp/vitest/pre-commit-critical.json',
    '--',
    '--silent=passed-only',
    '--pool=threads',
    '--no-file-parallelism',
    ...tests
  ]);
}

function main() {
  const addedOrRenamedFiles = stagedFiles('AR');
  const files = collectStagedFiles();
  runAddedFileChecks(addedOrRenamedFiles);
  runStagedCodeLint(files);
  runWindowsShellPolicyGuard(files);
  runNativeSqlitePolicyGuard(files, stagedAddedLines, stagedFileContent);
  runWindowsLibraryPathPolicyGuard(files, stagedAddedLines);
  runTestDriftGuard(files);
  runCriticalTests(files);
}

try {
  main();
} catch (error) {
  console.error(`[pre-commit-validation] error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
