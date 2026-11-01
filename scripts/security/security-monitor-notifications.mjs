import path from 'node:path';
import { recordOwnerHealth } from './security-owner-health.mjs';
import { notifySecurityOwner } from './security-notifications.mjs';

export function notifySecurityMonitor(workspace, errors, options = {}) {
  const owner = path.join(workspace, '.lab/internal/security-maintenance');
  const now = options.now ?? Date.now();
  recordOwnerHealth(owner, { role: 'github-monitor', status: errors.length ? 'error' : 'clean',
    reason: errors.length ? JSON.stringify([...errors].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) : undefined,
    evidenceAt: new Date(now).toISOString() }, now);
  return notifySecurityOwner(owner, workspace, options);
}
