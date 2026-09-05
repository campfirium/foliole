#!/usr/bin/env node
/* global URL, console, process */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { IMPORT_SETTINGS_CRITICAL_TEST_ROUTES } from './quality-critical-test-routes-import-settings.mjs';

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

const DOCUMENT_HEADER_MENU_PROVIDER_CONTRACT_TESTS = [
  'src/app/components/DocumentPanelHeader.test.tsx'
];

const VIRTUAL_NODE_RESULT_INDEX_CONTRACT_TESTS = [
  'src/features/nodes/model/virtualNodeResultIndex.test.ts'
];

const IMPORT_SELECTION_CONTRACT_TESTS = [
  'electron/ipc/commands.window-and-utility.test.ts'
];

const Z_INDEX_TOKEN_CONTRACT_TESTS = [
  'src/app/zIndexTokenBoundary.test.ts'
];

const NATIVE_PAIRING_SIGNING_CONTRACT_TESTS = [
  'src/shared/platform/companion/network/signedRequest.syncGroupPeer.test.ts',
  'src/shared/platform/companionPairingSeam.contract.test.ts',
  'src/shared/platform/companionWorkspaceSync.pairing.test.ts'
];

const PINNED_NPM_WORKFLOW_CONTRACT_TESTS = [
  'scripts/quality/pinned-npm.test.mjs',
  'scripts/t5-baseline-admission-workflow-contract.test.mjs',
  'scripts/t6-hosted-quality-workflow-contract.test.mjs',
  'scripts/t7-hosted-quality-workflow-contract.test.mjs'
];

const HOSTED_QUALITY_WORKFLOW_CONTRACT_TESTS = [
  'scripts/hosted-quality-tooling-workflow-contract.test.mjs',
  'scripts/hosted-windows-x64-workflow-contract.test.mjs',
  'scripts/t4-desktop-canonical-workflow-contract.test.mjs',
  'scripts/t5-quality-leaf-ownership-workflow-contract.test.mjs',
  'scripts/quality/t7-hosted-quality-admission.test.mjs',
  'scripts/t5-baseline-admission-workflow-contract.test.mjs',
  'scripts/t6-hosted-quality-workflow-contract.test.mjs',
  'scripts/t7-hosted-quality-workflow-contract.test.mjs'
];

const RELEASE_WORKFLOW_CONTRACT_TESTS = [
  'scripts/electron-builder-config.test.mjs',
  'scripts/quality/hosted-npm-ci-workflow-contract.test.mjs',
  'scripts/release-candidate-quality-workflow-contract.test.mjs',
  'scripts/release-macos-workflow-contract.test.mjs',
  'scripts/release-windows-workflow-contract.test.mjs',
  'scripts/t7-release-workflow-contract.test.mjs',
  'scripts/windows/release-windows-validation-kit-contract.test.mjs'
];

const HOSTED_QUALITY_HANDOFF_CONTRACT_TESTS = [
  'scripts/github-actions-handoff-policy.test.mjs',
  'scripts/github-desktop-handoff-events.test.mjs',
  'scripts/hosted-quality-repair-controller-template.test.mjs'
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
  },
  {
    triggers: [
      /^src\/app\/AppProviders\.tsx$/u,
      /^src\/app\/components\/DocumentPanelHeaderActions\.tsx$/u,
      /^src\/features\/settings\/context\/DocumentHeaderMenuSettingsProvider\.tsx$/u,
      /^src\/features\/settings\/context\/documentHeaderMenuSettingsContext\.ts$/u,
      /^src\/test\/setup\.ts$/u
    ],
    tests: DOCUMENT_HEADER_MENU_PROVIDER_CONTRACT_TESTS
  },
  {
    triggers: [
      /^lib\/core\/nodes\/virtualNodeResults\.ts$/u,
      /^src\/features\/nodes\/model\/virtualNodeDetail\.ts$/u
    ],
    tests: VIRTUAL_NODE_RESULT_INDEX_CONTRACT_TESTS
  },
  {
    triggers: [
      /^electron\/ipc\/importTextFile\.ts$/u
    ],
    tests: IMPORT_SELECTION_CONTRACT_TESTS
  },
  ...IMPORT_SETTINGS_CRITICAL_TEST_ROUTES,
  {
    triggers: [
      /^src\/features\/settings\/components\/sections\/SettingsDocumentMenuSection\.tsx$/u
    ],
    tests: Z_INDEX_TOKEN_CONTRACT_TESTS
  },
  {
    triggers: [/^src\/shared\/platform\/companion\/network\/signedRequest\.ts$/u],
    tests: NATIVE_PAIRING_SIGNING_CONTRACT_TESTS
  },
  {
    triggers: [/^android\/app\/src\/main\/java\/com\/foliole\/android\/.+\.java$/u,
      /^scripts\/android\/java-adapter-boundary-rules\.mjs$/u],
    tests: [
      'scripts/android/java-adapter-boundary.test.mjs',
      'scripts/android/java-sql-surface.test.mjs'
    ]
  },
  {
    triggers: [/^scripts\/windows\/windows-dev-control\.mjs$/u],
    tests: ['scripts/windows/windows-android-dev-helper-boundary.test.mjs']
  },
  {
    triggers: [
      /^(?:package|package-lock)\.json$/u,
      /^scripts\/npm-hardening-check\.sh$/u,
      /^scripts\/quality\/pinned-npm\.mjs$/u
    ],
    tests: PINNED_NPM_WORKFLOW_CONTRACT_TESTS
  },
  {
    triggers: [
      /^\.github\/workflows\/(?:hosted-quality-(?:android|android-host|android-web-build|core|dependency-hardening|desktop-build|desktop-source|desktop-static|electron|full|ios|portable-domain|scoped-static|shared|static|tooling|windows-acceptance|windows-core)|remote-quality|t5-baseline-admission|t6-hosted-quality|t7-hosted-quality)\.yml$/u,
      /^scripts\/quality\/t7-hosted-quality-admission\.mjs$/u
    ],
    tests: HOSTED_QUALITY_WORKFLOW_CONTRACT_TESTS
  },
  {
    triggers: [
      /^\.github\/workflows\/(?:publish-release|release-(?:assembly|candidate-quality|linux|macos|quality-recheck|windows)|t7-release)\.yml$/u
    ],
    tests: RELEASE_WORKFLOW_CONTRACT_TESTS
  },
  {
    triggers: [
      /^\.agents\/skills\/foliole-hosted-quality-repair\/(?:SKILL\.md|agents\/openai\.yaml)$/u,
      /^\.codex\/monitors\/templates\/github-actions\.md$/u,
      /^scripts\/(?:github-actions-handoff-policy|github-desktop-handoff-events)\.mjs$/u
    ],
    tests: HOSTED_QUALITY_HANDOFF_CONTRACT_TESTS
  }
];

function normalizeFiles(files) {
  return files.map((file) => file.trim()).filter(Boolean);
}

export function resolveCriticalTestFiles(files, exists = existsSync) {
  const changedFiles = normalizeFiles(files);
  const tests = new Set();
  const missing = new Set();
  for (const route of CRITICAL_TEST_ROUTES) {
    if (!changedFiles.some((file) => route.triggers.some((trigger) => trigger.test(file)))) {
      continue;
    }
    for (const testFile of route.tests) {
      if (exists(testFile)) tests.add(testFile);
      else missing.add(testFile);
    }
  }
  if (missing.size > 0) throw new Error(`Missing critical test file(s): ${[...missing].sort().join(', ')}`);
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
