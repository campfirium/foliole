import { readdirSync } from 'node:fs';
import path from 'node:path';

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

function directoryBuckets(directory, labelPrefix, reportPrefix) {
  return immediateDirectoryTargets(directory).map((target) => {
    const name = path.posix.basename(target);
    return {
      label: `${labelPrefix}-${name}`,
      report: `.tmp/vitest/${reportPrefix}-${name}.json`,
      targets: [target]
    };
  });
}

const platformRootTests = immediateTestTargets('src/shared/platform');
const platformCompanionTests = platformRootTests.filter(
  (target) => path.posix.basename(target).startsWith('companion')
);
const platformCoreTests = platformRootTests.filter(
  (target) => !platformCompanionTests.includes(target)
);

export const SHARED_TEST_BUCKETS = [
  { label: 'lib', report: '.tmp/vitest/shared-lib.json', targets: ['--exclude=src/**', '--exclude=electron/**', '--exclude=scripts/**'] },
  {
    label: 'shared-core',
    report: '.tmp/vitest/shared-src-core.json',
    targets: [
      ...immediateTestTargets('src/shared'),
      ...immediateDirectoryTargets('src/shared', ['platform', 'ui'])
    ]
  },
  {
    label: 'shared-platform-companion-root',
    report: '.tmp/vitest/shared-src-platform-companion-root.json',
    targets: platformCompanionTests
  },
  ...directoryBuckets(
    'src/shared/platform/companion',
    'shared-platform-companion',
    'shared-src-platform-companion'
  ),
  {
    label: 'shared-platform-core',
    report: '.tmp/vitest/shared-src-platform-core.json',
    targets: [
      ...platformCoreTests,
      ...immediateDirectoryTargets('src/shared/platform', ['companion'])
    ]
  },
  { label: 'shared-ui', report: '.tmp/vitest/shared-src-ui.json', targets: ['src/shared/ui'] },
  { label: 'features-editor', report: '.tmp/vitest/shared-src-features-editor.json', targets: ['src/features/editor'] },
  { label: 'features-nodes', report: '.tmp/vitest/shared-src-features-nodes.json', targets: ['src/features/nodes'] },
  { label: 'features-settings', report: '.tmp/vitest/shared-src-features-settings.json', targets: ['src/features/settings'] },
  {
    label: 'features-review-docs',
    report: '.tmp/vitest/shared-src-features-review-docs.json',
    targets: ['src/features/review', 'src/features/pdf', 'src/features/image-cloze', 'src/features/formula-cloze']
  },
  {
    label: 'features-guided',
    report: '.tmp/vitest/shared-src-features-guided.json',
    targets: ['src/features/guidedSample', 'src/features/help']
  },
  { label: 'store', report: '.tmp/vitest/shared-src-store.json', targets: ['src/store'] },
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
