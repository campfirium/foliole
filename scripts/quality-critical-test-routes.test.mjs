// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { resolveCriticalTestFiles } from './quality-critical-test-routes.mjs';

const existing = () => true;

describe('quality critical test routes', () => {
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

  it('ignores unrelated local source changes', () => {
    expect(resolveCriticalTestFiles(['src/app/components/SearchPalette.tsx'], existing)).toEqual([]);
  });
});
