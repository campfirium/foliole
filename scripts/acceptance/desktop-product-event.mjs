/* global clearTimeout, setTimeout */

const PRODUCT_EVENTS = new Set([
  'onSyncGroupDiscoveryChanged', 'onSyncGroupJoinRequestsChanged',
  'onWorkspaceContentChanged', 'onWorkspaceSyncApplied'
]);

function assertProductEvent(eventName) {
  if (!PRODUCT_EVENTS.has(eventName)) {
    throw new Error(`Unsupported desktop product event: ${eventName}`);
  }
}

export async function waitForDesktopProductEvent(page, eventName, {
  command, commandArgs = {}, inspect = (value) => value, timeoutMs = 90_000
} = {}) {
  assertProductEvent(eventName);
  return page.evaluate(async ({ command, commandArgs, eventName, timeoutMs }) => {
    const api = globalThis.electronAPI;
    if (!api?.invoke || typeof api[eventName] !== 'function') {
      throw new Error(`Desktop product event is unavailable: ${eventName}`);
    }
    return await new Promise((resolve, reject) => {
      let unsubscribe = () => undefined;
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timed out waiting for desktop product event: ${eventName}`));
      }, timeoutMs);
      unsubscribe = api[eventName](async (payload) => {
        clearTimeout(timer);
        unsubscribe();
        try {
          resolve(command ? await api.invoke(command, commandArgs) : payload);
        } catch (error) { reject(error); }
      });
    });
  }, { command, commandArgs, eventName, timeoutMs }).then(inspect);
}

export async function subscribeThenInvoke(page, eventName, command, commandArgs = {}, options = {}) {
  const waiting = waitForDesktopProductEvent(page, eventName, options);
  const result = await page.evaluate(async ({ command, commandArgs }) => {
    if (!globalThis.electronAPI?.invoke) throw new Error('Desktop native bridge is unavailable.');
    return globalThis.electronAPI.invoke(command, commandArgs);
  }, { command, commandArgs });
  return { event: await waiting, result };
}

export async function waitForDesktopProductState(page, {
  command, commandArgs = {}, condition, eventName, timeoutMs = 90_000,
  triggerCommand, triggerCommandArgs = {}
}) {
  assertProductEvent(eventName);
  return page.evaluate(async ({ command, commandArgs, condition, eventName, timeoutMs,
    triggerCommand, triggerCommandArgs }) => {
    const api = globalThis.electronAPI;
    if (!api?.invoke || typeof api[eventName] !== 'function') {
      throw new Error(`Desktop product event is unavailable: ${eventName}`);
    }
    const matches = (value) => {
      if (condition.kind === 'join-request-count') {
        if ((value?.join_requests?.length ?? 0) > condition.count) {
          throw new Error('Conflicting Device join requests.');
        }
        return value?.join_requests?.length === condition.count;
      }
      if (condition.kind === 'group') {
        return value?.sync_group?.group_id === condition.groupId
          && (!condition.deviceCount
            || value?.sync_group?.devices?.length === condition.deviceCount);
      }
      if (condition.kind === 'candidate-tag') {
        const candidates = (value?.join_candidates ?? []).filter(
          (item) => item.group_tag === condition.groupTag
        );
        if (candidates.length > 1) throw new Error('Multiple matching Sync Groups were discovered.');
        return candidates.length === 1;
      }
      if (condition.kind === 'candidate-identity') {
        const candidates = (value?.join_candidates ?? []).filter(
          (item) => item.group_id === condition.groupId
            && item.group_tag === condition.groupTag
        );
        if (candidates.length > 1) throw new Error('Multiple matching Sync Groups were discovered.');
        const mismatches = (value?.join_candidates ?? []).filter((item) =>
          item.group_id === condition.groupId || item.group_tag === condition.groupTag);
        if (candidates.length === 0 && mismatches.length > 0) {
          throw new Error('Discovered Sync Group identity did not match id and tag.');
        }
        return candidates.length === 1;
      }
      if (condition.kind === 'fact-prefix-counts') {
        const titles = Object.values(value?.nodesById ?? {}).map((item) => String(item.title));
        return Object.entries(condition.counts).every(([prefix, count]) =>
          titles.filter((title) => title.startsWith(prefix)).length >= count);
      }
      if (condition.kind === 'exact-node') {
        const node = value?.nodesById?.[condition.nodeId];
        return node?.nodeId === condition.nodeId
          && node?.title === condition.title
          && node?.content === condition.content
          && node?.updatedAt === condition.updatedAt;
      }
      if (condition.kind === 'sync-conflict-count') {
        return Array.isArray(value) && value.length >= condition.count;
      }
      throw new Error(`Unsupported desktop product condition: ${condition.kind}`);
    };
    return await new Promise((resolve, reject) => {
      let busy = false; let queued = false;
      let unsubscribe = () => undefined;
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timed out waiting for desktop product state: ${condition.kind}`));
      }, timeoutMs);
      const inspect = async () => {
        if (busy) { queued = true; return; }
        busy = true;
        try {
          const value = await api.invoke(command, commandArgs);
          if (!matches(value)) return;
          clearTimeout(timer);
          unsubscribe();
          resolve(value);
        } catch (error) {
          clearTimeout(timer);
          unsubscribe();
          reject(error);
        } finally {
          busy = false;
          if (queued) { queued = false; void inspect(); }
        }
      };
      unsubscribe = api[eventName](() => { void inspect(); });
      if (triggerCommand) {
        void api.invoke(triggerCommand, triggerCommandArgs).then(inspect, (error) => {
          clearTimeout(timer); unsubscribe(); reject(error);
        });
      } else void inspect();
    });
  }, { command, commandArgs, condition, eventName, timeoutMs,
    triggerCommand, triggerCommandArgs });
}
