import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './app/App';
import './app/styles.css';
import { syncAppSettingsWithRuntime } from './shared/platform/appSettingsSync';
import {
  getRuntimeInvoke,
  reportRuntimeAppReady,
  reportRuntimeBootStage,
  reportRuntimeBridgeReady,
  resolveRuntimeAppPaths
} from './shared/platform/bridge';
import { installDesktopDebugProbe } from './shared/platform/desktopDebugProbe';
import { bootstrapApp } from './startupBootstrap';

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
    reportRuntimeBootStage('window_error', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[startup] unhandled rejection', event.reason);
    reportRuntimeBootStage('unhandled_rejection', {
      reason: String(event.reason)
    });
  });
}

function registerAppReadySignals(signalAppReady: (source: string) => void) {
  reportRuntimeBootStage('app_ready_signal_registration');
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

function registerStartupWatchdog() {
  setTimeout(() => {
    if (window.__FOLIOLE_APP_READY_REPORTED__) {
      return;
    }
    reportRuntimeBootStage('app_ready_timeout', {
      href: window.location.href,
      readyState: document.readyState,
      rootPresent: Boolean(document.getElementById(ROOT_ID))
    });
  }, 5000);
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
    nativeInvokeReady: Boolean(getRuntimeInvoke()),
    userAgent: navigator.userAgent
  };
  console.info('[startup] boot context', {
    ...bootContext
  });
  reportRuntimeBootStage('boot_context', bootContext);

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  reportRuntimeBootStage('react_render_committed');

  let appReadySignaled = false;
  const signalAppReady = (source: string) => {
    if (appReadySignaled) {
      return;
    }
    appReadySignaled = true;
    reportRuntimeBootStage('app_ready_signal_received', {
      readyState: document.readyState,
      source
    });
    reportRuntimeAppReady({
      href: window.location.href,
      readyState: document.readyState,
      source
    });
  };

  registerStartupWatchdog();
  registerAppReadySignals(signalAppReady);
}

async function reportDesktopBridgeReady() {
  const appPaths = await resolveRuntimeAppPaths();
  if (!appPaths) {
    return;
  }
  reportRuntimeBridgeReady({
    appDataDir: appPaths.appDataDir,
    appCacheDir: appPaths.appCacheDir,
    appConfigDir: appPaths.appConfigDir,
    appLogDir: appPaths.appLogDir,
    bridgeAvailable: true,
    href: window.location.href,
    readyState: document.readyState
  });
}

installDesktopDebugProbe();
bootstrapApp({
  mountApp,
  renderStartupError,
  reportBootStage: reportRuntimeBootStage,
  reportBridgeReady: reportDesktopBridgeReady,
  syncAppSettings: syncAppSettingsWithRuntime
});
