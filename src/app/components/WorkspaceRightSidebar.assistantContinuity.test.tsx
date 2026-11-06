import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { renderWorkspaceGridColumns, type WorkspaceGridColumnProps } from './workspaceLayoutGridContentColumns';
import { createAssistantPanelNode, createAssistantPanelThread, createReadyAssistantStatus } from './WorkspaceRightSidebarAssistantPanel.testUtils';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

const runtime = vi.hoisted(() => ({ listAssistantThreadIndex: vi.fn(), listAssistantThreadMessages: vi.fn(),
  loadAssistantStatus: vi.fn(), removeAssistantThreadFromHistory: vi.fn(), sendAssistantMessage: vi.fn(),
  subscribeAssistantTurnEvents: vi.fn() }));
vi.mock('../../shared/platform/assistantRuntime', () => runtime);

function Harness({ initialPanel = 'assistant' }: { initialPanel?: WorkspaceRightPanelId }) {
  const [panel, setPanel] = useState<WorkspaceRightPanelId>(initialPanel);
  const [collapsed, setCollapsed] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const props: WorkspaceGridColumnProps = {
    documentSurfaceProps: {} as WorkspaceGridColumnProps['documentSurfaceProps'],
    listAreaProps: {} as WorkspaceGridColumnProps['listAreaProps'],
    listSplitterProps: {} as WorkspaceGridColumnProps['listSplitterProps'],
    rightSidebarSplitterProps: {} as WorkspaceGridColumnProps['rightSidebarSplitterProps'],
    studySessionCompleteSummaryProps: null, isListCollapsed: false,
    isImmersiveMode: immersive, isRightSidebarCollapsed: collapsed,
    rightSidebarProps: {
      activeNodeId: 'topic', activePanelId: panel, nodeOrder: ['topic'],
      nodesById: { topic: createAssistantPanelNode({ id: 'topic', content: '# Topic\n\n## Section\n\nBody' }) },
      onRevealAnchorInDocument: vi.fn(), onSelectBreadcrumbNode: vi.fn(), onSelectNode: vi.fn(),
      reviewCurrentNodeId: null, reviewQueueNodeIds: [], trashedNodeIds: []
    }
  };
  return <>
    <button onClick={() => setPanel('outline')}>View outline</button>
    <button onClick={() => setPanel('performance')}>View performance</button>
    <button onClick={() => setPanel('assistant')}>View assistant</button>
    <button onClick={() => setCollapsed(value => !value)}>Toggle sidebar</button>
    <button onClick={() => setImmersive(value => !value)}>Toggle immersive</button>
    {renderWorkspaceGridColumns(props).filter(column => column.key === 'right-sidebar')}
  </>;
}

async function switchAway() {
  fireEvent.click(screen.getByRole('button', { name: 'View outline' }));
  await screen.findByRole('button', { name: 'Section' });
}
async function returnToAssistant() {
  fireEvent.click(screen.getByRole('button', { name: 'View assistant' }));
  return screen.findByLabelText('Foliole Aide message');
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled, 'true');
  runtime.loadAssistantStatus.mockResolvedValue(createReadyAssistantStatus());
  runtime.listAssistantThreadIndex.mockResolvedValue([]);
  runtime.listAssistantThreadMessages.mockResolvedValue([]);
  runtime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
});

it('retains unsent text after switching panels', async () => {
  renderWithLocalization(<Harness />);
  fireEvent.change(await screen.findByLabelText('Foliole Aide message'), { target: { value: 'Unsent text' } });
  await switchAway();
  expect(await returnToAssistant()).toHaveValue('Unsent text');
  expect(runtime.sendAssistantMessage).not.toHaveBeenCalled();
});

it('retains attached images after switching panels', async () => {
  const view = renderWithLocalization(<Harness />);
  await screen.findByLabelText('Foliole Aide message');
  fireEvent.change(view.container.querySelector('input[type="file"]')!, {
    target: { files: [new File(['image bytes'], 'diagram.png', { type: 'image/png' })] }
  });
  await screen.findByAltText('diagram.png');
  await switchAway();
  await returnToAssistant();
  expect(screen.getByAltText('diagram.png')).toBeInTheDocument();
  expect(runtime.sendAssistantMessage).not.toHaveBeenCalled();
});

it('returns to the same saved conversation after switching panels', async () => {
  runtime.listAssistantThreadIndex.mockResolvedValue([createAssistantPanelThread({})]);
  renderWithLocalization(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: /Original prompt/ }));
  await screen.findByRole('heading', { name: 'Original prompt' });
  await switchAway();
  await returnToAssistant();
  expect(screen.getByRole('heading', { name: 'Original prompt' })).toBeInTheDocument();
});

it('receives an in-flight answer while another panel is visible and shows it on return', async () => {
  let resolve!: (value: unknown) => void;
  runtime.sendAssistantMessage.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  renderWithLocalization(<Harness />);
  fireEvent.change(await screen.findByLabelText('Foliole Aide message'), { target: { value: 'Question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(runtime.sendAssistantMessage).toHaveBeenCalledOnce());
  await switchAway();
  await act(async () => resolve({ message: { text: 'Completed answer', threadId: 'new-thread', turnId: 'turn' },
    provider: 'codex-app-server', state: 'ready', threadIndex: createAssistantPanelThread({ providerThreadId: 'new-thread' }) }));
  await returnToAssistant();
  expect(screen.getByText('Completed answer')).toBeInTheDocument();
});

it('retains the same input through immersion and through collapsing another panel', async () => {
  renderWithLocalization(<Harness />);
  fireEvent.change(await screen.findByLabelText('Foliole Aide message'), { target: { value: 'Continue later' } });
  fireEvent.click(screen.getByRole('button', { name: 'Toggle immersive' }));
  expect(screen.queryByRole('textbox', { name: 'Foliole Aide message' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Toggle immersive' }));
  expect(screen.getByLabelText('Foliole Aide message')).toHaveValue('Continue later');
  fireEvent.click(screen.getByRole('button', { name: 'View performance' }));
  await screen.findByRole('heading', { name: 'Memory' });
  fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
  expect(await returnToAssistant()).toHaveValue('Continue later');
});

it('restores a failed send on return and keeps explicit new-conversation reset working', async () => {
  let resolve!: (value: unknown) => void;
  runtime.sendAssistantMessage.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  renderWithLocalization(<Harness />);
  fireEvent.change(await screen.findByLabelText('Foliole Aide message'), { target: { value: 'Retry question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(runtime.sendAssistantMessage).toHaveBeenCalledOnce());
  await switchAway();
  await act(async () => resolve({ provider: 'codex-app-server', state: 'failed' }));
  expect(await returnToAssistant()).toHaveValue('Retry question');
  fireEvent.click(screen.getByRole('button', { name: 'New' }));
  expect(screen.getByLabelText('Foliole Aide message')).toHaveValue('');
  expect(runtime.sendAssistantMessage).toHaveBeenCalledOnce();
});

it('does not initialize the assistant until it is first opened', async () => {
  renderWithLocalization(<Harness initialPanel="outline" />);
  await screen.findByRole('button', { name: 'Section' });
  expect(runtime.loadAssistantStatus).not.toHaveBeenCalled();
  expect(runtime.listAssistantThreadIndex).not.toHaveBeenCalled();
  await returnToAssistant();
  expect(runtime.loadAssistantStatus).toHaveBeenCalledOnce();
});

it('continues receiving turn events while hidden without starting another send', async () => {
  let listener!: (event: unknown) => void;
  runtime.subscribeAssistantTurnEvents.mockImplementation(callback => { listener = callback; return () => undefined; });
  runtime.sendAssistantMessage.mockImplementation(() => new Promise(() => undefined));
  renderWithLocalization(<Harness />);
  fireEvent.change(await screen.findByLabelText('Foliole Aide message'), { target: { value: 'Stream question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(runtime.sendAssistantMessage).toHaveBeenCalledOnce());
  const sent = runtime.sendAssistantMessage.mock.calls[0]![0];
  await switchAway();
  act(() => listener({ clientTurnId: sent.clientTurnId, kind: 'delta', provider: 'codex-app-server', text: 'Background stream' }));
  await returnToAssistant();
  expect(screen.getByText('Background stream')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  expect(runtime.sendAssistantMessage).toHaveBeenCalledOnce();
});

it('preserves the outline scroll position when folding and reopening the sidebar', async () => {
  renderWithLocalization(<Harness initialPanel="outline" />);
  const heading = await screen.findByRole('button', { name: 'Section' });
  const outline = heading.closest<HTMLElement>('[data-panel-content-root="outline"]')!;
  outline.scrollTop = 300;
  const before = outline.scrollTop;
  fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
  const restored = screen.getByRole('button', { name: 'Section' }).closest<HTMLElement>('[data-panel-content-root="outline"]')!;
  expect(restored.scrollTop).toBe(before);
});
