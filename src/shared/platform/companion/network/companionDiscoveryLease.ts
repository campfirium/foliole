import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import type { CompanionNativeDiscoveryEvent, CompanionWorkspaceSyncPlugin } from '../../companionWorkspaceSyncPluginTypes';

type Listener = (event: CompanionNativeDiscoveryEvent) => void;
type Plugin = Pick<CompanionWorkspaceSyncPlugin, 'addListener' | 'startDiscoverySession' | 'stopDiscoverySession'>;
const brokers = new WeakMap<Plugin, ReturnType<typeof createBroker>>();
export function acquireCompanionDiscovery(listener: Listener, plugin: Plugin = FolioleCompanionSync) {
  let broker = brokers.get(plugin);
  if (!broker) { broker = createBroker(plugin); brokers.set(plugin, broker); }
  return broker(listener);
}

function createBroker(plugin: Plugin) {
  const listeners = new Set<Listener>();
  let latest: CompanionNativeDiscoveryEvent | undefined;
  let handle: Awaited<ReturnType<typeof plugin.addListener>> | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  function serialize<T>(task: () => Promise<T>) {
    const work = queue.then(task);
    queue = work.catch(() => undefined);
    return work;
  }
  function publish(event: CompanionNativeDiscoveryEvent) {
    latest = event;
    for (const listener of listeners) listener(event);
  }
  return async (listener: Listener) => {
    await serialize(async () => {
      listeners.add(listener);
      try {
        if (!handle) {
          handle = await plugin.addListener('syncGroupDiscoveryChanged', publish);
          publish(await plugin.startDiscoverySession());
        } else if (latest) listener(latest);
      } catch (error) {
        listeners.delete(listener);
        if (!listeners.size) {
          await plugin.stopDiscoverySession().catch(() => undefined);
          await handle?.remove(); handle = undefined; latest = undefined;
        }
        throw error;
      }
    });
    let released = false;
    return () => serialize(async () => {
      if (released) return;
      released = true;
      listeners.delete(listener);
      if (listeners.size) return;
      try { await plugin.stopDiscoverySession(); }
      finally { await handle?.remove(); handle = undefined; latest = undefined; }
    });
  };
}
