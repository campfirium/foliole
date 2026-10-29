import { readdirSync } from 'node:fs';
import path from 'node:path';

import { controlledElectronSqliteTests } from './native-sqlite-test-policy.mjs';

const TEST_FILE_PATTERN = /\.test\.(?:mjs|mts|ts|tsx)$/u;

function immediateTestTargets(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && TEST_FILE_PATTERN.test(entry.name))
    .map((entry) => path.posix.join(directory, entry.name))
    .sort();
}

function immediateDirectoryTargets(directory, excludedNames = []) {
  const excluded = new Set(excludedNames);
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !excluded.has(entry.name))
    .map((entry) => path.posix.join(directory, entry.name))
    .sort();
}

function recursiveTestTargets(directory) {
  return [...immediateTestTargets(directory),
    ...immediateDirectoryTargets(directory).flatMap(recursiveTestTargets)].sort();
}

function directoryBuckets(directory, labelPrefix, reportPrefix) {
  return immediateDirectoryTargets(directory).map((target) => {
    const name = path.posix.basename(target);
    return {
      label: `${labelPrefix}-${name}`,
      fileParallelism: true,
      report: `.tmp/vitest/${reportPrefix}-${name}.json`,
      targets: [target]
    };
  });
}

function fileBuckets(targets, labelPrefix, reportPrefix, maximumFiles) {
  const buckets = [];
  for (let index = 0; index < targets.length; index += maximumFiles) {
    const suffix = Math.floor(index / maximumFiles) + 1;
    buckets.push({
      label: `${labelPrefix}-${suffix}`,
      fileParallelism: true,
      report: `.tmp/vitest/${reportPrefix}-${suffix}.json`,
      targets: targets.slice(index, index + maximumFiles)
    });
  }
  return buckets;
}

const platformRootTests = immediateTestTargets('src/shared/platform');
const libraryTests = recursiveTestTargets('lib');
const nativeTests = new Set(controlledElectronSqliteTests);
const platformCompanionTests = platformRootTests.filter(
  (target) => path.posix.basename(target).startsWith('companion')
);
const platformCoreTests = platformRootTests.filter(
  (target) => !platformCompanionTests.includes(target)
);
const nativeStoreTests = [
  'src/store/workspaceActionHistoryDomains.test.ts',
  'src/store/workspaceContentEditSync.integration.test.ts',
  'src/store/workspaceDailyFlow.sync.integration.test.ts',
  'src/store/workspaceSequentialReadingBatchMove.integration.test.ts'
];

export const SHARED_TEST_BUCKETS = [
  { label: 'lib-native', fileParallelism: true, report: '.tmp/vitest/shared-lib-native.json',
    targets: libraryTests.filter((target) => nativeTests.has(target)) },
  { label: 'lib', fileParallelism: true, report: '.tmp/vitest/shared-lib.json',
    targets: libraryTests.filter((target) => !nativeTests.has(target)) },
  {
    label: 'shared-core',
    pool: 'threads', fileParallelism: true,
    report: '.tmp/vitest/shared-src-core.json',
    targets: [
      ...immediateTestTargets('src/shared'),
      ...immediateDirectoryTargets('src/shared', ['platform', 'ui'])
    ]
  },
  ...fileBuckets(
    platformCompanionTests,
    'shared-platform-companion-root',
    'shared-src-platform-companion-root',
    8
  ),
  ...directoryBuckets(
    'src/shared/platform/companion',
    'shared-platform-companion',
    'shared-src-platform-companion'
  ),
  {
    label: 'shared-platform-companion-top',
    fileParallelism: true,
    report: '.tmp/vitest/shared-src-platform-companion-top.json',
    targets: immediateTestTargets('src/shared/platform/companion')
  },
  {
    label: 'shared-platform-core',
    fileParallelism: true,
    report: '.tmp/vitest/shared-src-platform-core.json',
    targets: [
      ...platformCoreTests,
      ...immediateDirectoryTargets('src/shared/platform', ['companion'])
    ]
  },
  { label: 'shared-ui', pool: 'threads', fileParallelism: true, report: '.tmp/vitest/shared-src-ui.json', targets: ['src/shared/ui'] },
  { label: 'features-editor', pool: 'threads', fileParallelism: true, report: '.tmp/vitest/shared-src-features-editor.json', targets: ['src/features/editor'] },
  { label: 'features-nodes', pool: 'threads', fileParallelism: true, report: '.tmp/vitest/shared-src-features-nodes.json', targets: ['src/features/nodes'] },
  { label: 'features-settings', pool: 'threads', fileParallelism: true, report: '.tmp/vitest/shared-src-features-settings.json', targets: ['src/features/settings'] },
  {
    label: 'features-review-docs',
    pool: 'threads', fileParallelism: true,
    report: '.tmp/vitest/shared-src-features-review-docs.json',
    targets: ['src/features/review', 'src/features/pdf', 'src/features/image-cloze', 'src/features/formula-cloze']
  },
  {
    label: 'features-guided',
    pool: 'threads', fileParallelism: true,
    report: '.tmp/vitest/shared-src-features-guided.json',
    targets: ['src/features/guidedSample', 'src/features/help']
  },
  { label: 'store-native', fileParallelism: true, report: '.tmp/vitest/shared-src-store-native.json', targets: nativeStoreTests },
  { label: 'store', pool: 'threads', fileParallelism: true, report: '.tmp/vitest/shared-src-store.json',
    targets: [
      ...immediateTestTargets('src/store').filter((target) => !nativeStoreTests.includes(target)),
      ...immediateDirectoryTargets('src/store')
    ] },
  {
    label: 'scripts',
    report: '.tmp/vitest/shared-scripts.json',
    targets: [
      'scripts/check-settings-classification.test.mjs',
      'scripts/lint-changed.test.mjs',
      'scripts/vite-config.test.mjs'
    ]
  }
];

// Windows hosts run shared buckets as two jobs; the second part starts at the platform core bucket.
export const SHARED_TEST_PARTS = ['one', 'two'];
const SECOND_PART_PREFIXES = ['shared-platform-core', 'shared-ui', 'features-', 'store', 'scripts'];

export function sharedTestPart(bucket) {
  return SECOND_PART_PREFIXES.some((prefix) => bucket.label.startsWith(prefix)) ? 'two' : 'one';
}

export function selectSharedTestBuckets(part, buckets = SHARED_TEST_BUCKETS) {
  if (!part) return buckets;
  if (!SHARED_TEST_PARTS.includes(part)) throw new Error(`[shared-test-bucket] unknown part: ${part}`);
  return buckets.filter((bucket) => sharedTestPart(bucket) === part);
}
