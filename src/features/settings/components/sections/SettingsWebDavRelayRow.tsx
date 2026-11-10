import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { loadDesktopWebDavRelayDirectory, saveDesktopWebDavRelayDirectory } from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { SettingsButton, SettingsControlSlot, SettingsFlow, SettingsRow } from '../../../../shared/ui';

import { PublishingTextRow } from './PublishingTextRow';

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
      return true;
    } catch {
      setStatus('failed');
    }
  }

  const changeDirectory = (value: string) => { setDirectory(value); setStatus('idle'); };
  return { directory, status, testAndSave, changeDirectory };
}

export function SettingsWebDavRelayRow({ groupId, bound, configured }: {
  groupId: string;
  bound?: boolean;
  configured?: boolean;
}) {
  const t = useTranslation();
  const [editing, setEditing] = useState(false);
  const { directory, status, testAndSave, changeDirectory } = useWebDavRelayDirectory(groupId);
  const busy = Boolean(bound) || status === 'loading' || status === 'running';
  const showForm = !configured || editing || status === 'loadFailed';
  const connect = async () => {
    if (await testAndSave()) setEditing(false);
  };
  const result = status === 'passed' || status === 'failed' || status === 'loadFailed'
    ? <span role="status">{t(`settings.companionSync.webdav.${status}`)}</span> : null;
  if (!showForm) return <SettingsRow title={t('settings.companionSync.webdav.service')}
    description={<><span>{directory}</span>{result ? <><br />{result}</> : null}</>}>
    <SettingsControlSlot>
      <SettingsButton disabled={busy} onClick={() => setEditing(true)}>
        {t('settings.companionSync.webdav.configure')}
      </SettingsButton>
    </SettingsControlSlot>
  </SettingsRow>;

  return <>
    <SettingsRow title={t('settings.companionSync.webdav.service')}
      description={t('settings.companionSync.webdav.credentialsPending')} />
    <SettingsFlow>
      <PublishingTextRow title={t('settings.companionSync.webdav.directory')}
        label={t('settings.companionSync.webdav.directory')} description={null}
        disabled={busy} type="url" value={directory} placeholder="https://" onChange={changeDirectory}
        onEnter={() => { if (!busy && directory.trim()) void connect(); }} />
      <PublishingTextRow title={t('settings.companionSync.webdav.username')}
        label={t('settings.companionSync.webdav.username')} description={null} disabled value="" onChange={() => {}} />
      <PublishingTextRow title={t('settings.companionSync.webdav.password')}
        label={t('settings.companionSync.webdav.password')} description={null} disabled type="password" value="" onChange={() => {}} />
    </SettingsFlow>
    <SettingsRow description={result}>
      <SettingsControlSlot>
        <SettingsButton disabled={busy || !directory.trim()} onClick={() => void connect()}>
          {t('settings.companionSync.webdav.connect')}
        </SettingsButton>
      </SettingsControlSlot>
    </SettingsRow>
  </>;
}
