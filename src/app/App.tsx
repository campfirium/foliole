import { useEffect, useRef, useState } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../features/editor/components/MarkdownEditor';
import type { Node } from '../features/nodes/model/nodeTypes';
import { Button, EmptyState, Panel, StatusBadge } from '../shared/ui';
import { useWorkspaceStore } from '../store/workspaceStore';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export function App() {
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const updateNodeContent = useWorkspaceStore((state) => state.updateNodeContent);
  const setActiveNode = useWorkspaceStore((state) => state.setActiveNode);
  const createQANodeFromSelection = useWorkspaceStore((state) => state.createQANodeFromSelection);

  const editorAdapterRef = useRef<EditorAdapter | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [reviewMessage, setReviewMessage] = useState('Review area placeholder');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  const editorContent = activeNode?.content ?? '';

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const handleEditorChange = (content: string) => {
    if (!activeNode) {
      setSaveStatus('error');
      return;
    }

    try {
      setSaveStatus('saving');
      updateNodeContent(activeNode.id, content);
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        setSaveStatus('saved');
      }, 180);
    } catch {
      setSaveStatus('error');
    }
  };

  const handleCreateQANode = () => {
    if (!activeNode) {
      setReviewMessage('No active node selected.');
      return;
    }

    const adapter = editorAdapterRef.current;
    if (!adapter) {
      setReviewMessage('Editor is not ready yet.');
      return;
    }

    const selection = adapter.getSelection();
    if (selection.from === selection.to) {
      setReviewMessage('Select text in the editor before creating a QA node.');
      return;
    }

    const editorSnapshot = adapter.getContent();
    const selectedContent = editorSnapshot.slice(selection.from, selection.to).trim();
    const promptContent = [
      editorSnapshot.slice(0, selection.from),
      '[[...]]',
      editorSnapshot.slice(selection.to)
    ].join('');

    const qaNodeId = createQANodeFromSelection(activeNode.id, promptContent, selectedContent);
    if (!qaNodeId) {
      setReviewMessage('Failed to create QA node from current selection.');
      return;
    }

    setReviewMessage(`QA node created: ${qaNodeId}`);
  };

  const saveStatusMeta = getSaveStatusMeta(saveStatus);

  return (
    <main aria-label="Foliole workspace" className="workspace-shell">
      <div className="workspace-grid">
        <Panel
          ariaLabel="Node list panel"
          as="aside"
          bodyClassName="node-list"
          className="panel-list"
          scrollBody
          title="Nodes"
        >
          {nodeOrder.length === 0 ? (
            <EmptyState description="Create or import a node to start editing." title="No nodes" />
          ) : (
            nodeOrder.map((nodeId) => (
              <NodeRow
                isActive={activeNodeId === nodeId}
                key={nodeId}
                node={nodesById[nodeId]}
                onSelect={setActiveNode}
              />
            ))
          )}
        </Panel>

        <section aria-label="Editor and review area" className="panel-stack">
          <Panel
            actions={
              <Button onClick={handleCreateQANode} size="sm" variant="primary">
                Create QA Node
              </Button>
            }
            ariaLabel="Editor panel"
            bodyClassName="editor-body"
            className="panel-editor"
            title="Editor"
          >
            <MarkdownEditor
              onChange={handleEditorChange}
              onReady={(adapter) => {
                editorAdapterRef.current = adapter;
              }}
              value={editorContent}
            />
          </Panel>

          <Panel ariaLabel="Review panel" className="panel-review" title="Review">
            <div className="review-content">
              <p>{reviewMessage}</p>
              <StatusBadge label={saveStatusMeta.label} tone={saveStatusMeta.tone} />
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function getSaveStatusMeta(status: SaveStatus): { label: string; tone: StatusTone } {
  if (status === 'saving') {
    return { label: 'Saving...', tone: 'info' };
  }
  if (status === 'saved') {
    return { label: 'Saved.', tone: 'success' };
  }
  if (status === 'error') {
    return { label: 'Save failed.', tone: 'error' };
  }
  return { label: 'Not saved yet.', tone: 'neutral' };
}

interface NodeRowProps {
  isActive: boolean;
  node: Node | undefined;
  onSelect: (nodeId: string) => void;
}

function NodeRow({ isActive, node, onSelect }: NodeRowProps) {
  if (!node) {
    return null;
  }

  return (
    <Button
      active={isActive}
      aria-pressed={isActive}
      className="node-row"
      onClick={() => onSelect(node.id)}
      variant="list"
    >
      {node.title}
    </Button>
  );
}
