#!/usr/bin/env node
/* global URL, console, process */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RUN_VITEST_WITH_SUMMARY_SCRIPT = fileURLToPath(new URL('../run-vitest-with-summary.mjs', import.meta.url));

const BACKLINKS_CONTRACT_TESTS = [
  'src/app/components/DocumentPanelSection.runtimeBacklinks.test.tsx',
  'src/app/components/WorkspaceRightSidebarBacklinksPanel.test.tsx'
];

const EDITOR_MATH_CONTRACT_TESTS = [
  'src/features/editor/adapters/liveMarkdownTheme.highlight-color.test.ts'
];

const NODE_LIST_COLLAPSE_CONTRACT_TESTS = [
  'src/features/nodes/components/NodeListCollapseState.test.tsx'
];

export const CRITICAL_TEST_ROUTES = [
  {
    triggers: [
      /^src\/app\/components\/useNodeBacklinks\.ts$/u,
      /^src\/app\/components\/DocumentPanelSection\.tsx$/u,
      /^src\/shared\/platform\/nodeBacklinksRuntime(?:Repository|Payloads)\.ts$/u,
      /^src\/features\/nodes\/model\/internalLinks\.ts$/u
    ],
    tests: BACKLINKS_CONTRACT_TESTS
  },
  {
    triggers: [
      /^src\/features\/editor\/adapters\/liveMarkdownMath(?:Source|Theme)\.ts$/u,
      /^src\/features\/editor\/adapters\/liveMarkdownTheme\.ts$/u
    ],
    tests: EDITOR_MATH_CONTRACT_TESTS
  },
  {
    triggers: [
      /^src\/features\/nodes\/components\/NodeListCollapseState\.ts$/u,
      /^src\/features\/nodes\/components\/NodeListTree\.tsx$/u,
      /^src\/features\/nodes\/components\/nodeListTreeModel\.ts$/u
    ],
    tests: NODE_LIST_COLLAPSE_CONTRACT_TESTS
  }
];

function normalizeFiles(files) {
  return files.map((file) => file.trim()).filter(Boolean);
}

export function resolveCriticalTestFiles(files, exists = existsSync) {
  const changedFiles = normalizeFiles(files);
  const tests = new Set();
  for (const route of CRITICAL_TEST_ROUTES) {
    if (!changedFiles.some((file) => route.triggers.some((trigger) => trigger.test(file)))) {
      continue;
    }
    for (const testFile of route.tests) {
      if (exists(testFile)) {
        tests.add(testFile);
      }
    }
  }
  return [...tests].sort();
}

function readInputFiles(argv) {
  const args = normalizeFiles(argv);
  if (args.length > 0) {
    return args;
  }
  if (process.stdin.isTTY) {
    return [];
  }
  return normalizeFiles(readFileSync(0, 'utf8').split(/\r?\n/u));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const shouldRun = argv.includes('--run');
  const tests = resolveCriticalTestFiles(readInputFiles(argv.filter((arg) => arg !== '--run')));
  if (shouldRun) {
    if (tests.length === 0) {
      process.exit(0);
    }
    console.log(`[quality-critical-test-routes] running ${tests.length} critical test file(s)`);
    const result = spawnSync(process.execPath, [
      RUN_VITEST_WITH_SUMMARY_SCRIPT,
      '.tmp/vitest/critical.json',
      '--',
      '--silent=passed-only',
      '--pool=threads',
      '--maxWorkers=2',
      '--no-file-parallelism',
      ...tests
    ], { stdio: 'inherit' });
    process.exit(result.status ?? 1);
  }
  if (tests.length > 0) {
    process.stdout.write(`${tests.join('\n')}\n`);
  }
}
