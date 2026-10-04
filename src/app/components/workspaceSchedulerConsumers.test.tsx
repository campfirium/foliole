import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  ReviewSchedulerSettingsProvider,
  useReviewSchedulerSettings
} from '../../features/settings/context/ReviewSchedulerSettingsProvider';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { DocumentPanelHeader, type DocumentPanelHeaderProps } from './DocumentPanelHeader';
import { WorkspaceRightSidebarDevPanel } from './WorkspaceRightSidebarDevPanel';

vi.mock('../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));
vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({ editorDisplayMode: 'preview', toggleEditorDisplayMode: vi.fn() })
}));

const topic: Node = {
  id: 'topic', kind: 'topic', title: 'Topic', content: '', parentNodeId: null,
  createdAt: '', updatedAt: '', reading: null, reveal: null, review: null
};
const nodes = { topic };
const headerProps: DocumentPanelHeaderProps = {
  activeNodeId: 'topic', editableNodeId: 'topic', nodesById: nodes, backlinks: [],
  canGoBack: false, canGoForward: false, canGoParent: false,
  isFolderListView: false, isSourceUpdatePanelOpen: false, showSourceUpdateAction: false,
  priorityQuickSetShortcutLabel: '', onGoBack: vi.fn(), onGoForward: vi.fn(),
  onGoParent: vi.fn(), onNodePriorityChange: vi.fn(), onSelectBacklinkNode: vi.fn(),
  onSelectBreadcrumbNode: vi.fn(), onToggleSourceUpdatePanel: vi.fn()
};

function SettingsActions() {
  const settings = useReviewSchedulerSettings();
  return <>
    <output>{settings.isReviewSchedulerSettingsReady ? 'ready' : 'pending'}</output>
    <button type="button" onClick={() => settings.onDefaultPriorityChange(2)}>Change priority</button>
    <button type="button" onClick={() => settings.onPriorityRatioChange(3)}>Change ratio</button>
  </>;
}

beforeEach(() => vi.mocked(getRuntimeInvoke).mockReset());

it('hydrates and updates default priority and scheduling data through the existing provider', async () => {
  let finishLoad: (value: unknown) => void = () => undefined;
  const pendingLoad = new Promise<unknown>((resolve) => { finishLoad = resolve; });
  const saved = {
    ...DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    pushQueue: { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue, defaultPriority: 6, priorityRatio: 2 }
  };
  const invoke = vi.fn().mockReturnValueOnce(pendingLoad).mockResolvedValue(saved);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  renderWithLocalization(<ReviewSchedulerSettingsProvider>
    <SettingsActions />
    <DocumentPanelHeader {...headerProps} />
    <WorkspaceRightSidebarDevPanel activeNodeId="topic" nodesById={nodes} />
  </ReviewSchedulerSettingsProvider>);

  expect(screen.getByText('pending')).toBeInTheDocument();
  await act(async () => finishLoad(saved));
  await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /Priority P6 from the default fallback/ })).toBeInTheDocument();
  expect(screen.getByText('Priority').nextElementSibling).toHaveTextContent('P6');
  expect(screen.getByText('Queue weight ratio').nextElementSibling).toHaveTextContent('2');

  const updated = { ...saved, pushQueue: { ...saved.pushQueue, defaultPriority: 2 } };
  invoke.mockResolvedValue(updated);
  fireEvent.click(screen.getByRole('button', { name: 'Change priority' }));
  await waitFor(() => expect(screen.getByRole('button', {
    name: /Priority P2 from the default fallback/
  })).toBeInTheDocument());
  expect(screen.getByText('Priority').nextElementSibling).toHaveTextContent('P2');
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('save_review_scheduler_settings', {
    settings: expect.objectContaining({ pushQueue: expect.objectContaining({ defaultPriority: 2 }) })
  }));

  invoke.mockResolvedValue({ ...updated, pushQueue: { ...updated.pushQueue, priorityRatio: 3 } });
  fireEvent.click(screen.getByRole('button', { name: 'Change ratio' }));
  await waitFor(() => expect(screen.getByText('Queue weight ratio').nextElementSibling).toHaveTextContent('3'));
});

it('keeps explicit and inherited node priorities ahead of the global default', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue(DEFAULT_REVIEW_SCHEDULER_SETTINGS));
  const parent = { ...topic, id: 'parent', priority: 8 };
  const child = { ...topic, parentNodeId: 'parent' };
  const { rerender } = renderWithLocalization(<ReviewSchedulerSettingsProvider>
    <DocumentPanelHeader {...headerProps} nodesById={{ topic: child, parent }} />
  </ReviewSchedulerSettingsProvider>);
  expect(screen.getByRole('button', { name: /Priority P8 inherited from an ancestor/ })).toBeInTheDocument();
  rerender(<ReviewSchedulerSettingsProvider>
    <DocumentPanelHeader {...headerProps} nodesById={{ topic: { ...child, priority: 1 }, parent }} />
  </ReviewSchedulerSettingsProvider>);
  await waitFor(() => expect(screen.getByRole('button', { name: /Priority P1 set on this node/ })).toBeInTheDocument());
});

it('keeps independent preview headers free of workspace settings consumers and priority controls', () => {
  render(<LocalizationProvider>
    <DocumentPanelHeader {...headerProps} showDocumentControls={false} />
  </LocalizationProvider>);
  expect(screen.queryByRole('button', { name: /Priority P/ })).not.toBeInTheDocument();
  expect(vi.mocked(getRuntimeInvoke)).not.toHaveBeenCalled();
});
