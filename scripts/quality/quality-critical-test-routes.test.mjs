// @vitest-environment node
/* global process */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { resolveCriticalTestFiles, RUN_VITEST_WITH_SUMMARY_SCRIPT } from './quality-critical-test-routes.mjs';

const existing = () => true;
const QUALITY_FAST_PLAN_TIMEOUT_MS = 30_000;

const T5_GAP_ROUTES = [
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
  ['z-index token boundary', [
    'src/features/settings/components/sections/SettingsDocumentMenuSection.tsx'
  ], ['src/app/zIndexTokenBoundary.test.ts']],
  ['pinned npm workflow', ['package.json', 'package-lock.json'], [
    'scripts/quality/pinned-npm.test.mjs',
    'scripts/t5-nightly-remote-quality-workflow-contract.test.mjs'
  ]]
];

function readQualityFastPlan(changedFiles) {
  const result = spawnSync(process.execPath, ['scripts/quality/run-quality-fast.mjs', '--route-json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, QUALITY_GATE_CHANGED_FILES: changedFiles.join('\n') },
    timeout: QUALITY_FAST_PLAN_TIMEOUT_MS
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

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

  it.each(T5_GAP_ROUTES)('routes the %s triggers to their cross-file contract', (_name, triggers, tests) => {
    expect(resolveCriticalTestFiles(triggers, existing)).toEqual(tests);
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

  it('exposes the source-triggered contracts through the quality:fast route', () => {
    const plan = readQualityFastPlan(T5_GAP_ROUTES.slice(0, 4).flatMap(([, triggers]) => triggers));
    expect(plan.relatedTests).toEqual(expect.arrayContaining(T5_GAP_ROUTES.slice(0, 4).flatMap(([, , tests]) => tests)));
  }, 45_000);

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
