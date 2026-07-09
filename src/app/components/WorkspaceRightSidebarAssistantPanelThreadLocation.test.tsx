import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantPanel } from './WorkspaceRightSidebarAssistantPanel';
import {
  createAssistantPanelNode as createNode,
  createAssistantPanelThread as createThread,
  createReadyAssistantStatus
} from './WorkspaceRightSidebarAssistantPanel.testUtils';

const assistantRuntime = vi.hoisted(() => ({
  listAssistantThreadIndex: vi.fn(),
  listAssistantThreadMessages: vi.fn(),
  loadAssistantStatus: vi.fn(),
  removeAssistantThreadFromHistory: vi.fn(),
  sendAssistantMessage: vi.fn(),
  subscribeAssistantTurnEvents: vi.fn()
}));

vi.mock('../../shared/platform/assistantRuntime', () => assistantRuntime);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled, 'true');
  assistantRuntime.loadAssistantStatus.mockResolvedValue(createReadyAssistantStatus());
  assistantRuntime.listAssistantThreadMessages.mockResolvedValue([]);
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
});

it('continues a workspace thread from a topic view using the saved location', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({ location: { type: 'workspace' } })
  ]);
  assistantRuntime.sendAssistantMessage.mockResolvedValueOnce({
    message: { text: 'Workspace answer', threadId: 'thread-1', turnId: 'turn-2' },
    provider: 'codex-app-server',
    state: 'ready',
    threadIndex: createThread({ location: { type: 'workspace' }, preview: 'Follow-up' })
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: /original prompt/i }));
  fireEvent.change(screen.getByLabelText('Foliole Aide message'), { target: { value: 'Follow-up' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form')!);

  await waitFor(() =>
    expect(assistantRuntime.sendAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Follow-up',
        openingLocation: { type: 'workspace' },
        providerThreadId: 'thread-1',
        workspaceContext: expect.objectContaining({
          scope: 'workspace'
        })
      })
    )
  );
});

it('continues a node thread using its saved node context before navigation catches up', async () => {
  const onSelectNode = vi.fn();
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({ location: { nodeId: 'node-2', type: 'node' } })
  ]);
  assistantRuntime.sendAssistantMessage.mockResolvedValueOnce({
    message: { text: 'Node answer', threadId: 'thread-1', turnId: 'turn-2' },
    provider: 'codex-app-server',
    state: 'ready',
    threadIndex: createThread({ preview: 'Follow-up' })
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{
        'node-1': createNode({ content: 'Current node body', id: 'node-1', title: 'Current topic' }),
        'node-2': createNode({ content: 'Saved node body', id: 'node-2', title: 'Saved topic' })
      }}
      onSelectNode={onSelectNode}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: /original prompt/i }));
  fireEvent.change(screen.getByLabelText('Foliole Aide message'), { target: { value: 'Follow-up' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form')!);

  expect(onSelectNode).toHaveBeenCalledWith('node-2');
  await waitFor(() =>
    expect(assistantRuntime.sendAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Follow-up',
        openingLocation: { nodeId: 'node-2', type: 'node' },
        providerThreadId: 'thread-1',
        workspaceContext: expect.objectContaining({
          activeNodeId: 'node-2',
          activeTitle: 'Saved topic',
          scope: 'node'
        })
      })
    )
  );
});

it('continues an unavailable topic thread without replacing its context with the current workspace', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({ location: { nodeId: 'missing-topic', type: 'node' } })
  ]);
  assistantRuntime.sendAssistantMessage.mockResolvedValueOnce({
    message: { text: 'Answer', threadId: 'thread-1', turnId: 'turn-2' },
    provider: 'codex-app-server',
    state: 'ready',
    threadIndex: createThread({ preview: 'Follow-up' })
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1', title: 'Current topic' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: /original prompt/i }));
  fireEvent.change(screen.getByLabelText('Foliole Aide message'), { target: { value: 'Follow-up' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form')!);

  await waitFor(() =>
    expect(assistantRuntime.sendAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        openingLocation: { nodeId: 'missing-topic', type: 'node' },
        workspaceContext: {
          activeNodeId: 'missing-topic',
          document: { bodyStatus: 'missing' },
          schemaVersion: 1,
          scope: 'node'
        }
      })
    )
  );
});

it('starts a folder thread using the active folder node location', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([]);
  assistantRuntime.sendAssistantMessage.mockResolvedValueOnce({
    message: { text: 'Folder answer', threadId: 'thread-folder', turnId: 'turn-1' },
    provider: 'codex-app-server',
    state: 'ready',
    threadIndex: createThread({
      location: { nodeId: 'folder-1', type: 'node' },
      providerThreadId: 'thread-folder'
    })
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="folder-1"
      nodesById={createFolderNodes()}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.change(await screen.findByLabelText('Foliole Aide message'), {
    target: { value: 'Summarize this folder' }
  });
  fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form')!);

  await waitFor(() =>
    expect(assistantRuntime.sendAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Summarize this folder',
        openingLocation: { nodeId: 'folder-1', type: 'node' },
        workspaceContext: expect.objectContaining({
          activeKind: 'folder',
          activeNodeId: 'folder-1',
          folder: expect.objectContaining({
            childCount: 2,
            children: expect.arrayContaining([
              expect.objectContaining({
                anchorKind: 'highlight',
                nodeId: 'child-1',
                preview: 'First child opening',
                title: 'First child'
              }),
              expect.objectContaining({
                nodeId: 'child-2',
                specialKind: 'virtual',
                title: 'Saved collection'
              })
            ])
          }),
          scope: 'node'
        })
      })
    )
  );
});

function createFolderNodes() {
  return {
    'child-1': createNode({
      anchorLink: { id: 'anchor-1', kind: 'highlight' },
      id: 'child-1',
      openingText: 'First child opening',
      parentNodeId: 'folder-1',
      title: 'First child'
    }),
    'child-2': createNode({
      id: 'child-2',
      kind: 'folder',
      parentNodeId: 'folder-1',
      specialKind: 'virtual',
      title: 'Saved collection'
    }),
    'folder-1': createNode({ id: 'folder-1', kind: 'folder', title: 'Folder' })
  };
}
