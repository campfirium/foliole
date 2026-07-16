import { app, type BrowserWindow } from 'electron';

import { ensureAgentControlApiServer } from './agentControl/agentControlServer.js';
import { resolveFolioleAppVersion } from './appVersion.js';
import { installBackgroundTray } from './backgroundPresence.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { installGlobalClipShortcut } from './globalClipShortcut.js';
import { installGlobalCaptureToastOpenHandler } from './globalClipToastNavigation.js';
import { runGlobalClipToInbox } from './globalClipToInbox.js';
import { getMainWindow } from './mainWindowRegistry.js';

function startAgentControlApiLifecycle() {
  void (async () => {
    const status = await ensureAgentControlApiServer({ appVersion: resolveFolioleAppVersion(app) });
    if (status.state !== 'failed') return;
    appendMainProcessDiagnosticLog('agent_control_start_failed', {
      message: status.last_error ?? 'Agent Control API failed to start',
      state: status.state
    });
  })().catch((error) => {
    appendMainProcessDiagnosticLog('agent_control_start_failed', { error });
  });
}

export function installDatabaseBackedEntryPoints(
  openMainWindow: () => Promise<BrowserWindow | null>
) {
  installGlobalClipShortcut({ captureToInbox: runGlobalClipToInbox });
  installGlobalCaptureToastOpenHandler({ openMainWindow });
  installBackgroundTray({
    captureToInbox: runGlobalClipToInbox,
    getMainWindow,
    openMainWindow
  });
  startAgentControlApiLifecycle();
}
