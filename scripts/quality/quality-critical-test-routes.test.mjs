// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { resolveCriticalTestFiles, RUN_VITEST_WITH_SUMMARY_SCRIPT } from './quality-critical-test-routes.mjs';

const existing = () => true;

const HOSTED_QUALITY_GAP_ROUTES = [
  ['document header menu provider', [
    'src/app/AppProviders.tsx',
    'src/features/settings/context/DocumentHeaderMenuSettingsProvider.tsx',
    'src/features/settings/context/documentHeaderMenuSettingsContext.ts'
  ], ['src/app/components/DocumentPanelHeader.test.tsx']],
  ['virtual result index', [
    'lib/core/nodes/virtualNodeResults.ts',
    'src/features/nodes/model/virtualNodeDetail.ts'
  ], ['src/features/nodes/model/virtualNodeResultIndex.test.ts']],
  ['import selection metadata', ['electron/ipc/importTextFile.ts'], ['electron/ipc/commands.window-and-utility.test.ts']],
  ['current source reimport', ['lib/core/database/nodeBodyMutation.ts'], [
    'electron/import/currentSourceReimport.test.ts'
  ]],
  ['Readwise topic merge', ['lib/core/database/importHighlightBodyMatching.ts'], [
    'electron/import/readwiseTopicMerge.test.ts'
  ]],
  ['mouse gesture settings search', [
    'src/features/settings/components/sections/SettingsMouseGestureBindings.tsx',
    'src/features/settings/model/settingsSearchRowCatalog.ts'
  ], ['src/features/settings/components/SettingsPanel.search.test.tsx']],
  ['mouse gesture folder integration', [
    'src/app/components/FolderListMouseGestureSurface.tsx',
    'src/features/settings/context/MouseGestureSettingsProvider.tsx'
  ], [
    'src/app/components/DocumentPanelFolderSpecialContent.test.tsx',
    'src/app/components/DocumentPanelSection.folderNavigation.test.tsx',
    'src/app/components/DocumentPanelSection.hookCrash.test.tsx'
  ]],
  ['z-index token boundary', [
    'src/features/settings/components/sections/SettingsDocumentMenuSection.tsx'
  ], ['src/app/zIndexTokenBoundary.test.ts']],
  ['native pairing signing', ['src/shared/platform/companion/network/signedRequest.ts'], [
    'src/shared/platform/companion/network/signedRequest.syncGroupPeer.test.ts',
    'src/shared/platform/companionPairingSeam.contract.test.ts',
    'src/shared/platform/companionWorkspaceSync.pairing.test.ts'
  ]],
  ['Android Java adapter inventory', [
    'android/app/src/main/java/com/foliole/android/FolioleCompanionNsdAddresses.java'
  ], [
    'scripts/android/java-adapter-boundary.test.mjs',
    'scripts/android/java-sql-surface.test.mjs'
  ]],
  ['Windows DEV action registry', [
    'scripts/windows/windows-dev-control.mjs'
  ], ['scripts/windows/windows-android-dev-helper-boundary.test.mjs']],
  ['pinned npm workflow', ['package.json', 'package-lock.json'], [
    'scripts/quality/pinned-npm.test.mjs',
    'scripts/t5-baseline-admission-workflow-contract.test.mjs',
    'scripts/t6-hosted-quality-workflow-contract.test.mjs',
    'scripts/t7-hosted-quality-workflow-contract.test.mjs'
  ]]
];

const HOSTED_QUALITY_CONTRACTS = [
  'scripts/hosted-quality-tooling-workflow-contract.test.mjs',
  'scripts/hosted-windows-x64-workflow-contract.test.mjs',
  'scripts/quality/t7-hosted-quality-admission.test.mjs',
  'scripts/t4-desktop-canonical-workflow-contract.test.mjs',
  'scripts/t5-baseline-admission-workflow-contract.test.mjs',
  'scripts/t5-quality-leaf-ownership-workflow-contract.test.mjs',
  'scripts/t6-hosted-quality-workflow-contract.test.mjs',
  'scripts/t7-hosted-quality-workflow-contract.test.mjs'
];

const RELEASE_WORKFLOW_CONTRACTS = [
  'scripts/electron-builder-config.test.mjs',
  'scripts/quality/hosted-npm-ci-workflow-contract.test.mjs',
  'scripts/release-candidate-quality-workflow-contract.test.mjs',
  'scripts/release-macos-workflow-contract.test.mjs',
  'scripts/release-windows-workflow-contract.test.mjs',
  'scripts/t7-release-workflow-contract.test.mjs',
  'scripts/windows/release-windows-validation-kit-contract.test.mjs'
];

const HOSTED_QUALITY_HANDOFF_CONTRACTS = [
  'scripts/github-actions-handoff-policy.test.mjs',
  'scripts/github-desktop-handoff-events.test.mjs',
  'scripts/hosted-quality-repair-controller-template.test.mjs'
];

describe('quality critical test routes', () => {
  it('resolves the shared Vitest runner after the quality scripts directory split', () => {
    expect(existsSync(RUN_VITEST_WITH_SUMMARY_SCRIPT)).toBe(true);
  });

  it('routes backlinks hook contract changes to all renderer consumers', () => {
    expect(resolveCriticalTestFiles(['src/app/components/useNodeBacklinks.ts'], existing)).toEqual([
      'src/app/components/DocumentPanelSection.runtimeBacklinks.test.tsx',
      'src/app/components/WorkspaceRightSidebarBacklinksPanel.test.tsx'
    ]);
  });

  it('routes runtime payload changes to desktop backlinks consumers', () => {
    expect(resolveCriticalTestFiles(['src/shared/platform/nodeBacklinksRuntimeRepository.ts'], existing)).toEqual([
      'src/app/components/DocumentPanelSection.runtimeBacklinks.test.tsx',
      'src/app/components/WorkspaceRightSidebarBacklinksPanel.test.tsx'
    ]);
  });

  it('routes editor math theme changes to the live markdown theme contract', () => {
    expect(resolveCriticalTestFiles(['src/features/editor/adapters/liveMarkdownMathTheme.ts'], existing)).toEqual([
      'src/features/editor/adapters/liveMarkdownTheme.highlight-color.test.ts'
    ]);
  });

  it('routes node-list collapse boundary changes to collapse behavior coverage', () => {
    expect(resolveCriticalTestFiles(['src/features/nodes/components/nodeListTreeModel.ts'], existing)).toEqual([
      'src/features/nodes/components/NodeListCollapseState.test.tsx'
    ]);
  });

  it.each(HOSTED_QUALITY_GAP_ROUTES)('routes the %s triggers to their cross-file contract', (_name, triggers, tests) => {
    expect(resolveCriticalTestFiles(triggers, existing)).toEqual(tests);
  });

  it('routes every hosted orchestration surface to the full workflow contract set', () => {
    expect(resolveCriticalTestFiles([
      '.github/workflows/hosted-quality-core.yml',
      '.github/workflows/hosted-quality-tooling.yml',
      '.github/workflows/hosted-quality-windows-acceptance.yml',
      '.github/workflows/t6-hosted-quality.yml',
      '.github/workflows/t7-hosted-quality.yml',
      'scripts/quality/t7-hosted-quality-admission.mjs'
    ], existing)).toEqual(HOSTED_QUALITY_CONTRACTS);
  });

  it('routes every release orchestration surface to the release workflow contracts', () => {
    expect(resolveCriticalTestFiles([
      '.github/workflows/release-candidate-quality.yml',
      '.github/workflows/release-assembly.yml',
      '.github/workflows/release-linux.yml',
      '.github/workflows/release-macos.yml',
      '.github/workflows/release-quality-recheck.yml',
      '.github/workflows/release-windows.yml',
      '.github/workflows/t7-release.yml'
    ], existing)).toEqual(RELEASE_WORKFLOW_CONTRACTS);
  });

  it('routes hosted-quality monitor and controller changes to their shared contract set', () => {
    expect(resolveCriticalTestFiles([
      '.agents/skills/foliole-hosted-quality-repair/SKILL.md',
      '.codex/monitors/templates/github-actions.md',
      'scripts/github-actions-handoff-policy.mjs'
    ], existing)).toEqual(HOSTED_QUALITY_HANDOFF_CONTRACTS);
  });

  it('deduplicates contracts selected through multiple triggering files', () => {
    expect(resolveCriticalTestFiles([
      'lib/core/nodes/virtualNodeResults.ts',
      'src/features/nodes/model/virtualNodeDetail.ts',
      'lib/core/nodes/virtualNodeResults.ts'
    ], existing)).toEqual(['src/features/nodes/model/virtualNodeResultIndex.test.ts']);
  });

  it('filters routed contracts that are absent from the checkout', () => {
    const onlyPinnedNpmExists = (file) => file === 'scripts/quality/pinned-npm.test.mjs';
    expect(resolveCriticalTestFiles(['package-lock.json'], onlyPinnedNpmExists)).toEqual([
      'scripts/quality/pinned-npm.test.mjs'
    ]);
  });

  it('keeps capped quality:fast routes wired to the critical test runner', () => {
    const fastGate = readFileSync('scripts/quality/quality-gate-fast.sh', 'utf8');
    const cappedRoute = fastGate.split('if [[ "${level}" =~ ^(full|desktop|shared|android|ios)$ ]]')[1]
      .split('run_quality_gate_fast_light_mid_static_guards')[0];
    expect(cappedRoute).toContain('run_critical_tests_if_needed "${all_changed}"');
  });

  it('ignores unrelated local source changes', () => {
    expect(resolveCriticalTestFiles(['src/app/components/SearchPalette.tsx'], existing)).toEqual([]);
  });

  it('keeps the Split Topic and iOS comparison cases out of critical routing', () => {
    expect(resolveCriticalTestFiles([
      'src/app/components/SplitTopicDialogHost.test.tsx',
      'scripts/ios/ios-foreground-sync-lifecycle-runner.mjs'
    ], existing)).toEqual([]);
  });
});
