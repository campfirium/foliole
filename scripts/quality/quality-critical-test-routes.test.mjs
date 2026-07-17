// @vitest-environment node
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { resolveCriticalTestFiles, RUN_VITEST_WITH_SUMMARY_SCRIPT } from './quality-critical-test-routes.mjs';

const existing = () => true;

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

  it('ignores unrelated local source changes', () => {
    expect(resolveCriticalTestFiles(['src/app/components/SearchPalette.tsx'], existing)).toEqual([]);
  });
});
