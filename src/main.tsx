import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './app/App';
import './app/styles.css';

const ROOT_ID = 'root';

function renderStartupError(message: string) {
  const rootElement = document.getElementById(ROOT_ID);
  if (!rootElement) {
    console.error(`[startup] ${message}`);
    return;
  }

  rootElement.innerHTML = `
    <section style="padding:16px;font-family:Segoe UI,Arial,sans-serif;">
      <h1 style="margin:0 0 8px;font-size:18px;">Foliole failed to start</h1>
      <p style="margin:0;color:#b91c1c;">${message}</p>
      <p style="margin:8px 0 0;color:#475569;">Open devtools for details.</p>
    </section>
  `;
}

function mountApp() {
  const rootElement = document.getElementById(ROOT_ID);
  if (!rootElement) {
    renderStartupError('Missing #root element in index.html.');
    return;
  }

  window.addEventListener('error', (event) => {
    console.error('[startup] uncaught error', event.error);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[startup] unhandled rejection', event.reason);
  });

  console.info('[startup] boot context', {
    href: window.location.href,
    readyState: document.readyState,
    tauriInvokeReady: Boolean((window as Window & { __TAURI__?: { core?: { invoke?: unknown } } }).__TAURI__?.core?.invoke),
    userAgent: navigator.userAgent
  });

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

try {
  mountApp();
} catch (error) {
  console.error('[startup] fatal bootstrap error', error);
  const message = error instanceof Error ? error.message : 'Unknown startup exception';
  renderStartupError(message);
}
