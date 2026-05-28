import { describe, expect, it } from 'vitest';

import {
  renderWorkspaceGridColumns,
  type WorkspaceGridColumnProps
} from './workspaceLayoutGridContentColumns';

function createProps(overrides: Partial<WorkspaceGridColumnProps> = {}): WorkspaceGridColumnProps {
  return {
    documentSurfaceProps: {} as WorkspaceGridColumnProps['documentSurfaceProps'],
    isImmersiveMode: false,
    isListCollapsed: false,
    isRightSidebarCollapsed: false,
    listAreaProps: {} as WorkspaceGridColumnProps['listAreaProps'],
    listSplitterProps: {} as WorkspaceGridColumnProps['listSplitterProps'],
    rightSidebarProps: {} as WorkspaceGridColumnProps['rightSidebarProps'],
    rightSidebarSplitterProps: {} as WorkspaceGridColumnProps['rightSidebarSplitterProps'],
    studySessionCompleteSummaryProps: null,
    ...overrides
  };
}

describe('renderWorkspaceGridColumns responsive layout', () => {
  it('removes auxiliary columns at compact desktop breakpoints', () => {
    const columns = renderWorkspaceGridColumns(createProps());

    expect(columns[0]?.props.className).toContain('max-[1080px]:hidden');
    expect(columns[1]?.props.className).toContain('max-[1080px]:hidden');
    expect(columns[3]?.props.className).toContain('hidden min-w-0 overflow-visible xl:flex');
    expect(columns[4]?.props.className).toContain('hidden min-w-0 flex-col overflow-hidden xl:flex');
  });
});
