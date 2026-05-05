import { useRef, useState } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../features/editor/components/MarkdownEditor';
import type { Node } from '../features/nodes/model/nodeTypes';
import { useWorkspaceStore } from '../store/workspaceStore';

export function App() {
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const updateNodeContent = useWorkspaceStore((state) => state.updateNodeContent);
  const setActiveNode = useWorkspaceStore((state) => state.setActiveNode);
  const createQANodeFromSelection = useWorkspaceStore((state) => state.createQANodeFromSelection);
  const editorAdapterRef = useRef<EditorAdapter | null>(null);
  const [reviewMessage, setReviewMessage] = useState('Review area placeholder');

  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  const editorContent = activeNode?.content ?? '';

  const handleEditorChange = (content: string) => {
    if (!activeNode) {
      return;
    }
    updateNodeContent(activeNode.id, content);
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

  return (
    <main className="workspace" aria-label="Foliole workspace">
      <aside className="panel panel-list" aria-label="Node list panel">
        <header className="panel-header">
          <h2>Nodes</h2>
        </header>
        <div className="panel-body">
          {nodeOrder.map((nodeId) => (
            <NodeRow
              key={nodeId}
              isActive={activeNodeId === nodeId}
              node={nodesById[nodeId]}
              onSelect={setActiveNode}
            />
          ))}
        </div>
      </aside>

      <section className="right-stack" aria-label="Editor and review area">
        <section className="panel panel-editor" aria-label="Editor panel">
          <header className="panel-header">
            <h2>Editor</h2>
            <button onClick={handleCreateQANode} type="button">
              Create QA Node
            </button>
          </header>
          <div className="panel-body">
            <MarkdownEditor
              onChange={handleEditorChange}
              onReady={(adapter) => {
                editorAdapterRef.current = adapter;
              }}
              value={editorContent}
            />
          </div>
        </section>

        <section className="panel panel-review" aria-label="Review panel">
          <header className="panel-header">
            <h2>Review</h2>
          </header>
          <div className="panel-body">
            <p>{reviewMessage}</p>
          </div>
        </section>
      </section>
    </main>
  );
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
    <button
      aria-pressed={isActive}
      className={isActive ? 'node-row node-row-active' : 'node-row'}
      onClick={() => onSelect(node.id)}
      type="button"
    >
      {node.title}
    </button>
  );
}
