import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CodeMirrorEditorAdapter } from '../../features/editor/adapters/CodeMirrorEditorAdapter';
import { setConnectedEditorAdapter, type EditorAdapterConnection } from '../../features/editor/adapters/editorAdapterConnection';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebar, type WorkspaceRightSidebarProps } from './WorkspaceRightSidebar';
import { createAssistantPanelNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';

const content = Array.from({ length: 40 }, (_, index) => `## Section ${index}\nBody\n`).join('\n');
const nodesById = {
  alpha: createAssistantPanelNode({ id: 'alpha', content }),
  beta: createAssistantPanelNode({ id: 'beta', content })
};

function setup() {
  let props: WorkspaceRightSidebarProps = {
    activeNodeId: 'alpha', activePanelId: 'outline', nodeOrder: ['alpha', 'beta'], nodesById,
    onRevealAnchorInDocument: vi.fn(), onSelectBreadcrumbNode: vi.fn(), onSelectNode: vi.fn(),
    reviewCurrentNodeId: null, reviewQueueNodeIds: [], trashedNodeIds: []
  };
  const view = renderWithLocalization(<WorkspaceRightSidebar {...props} />);
  return async (next: Partial<WorkspaceRightSidebarProps> = {}) => {
    props = { ...props, ...next };
    view.rerender(<WorkspaceRightSidebar {...props} />);
    if (props.activePanelId === 'outline' && props.isPanelContentVisible !== false) {
      await screen.findByRole('button', { name: 'Section 20' });
    }
    return view.container.querySelector<HTMLElement>(`[data-panel-content-root="${props.activePanelId}"]`);
  };
}

function scroll(element: HTMLElement, top: number) {
  element.scrollTop = top;
  fireEvent.scroll(element);
}

it('restores a scrolled outline after visiting a short panel in the same sidebar instance', async () => {
  const update = setup();
  scroll((await update())!, 180);
  const backlinks = (await update({ activePanelId: 'backlinks' }))!;
  // Model the browser clamping the short panel; native coverage verifies real geometry.
  scroll(backlinks, 0);
  const outline = (await update({ activePanelId: 'outline' }))!;
  await waitFor(() => expect(outline.scrollTop).toBe(180));
});

it('forgets previous material positions when changing materials', async () => {
  const update = setup();
  scroll((await update())!, 180);
  await update({ activePanelId: 'backlinks' });
  await update({ activeNodeId: 'beta' });
  expect((await update({ activePanelId: 'outline' }))!.scrollTop).toBe(0);
  expect((await update({ activeNodeId: 'alpha' }))!.scrollTop).toBe(0);
});

it('restores after unmounting panel content while folded', async () => {
  const update = setup();
  scroll((await update())!, 180);
  await update({ isPanelContentVisible: false });
  expect((await update({ isPanelContentVisible: true }))!.scrollTop).toBe(180);
});

it('keeps current heading navigation when the body position changes while another panel is shown', async () => {
  const update = setup();
  scroll((await update())!, 180);
  await update({ activePanelId: 'backlinks' });
  await update({ outlineActivePosition: content.indexOf('Section 30') });
  const outline = (await update({ activePanelId: 'outline' }))!;
  expect(outline.scrollTop).not.toBe(180);
  expect(screen.getByRole('button', { name: 'Section 30' })).toHaveAttribute('aria-current', 'location');
});

it('resets a still-visible scrolled outline when switching materials', async () => {
  const update = setup();
  scroll((await update())!, 180);
  expect((await update({ activeNodeId: 'beta' }))!.scrollTop).toBe(0);
});

it('keeps independent positions for panels of the current material', async () => {
  const update = setup();
  scroll((await update())!, 180);
  scroll((await update({ activePanelId: 'backlinks' }))!, 50);
  expect((await update({ activePanelId: 'outline' }))!.scrollTop).toBe(180);
  const backlinks = (await update({ activePanelId: 'backlinks' }))!;
  await waitFor(() => expect(backlinks.scrollTop).toBe(50));
});

it('clears positions when external document identity changes even with identical content', async () => {
  const update = setup();
  const outlineDocument = { contextId: 'file-a', content, activePosition: 0, onRevealPosition: vi.fn() };
  scroll((await update({ outlineDocument }))!, 180);
  await update({ activePanelId: 'backlinks' });
  await update({ outlineDocument: { ...outlineDocument, contextId: 'file-b' } });
  expect((await update({ activePanelId: 'outline' }))!.scrollTop).toBe(0);
});

it('waits for the connected editor outline before restoring after a panel switch', async () => {
  const update = setup();
  scroll((await update())!, 180);
  const connection: EditorAdapterConnection = { current: null };
  await update({ activePanelId: 'backlinks', editorAdapterRef: connection });
  const returning = update({ activePanelId: 'outline' });
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new CodeMirrorEditorAdapter(host, { initialContent: content, nodeId: 'alpha', onChange: vi.fn() });
  try {
    act(() => setConnectedEditorAdapter(connection, editor));
    expect((await returning)!.scrollTop).toBe(180);
  } finally {
    act(() => setConnectedEditorAdapter(connection, null));
    editor.destroy();
    host.remove();
  }
});
