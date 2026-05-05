import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './app/App';
import './app/styles.css';
import { getRuntimeInvoke } from './shared/platform/bridge';
import { reportNativeAppReady, reportNativeBootStage } from './shared/testing/nativeBootReporter';

const ROOT_ID = 'root';

function renderStartupError(message: string) {
  const rootElement = document.getElementById(ROOT_ID);
  if (!rootElement) {
    console.error(`[startup] ${message}`);
    return;
  }

  rootElement.innerHTML = `
    <section style="padding:16px;font-family:var(--font-family-interface),Segoe UI,Arial,sans-serif;">
      <h1 style="margin:0 0 8px;font-size:18px;">Foliole failed to start</h1>
      <p style="margin:0;color:#b91c1c;">${message}</p>
      <p style="margin:8px 0 0;color:#475569;">Open devtools for details.</p>
    </section>
  `;
}

function registerBootDiagnostics() {
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
}

function registerAppReadySignals(signalAppReady: (source: string) => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      signalAppReady('double_raf');
    });
  });

  window.addEventListener(
    'load',
    () => {
      signalAppReady('window_load');
    },
    { once: true }
  );

  setTimeout(() => {
    signalAppReady('timeout_1500ms');
  }, 1500);
}

function mountApp() {
  const rootElement = document.getElementById(ROOT_ID);
  if (!rootElement) {
    renderStartupError('Missing #root element in index.html.');
    return;
  }

  registerBootDiagnostics();

  const bootContext = {
    href: window.location.href,
    readyState: document.readyState,
    tauriInvokeReady: Boolean(getRuntimeInvoke()),
    userAgent: navigator.userAgent
  };
  console.info('[startup] boot context', {
    ...bootContext
  });
  reportNativeBootStage('boot_context', bootContext);

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Theme accentColor="gray" appearance="light" grayColor="sand" panelBackground="solid" radius="none" scaling="105%">
        <App />
      </Theme>
    </React.StrictMode>
  );
  reportNativeBootStage('react_render_committed');

  let appReadySignaled = false;
  const signalAppReady = (source: string) => {
    if (appReadySignaled) {
      return;
    }
    appReadySignaled = true;
    reportNativeAppReady({
      href: window.location.href,
      readyState: document.readyState,
      source
    });
  };

  registerAppReadySignals(signalAppReady);
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
