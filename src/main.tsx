import React from 'react';
import ReactDOM from 'react-dom/client';

import './app/styles.css';
import { syncAppSettingsWithRuntime } from './shared/platform/appSettingsSync';
import {
  reportRuntimeAppReady,
  reportRuntimeBootStage,
  reportRuntimeBridgeReady,
  resolveRuntimeAppPaths
} from './shared/platform/bridge';
import { installDesktopDebugProbe } from './shared/platform/desktopDebugProbe';
import { installRendererErrorDiagnostics } from './shared/platform/rendererErrorDiagnostics';
import { isRuntimeInvokeAvailable } from './shared/platform/runtimeInvoke';
import { logRuntimeError } from './shared/platform/runtimeLogging';
import { renderStartupErrorView } from './shared/ui/StartupSurface';
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
  document.body.dataset.bootSkeleton = 'hidden';
  renderStartupErrorView(
    rootElement,
    {
      logPath: startupView.logPath,
      message: startupView.errorSummary,
      moduleLabel: startupView.moduleLabel
    },
    createStartupErrorActions({
      logPath: startupView.logPath,
      reportActionFailure: (action, error) => {
        reportRuntimeBootStage('startup_error_action_failed', {
          action,
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
    nativeInvokeReady: isRuntimeInvokeAvailable(),
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
  registerStartupWatchdog();
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
