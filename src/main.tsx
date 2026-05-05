import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './app/App';
import './app/styles.css';
import { reportNativeAppReady, reportNativeBootStage } from './shared/testing/nativeBootReporter';

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
    reportNativeBootStage('window_error', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[startup] unhandled rejection', event.reason);
    reportNativeBootStage('unhandled_rejection', {
      reason: String(event.reason)
    });
  });

  console.info('[startup] boot context', {
    href: window.location.href,
    readyState: document.readyState,
    tauriInvokeReady: Boolean((window as Window & { __TAURI__?: { core?: { invoke?: unknown } } }).__TAURI__?.core?.invoke),
    userAgent: navigator.userAgent
  });
  reportNativeBootStage('boot_context', {
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
  reportNativeBootStage('react_render_committed');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      reportNativeAppReady({
        href: window.location.href,
        readyState: document.readyState
      });
    });
  });
}

try {
  reportNativeBootStage('boot_start');
  mountApp();
} catch (error) {
  console.error('[startup] fatal bootstrap error', error);
  reportNativeBootStage('fatal_bootstrap_error', {
    message: error instanceof Error ? error.message : 'Unknown startup exception'
  });
  const message = error instanceof Error ? error.message : 'Unknown startup exception';
  renderStartupError(message);
}
