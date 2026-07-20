import { createContext, useContext, type ReactNode } from 'react';

import { useCompanionHandoffReminderScheduler } from './useCompanionHandoffReminderScheduler';
import { useCompanionHandoffReminderSettings } from './useCompanionHandoffReminderSettings';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type HandoffReminderRuntimeValue = ReturnType<typeof useCompanionHandoffReminderSettings>;

const HandoffReminderRuntimeContext = createContext<HandoffReminderRuntimeValue | null>(null);

export function CompanionHandoffReminderRuntime(props: {
  children: ReactNode;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const handoffReminders = useCompanionHandoffReminderSettings(
    props.workspaceSync.state.last_synced_at
  );
  useCompanionHandoffReminderScheduler({
    settings: handoffReminders.settings,
    workspaceSync: props.workspaceSync
  });

  return (
    <HandoffReminderRuntimeContext.Provider value={handoffReminders}>
      {props.children}
    </HandoffReminderRuntimeContext.Provider>
  );
}

export function useCompanionHandoffReminderRuntime() {
  const runtime = useContext(HandoffReminderRuntimeContext);
  if (!runtime) throw new Error('Companion handoff reminder runtime is unavailable.');
  return runtime;
}
