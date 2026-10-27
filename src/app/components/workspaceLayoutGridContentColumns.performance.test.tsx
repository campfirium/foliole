import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { loadRuntimePerformanceMemorySnapshot } from '../../shared/platform/performanceMemoryRuntimeRepository';

import { renderWorkspaceGridColumns, type WorkspaceGridColumnProps } from './workspaceLayoutGridContentColumns';

vi.mock('../../shared/platform/performanceMemoryRuntimeRepository', () => ({
  loadRuntimePerformanceMemorySnapshot: vi.fn(async () => ({ main_process_rss_bytes: 1048576 }))
}));
vi.mock('./WorkspaceRightSidebarLazyPanels', async () => ({
  WorkspaceRightSidebarAssistantPanel: () => <textarea aria-label="Assistant draft" defaultValue="" />,
  WorkspaceRightSidebarPerformancePanel: (await import('./WorkspaceRightSidebarPerformancePanel')).WorkspaceRightSidebarPerformancePanel
}));

afterEach(() => vi.useRealTimers());

function createProps(): WorkspaceGridColumnProps {
  return {
    documentSurfaceProps: {} as WorkspaceGridColumnProps['documentSurfaceProps'],
    isImmersiveMode: false, isListCollapsed: false, isRightSidebarCollapsed: false,
    listAreaProps: {} as WorkspaceGridColumnProps['listAreaProps'],
    listSplitterProps: {} as WorkspaceGridColumnProps['listSplitterProps'],
    rightSidebarSplitterProps: {} as WorkspaceGridColumnProps['rightSidebarSplitterProps'],
    studySessionCompleteSummaryProps: null,
    rightSidebarProps: {
      activeNodeId: null, activePanelId: 'performance', nodeOrder: [], nodesById: {},
      onRevealAnchorInDocument: vi.fn(), onSelectBreadcrumbNode: vi.fn(), onSelectNode: vi.fn(),
      reviewCurrentNodeId: null, reviewQueueNodeIds: [], trashedNodeIds: []
    }
  };
}

function rightColumn(props: WorkspaceGridColumnProps) {
  return <>{renderWorkspaceGridColumns(props).filter((column) => column.key === 'right-sidebar')}</>;
}

it.each([false, true])('pauses hidden performance work and refreshes on reopen (compact=%s)', async (compact) => {
  vi.useFakeTimers();
  vi.mocked(loadRuntimePerformanceMemorySnapshot).mockClear();
  const props = createProps();
  if (compact) props.compactSidebars = {
    leftFloating: true, rightFloating: true, openSide: 'right', dismiss: vi.fn()
  };
  props.isRightSidebarCollapsed = true;
  const view = renderWithLocalization(rightColumn(props));
  await act(async () => vi.advanceTimersByTimeAsync(2400));
  expect(loadRuntimePerformanceMemorySnapshot).not.toHaveBeenCalled();
  props.isRightSidebarCollapsed = false;
  view.rerender(rightColumn(props));
  await act(async () => {});
  expect(screen.getByRole('heading', { name: 'Memory' })).toBeVisible();
  await act(async () => vi.advanceTimersByTimeAsync(2400));
  expect(loadRuntimePerformanceMemorySnapshot).toHaveBeenCalledTimes(3);

  props.isRightSidebarCollapsed = true;
  view.rerender(rightColumn(props));
  const contentRead = vi.fn(() => 'Current content');
  const node = { id: 'new', kind: 'topic', get content() { return contentRead(); } } as Node;
  props.rightSidebarProps = { ...props.rightSidebarProps, nodesById: { new: node } };
  view.rerender(rightColumn(props));
  await act(async () => vi.advanceTimersByTimeAsync(3600));
  expect(loadRuntimePerformanceMemorySnapshot).toHaveBeenCalledTimes(3);
  expect(contentRead).not.toHaveBeenCalled();

  props.isRightSidebarCollapsed = false;
  view.rerender(rightColumn(props));
  await act(async () => {});
  expect(loadRuntimePerformanceMemorySnapshot).toHaveBeenCalledTimes(4);
  expect(contentRead).toHaveBeenCalled();
  expect(screen.getAllByText('1.0 MB')[0]).toBeVisible();
  expect(screen.getByText('Loaded topics').nextElementSibling).toHaveTextContent('1');

  props.isImmersiveMode = true;
  view.rerender(rightColumn(props));
  await act(async () => vi.advanceTimersByTimeAsync(2400));
  expect(loadRuntimePerformanceMemorySnapshot).toHaveBeenCalledTimes(4);
  props.isImmersiveMode = false;
  view.rerender(rightColumn(props));
  await act(async () => {});
  expect(loadRuntimePerformanceMemorySnapshot).toHaveBeenCalledTimes(5);
});

it('preserves the assistant session surface while the sidebar is collapsed', () => {
  const props = createProps();
  props.rightSidebarProps.activePanelId = 'assistant';
  const view = renderWithLocalization(rightColumn(props));
  fireEvent.change(screen.getByRole('textbox', { name: 'Assistant draft' }), { target: { value: 'Keep this draft' } });
  props.isRightSidebarCollapsed = true;
  view.rerender(rightColumn(props));
  props.isRightSidebarCollapsed = false;
  view.rerender(rightColumn(props));
  expect(screen.getByRole('textbox', { name: 'Assistant draft' })).toHaveValue('Keep this draft');
});
