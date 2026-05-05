import { MarkdownEditor } from '../features/editor/components/MarkdownEditor';
import type { LearningNode } from '../features/nodes/model/nodeTypes';
import { useWorkspaceStore } from '../store/workspaceStore';

export function App() {
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const updateSourceContent = useWorkspaceStore((state) => state.updateSourceContent);

  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  const activeSourceNode = activeNode?.kind === 'source' ? activeNode : undefined;
  const editorContent = activeSourceNode?.content ?? '';

  const handleEditorChange = (content: string) => {
    if (!activeSourceNode) {
      return;
    }
    updateSourceContent(activeSourceNode.id, content);
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
          </header>
          <div className="panel-body">
            <MarkdownEditor value={editorContent} onChange={handleEditorChange} />
          </div>
        </section>

        <section className="panel panel-review" aria-label="Review panel">
          <header className="panel-header">
            <h2>Review</h2>
          </header>
          <div className="panel-body">
            <p>Review area placeholder</p>
          </div>
        </section>
      </section>
    </main>
  );
}

interface NodeRowProps {
  isActive: boolean;
  node: LearningNode | undefined;
}

function NodeRow({ isActive, node }: NodeRowProps) {
  if (!node) {
    return null;
  }

  return <p className={isActive ? 'node-row node-row-active' : 'node-row'}>{node.title}</p>;
}
