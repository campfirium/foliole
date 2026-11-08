import type { Dive } from '../../../../lib/core/nodes/dive';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

const changeListeners = new Set<(dive: Dive) => void>();

export function subscribeToDiveChanges(listener: (dive: Dive) => void) {
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
}

async function publish(result: Promise<Dive>) {
  const dive = await result;
  for (const listener of changeListeners) listener(dive);
  return dive;
}

export function getDiveRepository() {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return {
    list: () => invoke(NATIVE_COMMANDS.listDives),
    create: (title: string) => publish(invoke(NATIVE_COMMANDS.createDive, { title, sourceIds: [] })),
    rename: (diveId: string, title: string) => publish(invoke(NATIVE_COMMANDS.renameDive, { diveId, title })),
    add: (diveId: string, sourceIds: readonly string[]) => publish(invoke(NATIVE_COMMANDS.addDiveSources, { diveId, sourceIds }))
  };
}
