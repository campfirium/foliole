import { useState } from 'react';

import { MarkdownEditor } from '../features/editor/components/MarkdownEditor';

export function App() {
  const [content, setContent] = useState<string>(
    '# Welcome to Foliole\n\nStart writing markdown here.'
  );

  return (
    <main className="workspace" aria-label="Foliole workspace">
      <aside className="panel panel-list" aria-label="Node list panel">
        <header className="panel-header">
          <h2>Nodes</h2>
        </header>
        <div className="panel-body">
          <p>Node list placeholder</p>
        </div>
      </aside>

      <section className="right-stack" aria-label="Editor and review area">
        <section className="panel panel-editor" aria-label="Editor panel">
          <header className="panel-header">
            <h2>Editor</h2>
          </header>
          <div className="panel-body">
            <MarkdownEditor value={content} onChange={setContent} />
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
