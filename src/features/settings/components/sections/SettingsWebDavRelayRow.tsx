import { useEffect, useState } from 'react';

import { NATIVE_COMMANDS } from '../../../../../lib/platform/nativeCommands';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { getRuntimeInvoke } from '../../../../shared/platform/runtimeInvoke';
import { SettingsButton, SettingsRow, settingsFieldClassName } from '../../../../shared/ui';

function useWebDavRelayDirectory(groupId: string) {
  const [directory, setDirectory] = useState('');
  const [status, setStatus] = useState<'loading' | 'loadFailed' | 'idle' | 'running' | 'passed' | 'failed'>('loading');

  useEffect(() => {
    const invoke = getRuntimeInvoke();
    if (!invoke) return;
    let current = true;
    void invoke(NATIVE_COMMANDS.loadWebDavRelayDirectory, { group_id: groupId }).then(value => {
      if (!current) return;
      setDirectory(value ?? '');
      setStatus('idle');
    }, () => {
      if (current) setStatus('loadFailed');
    });
    return () => { current = false; };
  }, [groupId]);

  async function testAndSave() {
    const invoke = getRuntimeInvoke();
    if (!invoke) return;
    setStatus('running');
    try {
      const saved = await invoke(NATIVE_COMMANDS.saveWebDavRelayDirectory, {
        group_id: groupId, directory_url: directory.trim()
      });
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
