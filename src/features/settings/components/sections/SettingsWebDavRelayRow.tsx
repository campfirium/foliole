import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { loadDesktopWebDavRelayDirectory, saveDesktopWebDavRelayDirectory } from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { SettingsButton, SettingsRow, settingsFieldClassName } from '../../../../shared/ui';

function useWebDavRelayDirectory(groupId: string) {
  const [directory, setDirectory] = useState('');
  const [status, setStatus] = useState<'loading' | 'loadFailed' | 'idle' | 'running' | 'passed' | 'failed'>('loading');

  useEffect(() => {
    const pending = loadDesktopWebDavRelayDirectory(groupId);
    if (!pending) return;
    let current = true;
    void pending.then(value => {
      if (!current) return;
      setDirectory(value ?? '');
      setStatus('idle');
    }, () => {
      if (current) setStatus('loadFailed');
    });
    return () => { current = false; };
  }, [groupId]);

  async function testAndSave() {
    try {
      const pending = saveDesktopWebDavRelayDirectory(groupId, directory.trim());
      if (!pending) return;
      setStatus('running');
      const saved = await pending;
      setDirectory(saved);
      setStatus('passed');
    } catch {
      setStatus('failed');
    }
  }

  const changeDirectory = (value: string) => { setDirectory(value); setStatus('idle'); };
  return { directory, status, testAndSave, changeDirectory };
}

export function SettingsWebDavRelayRow({ groupId, bound }: { groupId: string; bound?: boolean }) {
  const t = useTranslation();
  const { directory, status, testAndSave, changeDirectory } = useWebDavRelayDirectory(groupId);
  const busy = Boolean(bound) || status === 'loading' || status === 'running';
  return (
    <SettingsRow
      title={t('settings.companionSync.webdav.title')}
      description={status === 'passed' || status === 'failed' || status === 'loadFailed'
        ? <span role="status">{t(`settings.companionSync.webdav.${status}`)}</span>
        : undefined}
    >
      <div className="flex items-center gap-2">
        <input
          aria-label={t('settings.companionSync.webdav.directory')}
          className={settingsFieldClassName()}
          disabled={busy}
          onChange={(event) => changeDirectory(event.target.value)}
          placeholder="https://"
          spellCheck={false}
          type="url"
          value={directory}
        />
        <SettingsButton disabled={busy || !directory.trim()} onClick={() => void testAndSave()}>
          {t('settings.companionSync.webdav.test')}
        </SettingsButton>
      </div>
    </SettingsRow>
  );
}
