import React from 'react';
import ReactDOM from 'react-dom/client';

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
import { installRendererErrorDiagnostics } from './shared/platform/rendererErrorDiagnostics';
import { logRuntimeError } from './shared/platform/runtimeLogging';
import { renderStartupBootView, renderStartupErrorView } from './shared/ui/StartupSurface';
import { bootstrapApp } from './startupBootstrap';
import { createStartupErrorActions, resolveStartupView } from './startupViewMode';

const ROOT_ID = 'root';

function renderStartupError(message: string) {
  const rootElement = document.getElementById(ROOT_ID);
  if (!rootElement) {
    logRuntimeError('startup root missing', {
      action: 'render_startup_error',
      area: 'bridge',
      message
    });
    return;
  }

  renderStartupErrorView(rootElement, message);
}

function renderStartupViewIfRequested() {
  const startupView = resolveStartupView(window.location.search);
  if (!startupView) {
    return false;
  }
  const rootElement = document.getElementById(ROOT_ID);
  if (!rootElement) {
    renderStartupError('Missing #root element in index.html.');
    return true;
  }
  registerBootDiagnostics();
  reportRuntimeBootStage('startup_surface_render', { kind: startupView.kind });
  if (startupView.kind === 'booting') {
    renderStartupBootView(rootElement);
    return true;
  }
  renderStartupErrorView(
    rootElement,
    {
      logPath: startupView.logPath,
      message: startupView.errorSummary,
      moduleLabel: startupView.moduleLabel
    },
    createStartupErrorActions({
      getRuntimeInvoke,
      logPath: startupView.logPath,
      reportActionFailure: (command, error) => {
        reportRuntimeBootStage('startup_error_action_failed', {
          command,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    })
  );
  reportRuntimeAppReady({
    href: window.location.href,
    readyState: document.readyState,
    source: 'startup_error_surface'
  });
  return true;
}

function registerBootDiagnostics() {
  window.addEventListener('error', (event) => {
    reportRuntimeBootStage('window_error', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
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

async function mountApp() {
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

  const { App } = await import('./app/App');
  const { StartupErrorBoundary } = await import('./shared/ui/StartupErrorBoundary');

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <StartupErrorBoundary
        moduleLabel="Desktop renderer"
        onError={(error, info) => {
          reportRuntimeBootStage('renderer_error_boundary', {
            componentStack: info.componentStack,
            message: error.message
          });
        }}
      >
        <App />
      </StartupErrorBoundary>
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
installRendererErrorDiagnostics();
if (!renderStartupViewIfRequested()) {
  bootstrapApp({
    mountApp,
    renderStartupError,
    reportBootStage: reportRuntimeBootStage,
    reportBridgeReady: reportDesktopBridgeReady,
    syncAppSettings: syncAppSettingsWithRuntime
  });
}
