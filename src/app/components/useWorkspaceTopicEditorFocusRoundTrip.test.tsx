import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { expect, it } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { useWorkspaceTopicEditorFocusRoundTrip } from './useWorkspaceTopicEditorFocusRoundTrip';

function createTopic(id: string): WorkspaceListNode {
  return {
    anchorLink: null,
    createdAt: '2026-08-30T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    kind: 'topic',
    parentNodeId: 'folder',
    reading: null,
    review: null,
    title: id,
    updatedAt: '2026-08-30T00:00:00.000Z'
  };
}

let controls: ReturnType<typeof useWorkspaceTopicEditorFocusRoundTrip>;

function Harness(props: {
  activeNodeId: string;
  isVirtualViewOpen?: boolean;
  nodesById: WorkspaceListNodesById;
  showOrigin: boolean;
}) {
  const editorRef = useRef<HTMLButtonElement>(null);
  const adapterRef = useRef({ focus: () => editorRef.current?.focus() } as EditorAdapter);
  controls = useWorkspaceTopicEditorFocusRoundTrip({
    activeNodeId: props.activeNodeId,
    browseRootNodeId: 'folder',
    editorAdapterRef: adapterRef,
    editorNodeId: props.activeNodeId,
    isEditorReadOnly: false,
    isExternalViewOpen: false,
    isPriorityQuickSetActive: false,
    isStudyMode: false,
    isTrashViewOpen: false,
    isVirtualViewOpen: props.isVirtualViewOpen ?? false,
    nodesById: props.nodesById
  });
  return (
    <>
      <div data-topic-editor-focus-tree="true" role="tree">
        {props.showOrigin ? <button data-node-id="one" role="treeitem">one</button> : null}
        {props.activeNodeId !== 'one' || !props.showOrigin
          ? <button data-node-id={props.activeNodeId} role="treeitem">active</button>
          : null}
      </div>
      <button ref={editorRef}>editor</button>
    </>
  );
}

it('returns to the exact topic origin and falls back only inside the current tree', () => {
  const nodesById = { one: createTopic('one'), two: createTopic('two') };
  const view = render(<Harness activeNodeId="one" nodesById={nodesById} showOrigin />);
  const origin = screen.getByRole('treeitem', { name: 'one' }) as HTMLButtonElement;

  act(() => expect(controls.focusEditor('one', origin)).toBe(true));
  expect(screen.getByRole('button', { name: 'editor' })).toHaveFocus();
  act(() => expect(controls.returnToTopic()).toBe(true));
  expect(origin).toHaveFocus();

  act(() => expect(controls.focusEditor('one', origin)).toBe(true));
  view.rerender(<Harness activeNodeId="two" nodesById={nodesById} showOrigin={false} />);
  act(() => expect(controls.returnToTopic()).toBe(true));
  expect(screen.getByRole('treeitem', { name: 'active' })).toHaveFocus();
});

it('clears the focus origin when the workspace leaves the ordinary topic view', () => {
  const nodesById = { one: createTopic('one') };
  const view = render(<Harness activeNodeId="one" nodesById={nodesById} showOrigin />);
  const origin = screen.getByRole('treeitem', { name: 'one' }) as HTMLButtonElement;
  act(() => expect(controls.focusEditor('one', origin)).toBe(true));

  view.rerender(<Harness activeNodeId="one" isVirtualViewOpen nodesById={nodesById} showOrigin />);

  act(() => expect(controls.returnToTopic()).toBe(false));
  expect(origin).not.toHaveFocus();
});
