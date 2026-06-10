import React from 'react';
import ReactDOM from 'react-dom/client';

import './styles.css';

function WebGuidesApp() {
  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col border border-border bg-canvas">
        <header className="border-b border-border px-6 py-4">
          <p className="m-0 text-ui-sm font-medium text-foreground/55">Foliole</p>
          <h1 className="m-0 mt-2 text-ui-xl font-semibold">Guides</h1>
        </header>
        <div className="flex flex-1 items-center px-6 py-12">
          <div className="max-w-2xl">
            <p className="m-0 text-reading-lg font-medium">Guides for focused reading and review.</p>
            <p className="m-0 mt-4 max-w-xl text-ui-lg text-foreground/64">
              This space will hold practical guides for building a steady reading workflow in Foliole.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element in Web Guides entry.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <WebGuidesApp />
  </React.StrictMode>
);
