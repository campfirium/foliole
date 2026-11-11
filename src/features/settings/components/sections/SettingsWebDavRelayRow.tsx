import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  loadDesktopWebDavRelayDirectory, saveDesktopWebDavRelayDirectory, testDesktopWebDavRelayCredentials
} from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { SettingsButton, SettingsControlSlot, SettingsFlow, SettingsRow } from '../../../../shared/ui';

import { PublishingTextRow } from './PublishingTextRow';

function useWebDavRelayDirectory(groupId: string) {
  const [directory, setDirectory] = useState('');
  const [status, setStatus] = useState<
    'loading' | 'loadFailed' | 'idle' | 'running' | 'passed' | 'failed' | 'credentialPassed' | 'credentialFailed'
  >('loading');

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

  async function connect(credentials?: { username: string; password: string }) {
    try {
      const pending = credentials
        ? testDesktopWebDavRelayCredentials(groupId, directory.trim(), credentials.username, credentials.password)
        : saveDesktopWebDavRelayDirectory(groupId, directory.trim());
      if (!pending) return;
      setStatus('running');
      const saved = await pending;
      setDirectory(saved);
      setStatus(credentials ? 'credentialPassed' : 'passed');
      return !credentials;
    } catch {
      setStatus(credentials ? 'credentialFailed' : 'failed');
    }
  }

  const changeDirectory = (value: string) => { setDirectory(value); setStatus('idle'); };
  const clearResult = () => setStatus('idle');
  return { directory, status, connect, changeDirectory, clearResult };
}

export function SettingsWebDavRelayRow({ groupId, bound, configured }: {
  groupId: string;
  bound?: boolean;
  configured?: boolean;
}) {
  const t = useTranslation();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { directory, status, connect, changeDirectory, clearResult } = useWebDavRelayDirectory(groupId);
  const busy = Boolean(bound) || status === 'loading' || status === 'running';
  const showForm = !configured || editing || status === 'loadFailed';
  const credentialTest = Boolean(username || password);
  const canConnect = !busy && Boolean(directory.trim()) && (!credentialTest || Boolean(username.trim() && password));
  const submit = async () => {
    if (!canConnect) return;
    const pending = connect(credentialTest ? { username, password } : undefined);
    setPassword('');
    if (await pending) setEditing(false);
  };
  const result = status === 'passed' || status === 'failed' || status === 'loadFailed' ||
    status === 'credentialPassed' || status === 'credentialFailed'
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
      description={t('settings.companionSync.webdav.credentialTestDescription')} />
    <SettingsFlow>
      <PublishingTextRow title={t('settings.companionSync.webdav.directory')}
        label={t('settings.companionSync.webdav.directory')} description={null}
        disabled={busy} type="url" value={directory} placeholder="https://" onChange={changeDirectory}
        onEnter={() => void submit()} />
      <PublishingTextRow title={t('settings.companionSync.webdav.username')}
        label={t('settings.companionSync.webdav.username')} description={null}
        disabled={busy} value={username} onChange={value => { setUsername(value); clearResult(); }} />
      <PublishingTextRow title={t('settings.companionSync.webdav.password')}
        label={t('settings.companionSync.webdav.password')} description={null}
        disabled={busy} type="password" value={password}
        onChange={value => { setPassword(value); clearResult(); }} onEnter={() => void submit()} />
    </SettingsFlow>
    <SettingsRow description={result}>
      <SettingsControlSlot>
        <SettingsButton disabled={!canConnect} onClick={() => void submit()}>
          {t(credentialTest ? 'settings.companionSync.webdav.credentialTest' : 'settings.companionSync.webdav.connect')}
        </SettingsButton>
      </SettingsControlSlot>
    </SettingsRow>
  </>;
}
