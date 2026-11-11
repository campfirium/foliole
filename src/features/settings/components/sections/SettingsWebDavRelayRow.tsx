import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  loadDesktopWebDavRelayDirectory, saveDesktopWebDavRelayDirectory, saveDesktopWebDavRelayCredentials
} from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { SettingsButton, SettingsControlSlot, SettingsRow } from '../../../../shared/ui';

import { PublishingTextRow } from './PublishingTextRow';

function useWebDavRelayDirectory(groupId: string) {
  const [directory, setDirectory] = useState('');
  const [credentialDirectory, setCredentialDirectory] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'loadFailed' | 'idle' | 'running' | 'passed' | 'failed' | 'credentialPassed' | 'credentialFailed' |
    'credentialStorageUnavailable'
  >('loading');

  useEffect(() => {
    const pending = loadDesktopWebDavRelayDirectory(groupId);
    if (!pending) return;
    let current = true;
    void pending.then(value => {
      if (!current) return;
      setDirectory(value?.directory ?? value?.credential_directory ?? '');
      setCredentialDirectory(value?.credential_directory ?? null);
      setStatus('idle');
    }, (error: unknown) => {
      if (current) setStatus(isSecureStorageError(error) ? 'credentialStorageUnavailable' : 'loadFailed');
    });
    return () => { current = false; };
  }, [groupId]);

  async function connect(credentials?: { username: string; password: string }) {
    try {
      const pending = credentials
        ? saveDesktopWebDavRelayCredentials(groupId, directory.trim(), credentials.username, credentials.password)
        : saveDesktopWebDavRelayDirectory(groupId, directory.trim());
      if (!pending) return;
      setStatus('running');
      const saved = await pending;
      setDirectory(saved);
      if (credentials) setCredentialDirectory(saved);
      setStatus(credentials ? 'credentialPassed' : 'passed');
      return !credentials;
    } catch (error) {
      setStatus(isSecureStorageError(error) ? 'credentialStorageUnavailable' : credentials ? 'credentialFailed' : 'failed');
    }
  }

  const changeDirectory = (value: string) => { setDirectory(value); setStatus('idle'); };
  const clearResult = () => setStatus('idle');
  return { directory, credentialDirectory, status, connect, changeDirectory, clearResult };
}

function isSecureStorageError(error: unknown) {
  return error instanceof Error && error.message.includes('webdav_relay_secure_storage_unavailable');
}

export function SettingsWebDavRelayRow({ groupId, bound, configured, credentialActive }: {
  groupId: string;
  bound?: boolean;
  configured?: boolean;
  credentialActive?: boolean;
}) {
  const t = useTranslation();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { directory, credentialDirectory, status, connect, changeDirectory, clearResult } = useWebDavRelayDirectory(groupId);
  const busy = status === 'loading' || status === 'running';
  const showForm = !configured || editing || status === 'loadFailed';
  const credentialInput = Boolean(credentialActive || username || password || (credentialDirectory && directory.trim() === credentialDirectory));
  const canConnect = !busy && Boolean(directory.trim()) &&
    (credentialInput ? Boolean(username.trim() && password) : !bound);
  const submit = async () => {
    if (!canConnect) return;
    const pending = connect(credentialInput ? { username, password } : undefined);
    setPassword('');
    if (await pending) setEditing(false);
  };
  const result = status === 'passed' || status === 'failed' || status === 'loadFailed' ||
    status === 'credentialPassed' || status === 'credentialFailed' || status === 'credentialStorageUnavailable'
    ? <span role="status">{t(`settings.companionSync.webdav.${status}`)}</span> : null;
  const savedCredentials = credentialDirectory && <span>{t('settings.companionSync.webdav.credentialsSaved', { directory: credentialDirectory })}</span>;
  if (!showForm) return <SettingsRow title={t('settings.companionSync.webdav.service')}
    description={<><span>{directory}</span>{savedCredentials ? <><br />{savedCredentials}</> : null}{result ? <><br />{result}</> : null}</>}>
    <SettingsControlSlot>
      <SettingsButton disabled={busy} onClick={() => setEditing(true)}>
        {t(credentialActive ? 'settings.companionSync.webdav.credentialReplaceMac' : 'settings.companionSync.webdav.configure')}
      </SettingsButton>
    </SettingsControlSlot>
  </SettingsRow>;

  return <>
    <SettingsRow title={t('settings.companionSync.webdav.service')}
      description={result && savedCredentials ? <>{result}<br />{savedCredentials}</> : result || savedCredentials}>
      <SettingsControlSlot>
        <SettingsButton disabled={!canConnect} onClick={() => void submit()}>
          {t(credentialInput ? 'settings.companionSync.webdav.credentialSave' : 'settings.companionSync.webdav.connect')}
        </SettingsButton>
      </SettingsControlSlot>
    </SettingsRow>
    <div className="[&>[data-settings-row]+[data-settings-row]]:before:block">
      <PublishingTextRow plain title={t('settings.companionSync.webdav.directory')}
        label={t('settings.companionSync.webdav.directory')} description={null}
        disabled={busy || Boolean(bound)} type="url" value={directory} placeholder="https://" onChange={changeDirectory}
        onEnter={() => void submit()} />
      <PublishingTextRow plain title={t('settings.companionSync.webdav.username')}
        label={t('settings.companionSync.webdav.username')} description={null}
        disabled={busy} value={username} onChange={value => { setUsername(value); clearResult(); }} />
      <PublishingTextRow plain title={t('settings.companionSync.webdav.password')}
        label={t('settings.companionSync.webdav.password')} description={null}
        disabled={busy} type="password" value={password}
        onChange={value => { setPassword(value); clearResult(); }} onEnter={() => void submit()} />
    </div>
  </>;
}
