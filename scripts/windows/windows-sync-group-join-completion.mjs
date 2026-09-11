import { setTimeout as delay } from 'node:timers/promises';

export async function invokeWindowsSyncGroupCommand(page, command, args = {}) {
  return page.evaluate(async ({ command, args }) => {
    if (!globalThis.electronAPI?.invoke) throw new Error('Desktop native bridge is unavailable.');
    return globalThis.electronAPI.invoke(command, args);
  }, { args, command });
}

function joinedGroup(overview, expectedGroupId) {
  return overview.sync_group?.group_id === expectedGroupId
    && overview.sync_group.devices.some((device) =>
      device.device_identity_key === overview.sync_group.local_device_identity_key
      && device.state === 'active');
}

export function createWindowsJoinedGroupWaiter(invoke) {
  return async function waitForJoinedGroup(
    page, expectedGroupId, timeoutMs = 12 * 60_000, pause = delay
  ) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const overview = await invoke(page, 'load_sync_group_overview');
      if (joinedGroup(overview, expectedGroupId)) return overview;
      if (overview.join_request) {
        try {
          const completed = await invoke(page, 'complete_sync_group_join');
          if (joinedGroup(completed, expectedGroupId)) return completed;
        } catch (error) {
          if (!String(error).includes('sync_group_join_request_pending')) throw error;
        }
      }
      await pause(1_000);
    }
    throw new Error('Timed out waiting for ordinary Sync Group synchronization.');
  };
}

export const waitForJoinedGroup = createWindowsJoinedGroupWaiter(invokeWindowsSyncGroupCommand);
