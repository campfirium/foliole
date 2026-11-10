import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';

type DiveReminderTarget = { id: string; title: string };

const ReminderDraftContext = createContext<{
  createForDive(dive: DiveReminderTarget): void;
  takeDive(): DiveReminderTarget | null;
} | null>(null);

export function ReminderDraftProvider({ children, openReminders }: {
  children: ReactNode;
  openReminders(): void;
}) {
  const pendingDive = useRef<DiveReminderTarget | null>(null);
  const createForDive = useCallback((dive: DiveReminderTarget) => {
    pendingDive.current = dive;
    openReminders();
  }, [openReminders]);
  const takeDive = useCallback(() => {
    const dive = pendingDive.current;
    pendingDive.current = null;
    return dive;
  }, []);
  const value = useMemo(() => ({ createForDive, takeDive }), [createForDive, takeDive]);
  return <ReminderDraftContext.Provider value={value}>{children}</ReminderDraftContext.Provider>;
}

export function useReminderDraftRequest() {
  return useContext(ReminderDraftContext);
}
