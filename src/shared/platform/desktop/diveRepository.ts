import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

export function getDiveRepository() {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return {
    list: () => invoke(NATIVE_COMMANDS.listDives),
    create: (title: string) => invoke(NATIVE_COMMANDS.createDive, { title, sourceIds: [] }),
    rename: (diveId: string, title: string) => invoke(NATIVE_COMMANDS.renameDive, { diveId, title }),
    add: (diveId: string, sourceIds: readonly string[]) => invoke(NATIVE_COMMANDS.addDiveSources, { diveId, sourceIds })
  };
}
