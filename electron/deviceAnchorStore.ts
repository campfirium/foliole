import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  createSyncGroupDeviceIdentity,
  parseDeviceAnchor
} from '../lib/platform/syncGroupUnifiedContract.js';

import { AGENT_CONTROL_APP_GROUP } from './agentControl/agentControlSessionPath.js';
import {
  loadMacosSecurityScopedBookmarkAdapter,
  type MacosSecurityScopedBookmarkAdapter
} from './macosSecurityScopedBookmarksNative.js';

const ANCHOR_FILE = 'anchor-v1';

type AppGroupAdapterLoadResult =
  | { adapter: Pick<MacosSecurityScopedBookmarkAdapter, 'appGroupContainerPath'>; status: 'ready' }
  | { message: string; status: 'module_unavailable' | 'platform_not_supported' };

export interface DesktopDeviceAnchorOptions {
  env?: NodeJS.ProcessEnv;
  loadAdapter?: (platform: NodeJS.Platform) => AppGroupAdapterLoadResult;
  platform?: NodeJS.Platform;
}

export function resolveDesktopDeviceAnchorFilePath(options: DesktopDeviceAnchorOptions = {}) {
  const platform = options.platform ?? process.platform;
  if (platform === 'darwin') {
    const loaded = (options.loadAdapter ?? loadMacosSecurityScopedBookmarkAdapter)(platform);
    if (loaded.status !== 'ready') throw new Error(`device_anchor_store_unavailable:${loaded.status}`);
    const container = loaded.adapter.appGroupContainerPath(AGENT_CONTROL_APP_GROUP);
    if (!container.ok) throw new Error(`device_anchor_store_unavailable:${container.errorCode}`);
    return path.posix.join(container.path, 'device-identity', ANCHOR_FILE);
  }
  if (platform === 'win32') {
    const localAppData = options.env?.LOCALAPPDATA?.trim() ?? process.env.LOCALAPPDATA?.trim();
    if (!localAppData || !path.win32.isAbsolute(localAppData)) {
      throw new Error('device_anchor_local_app_data_unavailable');
    }
    return path.win32.join(localAppData, 'Foliole', 'device-identity', ANCHOR_FILE);
  }
  throw new Error(`device_anchor_platform_unsupported:${platform}`);
}

export async function loadOrCreateDesktopDeviceAnchor(
  filePath: string,
  createAnchor: () => string = randomUUID
) {
  try {
    return await readAnchor(filePath);
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error;
  }
  const anchor = parseDeviceAnchor(createAnchor().toLowerCase());
  await fs.mkdir(path.dirname(filePath), { mode: 0o700, recursive: true });
  try {
    await fs.writeFile(filePath, `${anchor}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return anchor;
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) throw error;
    return readAnchor(filePath);
  }
}

export async function loadDesktopDeviceIdentity(args: {
  anchorOptions?: DesktopDeviceAnchorOptions;
  groupId: string;
  libraryPath: string;
  realpath?: (value: string) => Promise<string>;
}) {
  const platform = args.anchorOptions?.platform ?? process.platform;
  const anchorFile = resolveDesktopDeviceAnchorFilePath(args.anchorOptions);
  const deviceAnchor = await loadOrCreateDesktopDeviceAnchor(anchorFile);
  const canonicalPath = await (args.realpath ?? fs.realpath)(args.libraryPath);
  return {
    anchor_file: anchorFile,
    identity: createSyncGroupDeviceIdentity({
      device_anchor: deviceAnchor,
      group_id: args.groupId,
      library_path: canonicalPath,
      path_flavor: platform === 'win32' ? 'windows' : 'posix'
    })
  };
}

async function readAnchor(filePath: string) {
  const value = await fs.readFile(filePath, 'utf8');
  if (!value.endsWith('\n') || value.indexOf('\n') !== value.length - 1) {
    throw new Error('device_anchor_file_invalid');
  }
  return parseDeviceAnchor(value.slice(0, -1));
}

function hasCode(error: unknown, code: string) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}
