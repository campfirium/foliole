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
  const createChildNodeFromSelection = useWorkspaceStore((state) => state.createChildNodeFromSelection);
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

  const handleCreateChildNode = () => {
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
      setReviewMessage('Select text in the editor before creating a child node.');
      return;
    }

    const selectedContent = editorContent.slice(selection.from, selection.to);
    const childNodeId = createChildNodeFromSelection(activeNode.id, selectedContent);
    if (!childNodeId) {
      setReviewMessage('Failed to create child node from current selection.');
      return;
    }

    setReviewMessage(`Child node created: ${childNodeId}`);
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
            />
          ))}
        </div>
      </aside>

      <section className="right-stack" aria-label="Editor and review area">
        <section className="panel panel-editor" aria-label="Editor panel">
          <header className="panel-header">
            <h2>Editor</h2>
            <button onClick={handleCreateChildNode} type="button">
              Create Child Node
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
}

function NodeRow({ isActive, node }: NodeRowProps) {
  if (!node) {
    return null;
  }

  return <p className={isActive ? 'node-row node-row-active' : 'node-row'}>{node.title}</p>;
}
