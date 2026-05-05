import path from 'node:path';

import { resolveAppPaths } from '../ipc/paths.js';

export function resolveWindowsDiagnosticLogDir() {
  if (process.env.FOLIOLE_WORKDIR) {
    return path.join(process.env.FOLIOLE_WORKDIR, 'logs', 'windows');
  }
  return path.join(resolveAppPaths().app_log_dir, 'windows');
}

export function resolveWindowsDiagnosticLogPath(fileName: string) {
  return path.join(resolveWindowsDiagnosticLogDir(), fileName);
}
