import path from 'node:path';

import { loadMacosSecurityScopedBookmarkAdapter } from '../macosSecurityScopedBookmarksNative.js';
import type { MacosSecurityScopedBookmarkAdapter } from '../macosSecurityScopedBookmarksNative.js';

export const AGENT_CONTROL_APP_GROUP = 'V589TQH334.group.com.campfirium.foliole.agent-control';
const SESSION_FILE = 'agent-control-session.json';

type AppGroupAdapterLoadResult =
  | { adapter: Pick<MacosSecurityScopedBookmarkAdapter, 'appGroupContainerPath'>; status: 'ready' }
  | { message: string; status: 'module_unavailable' | 'platform_not_supported' };

interface AgentControlSessionPathOptions {
  loadAdapter?: (platform: NodeJS.Platform) => AppGroupAdapterLoadResult;
  mas?: boolean;
  platform?: NodeJS.Platform;
}

export function resolveMasAgentControlSessionPath(options: AgentControlSessionPathOptions = {}) {
  const platform = options.platform ?? process.platform;
  const mas = options.mas ?? process.mas === true;
  if (platform !== 'darwin' || !mas) return null;
  const loaded = (options.loadAdapter ?? loadMacosSecurityScopedBookmarkAdapter)(platform);
  if (loaded.status !== 'ready') throw new Error(`agent_control_app_group_unavailable: ${loaded.message}`);
  const result = loaded.adapter.appGroupContainerPath(AGENT_CONTROL_APP_GROUP);
  if (!result.ok) throw new Error(`agent_control_app_group_unavailable: ${result.errorCode}`);
  return path.join(result.path, SESSION_FILE);
}
