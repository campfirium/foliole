import { createContext, lazy, Suspense, type ReactNode, useContext, useEffect, useEffectEvent, useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, SettingsControlSlot, SettingsRow } from '../../../shared/ui';
import { subscribeSuperMemoImportOpen } from '../model/superMemoImportRequests';

const SuperMemoDraftDialog = lazy(() => import('./SuperMemoDraftDialog')
  .then(module => ({ default: module.SuperMemoDraftDialog })));

type LaunchSource = { surface: 'settings'; translate: string | undefined } | { surface: 'workspace' };

const SuperMemoSession = createContext<((source: LaunchSource) => void) | null>(null);

export function SuperMemoSessionProvider({ children, settingsOpen, libraryScope, listenForCommand = false }: {
  children: ReactNode; settingsOpen: boolean; libraryScope?: string | undefined; listenForCommand?: boolean;
}) {
  const [session, setSession] = useState<{
    scope: string | undefined; source?: LaunchSource | undefined; grades?: SuperMemoGradeMap;
  }>({ scope: libraryScope });
  if (session.scope !== libraryScope) setSession({ scope: libraryScope });

  function launch(source: LaunchSource) {
    if (session.grades) {
      setSession({ ...session, source });
      return;
    }
    void import('../../../shared/platform/import/superMemoImportRuntimeRepository')
      .then(module => module.loadSuperMemoGradeMap())
      .then(grades => {
        setSession(current => current.scope === libraryScope ? { scope: libraryScope, grades, source } : current);
      });
  }

  const launchFromCommand = useEffectEvent(() => launch({ surface: 'workspace' }));
  useEffect(() => {
    if (listenForCommand) return subscribeSuperMemoImportOpen(() => launchFromCommand());
  }, [listenForCommand]);

  const source = session.source;
  const open = source?.surface === 'workspace' || (source?.surface === 'settings' && settingsOpen);
  return (
    <SuperMemoSession.Provider value={launch}>
      {children}
      {session.grades ? (
        <Suspense fallback={null}>
          <SuperMemoDraftDialog key={libraryScope} open={open} initialGrades={session.grades}
            close={() => setSession(current => ({ ...current, source: undefined }))}
            translate={source?.surface === 'settings' ? source.translate : undefined} />
        </Suspense>
      ) : null}
    </SuperMemoSession.Provider>
  );
}

function SuperMemoImportRow() {
  const t = useTranslation();
  const launch = useContext(SuperMemoSession);
  return (
    <SettingsRow title={t('settings.general.dataMigration.superMemo')}>
      <SettingsControlSlot>
        <AppButton onClick={event => {
          launch?.({
            surface: 'settings',
            translate: event.currentTarget.closest<HTMLElement>('[data-settings-root-dialog]')?.style.translate
          });
        }}>{t('desktop.superMemoDrafts.open')}</AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsSuperMemoImport() {
  const launch = useContext(SuperMemoSession);
  return launch ? <SuperMemoImportRow /> : (
    <SuperMemoSessionProvider settingsOpen><SuperMemoImportRow /></SuperMemoSessionProvider>
  );
}
