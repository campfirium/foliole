import { useWorkspaceStore } from './workspaceStore';

const pending = new Map<string, Set<Promise<boolean>>>();
const keyFor = (scope: string, nodeId: string) => JSON.stringify([scope, nodeId]);

// Local command completion only; no state is sent to another device.
export function runWorkspaceContentCommand<T>(command: () => T): T {
  const { libraryScope, activeNodeId } = useWorkspaceStore.getState();
  const result = command();
  if (!libraryScope || !activeNodeId || (!result || typeof (result as { then?: unknown }).then !== 'function')) return result;
  const key = keyFor(libraryScope, activeNodeId);
  const commands = pending.get(key) ?? new Set<Promise<boolean>>();
  const completion = Promise.resolve(result).then(value => value !== false, () => false);
  commands.add(completion);
  pending.set(key, commands);
  void completion.then(() => {
    commands.delete(completion);
    if (commands.size === 0 && pending.get(key) === commands) pending.delete(key);
  });
  return result;
}

export async function waitForWorkspaceContentCommands(scope: string, nodeId: string) {
  const key = keyFor(scope, nodeId);
  while (pending.get(key)?.size) {
    if ((await Promise.all([...pending.get(key)!])).includes(false)) return false;
  }
  return true;
}
