/* global process */

export const WINDOWS_CLIENT_ACTIONS = new Set(['status', 'start', 'stop', 'restart', 'full-restart']);

export function resolveWindowsClientAction(argv, env = process.env) {
  const action = argv[2] ?? env.WINDOWS_CLIENT_ACTION ?? 'status';
  if (!WINDOWS_CLIENT_ACTIONS.has(action)) {
    throw new Error(`unsupported Windows client action: ${action}`);
  }
  return action;
}
