import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  loadDesktopWebDavRelayDirectory, saveDesktopWebDavRelayDirectory, saveDesktopWebDavRelayCredentials
} from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { SettingsButton, SettingsControlSlot, SettingsRow } from '../../../../shared/ui';

import { PublishingTextRow } from './PublishingTextRow';

const FOLDER_ERRORS = {
  webdav_relay_invalid_folder_name: 'invalidFolderName',
  webdav_relay_folder_auth_failed: 'folderAuthFailed',
  webdav_relay_parent_unavailable: 'parentUnavailable',
  webdav_relay_folder_name_unavailable: 'folderNameUnavailable',
  webdav_relay_folder_creation_failed: 'folderCreationFailed',
  webdav_relay_created_but_unverified: 'folderUnverified',
  webdav_relay_https_required: 'folderHttpsRequired'
} as const;

function folderError(error: unknown) {
  return error instanceof Error
    ? Object.entries(FOLDER_ERRORS).find(([code]) => error.message.includes(code))?.[1] ?? 'folderCreationFailed'
    : 'folderCreationFailed';
}

function useWebDavRelayDirectory(groupId: string) {
  const [directory, setDirectory] = useState('');
  const [credentialDirectory, setCredentialDirectory] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'loadFailed' | 'idle' | 'running' | 'creating' | 'passed' | 'failed' | 'credentialPassed' | 'credentialFailed' |
    'credentialStorageUnavailable' | (typeof FOLDER_ERRORS)[keyof typeof FOLDER_ERRORS]
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

  async function connect(credentials?: { username: string; password: string }, newFolderName?: string) {
    try {
      const pending = credentials
        ? saveDesktopWebDavRelayCredentials(groupId, directory.trim(), credentials.username, credentials.password, newFolderName)
        : saveDesktopWebDavRelayDirectory(groupId, directory.trim());
      if (!pending) return;
      setStatus(newFolderName === undefined ? 'running' : 'creating');
      const saved = await pending;
      setDirectory(saved);
      if (credentials) setCredentialDirectory(saved);
      setStatus(credentials ? 'credentialPassed' : 'passed');
      return true;
    } catch (error) {
      setStatus(isSecureStorageError(error) ? 'credentialStorageUnavailable'
        : newFolderName !== undefined ? folderError(error) : credentials ? 'credentialFailed' : 'failed');
      return false;
    }
  }

  const changeDirectory = (value: string) => { setDirectory(value); setStatus('idle'); };
  const clearResult = () => setStatus('idle');
  return { directory, credentialDirectory, status, connect, changeDirectory, clearResult };
}

function isSecureStorageError(error: unknown) {
  return error instanceof Error && error.message.includes('webdav_relay_secure_storage_unavailable');
}

export function SettingsWebDavRelayRow({ groupId, bound, credentialActive }: {
  groupId: string;
  bound?: boolean;
  credentialActive?: boolean;
}) {
  const t = useTranslation();
  const [folderName, setFolderName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { directory, credentialDirectory, status, connect, changeDirectory, clearResult } = useWebDavRelayDirectory(groupId);
  const busy = status === 'loading' || status === 'running' || status === 'creating';
  const creating = !bound && Boolean(folderName.trim());
  const credentialInput = Boolean(creating || credentialActive || username || password ||
    (credentialDirectory && directory.trim() === credentialDirectory));
  const canConnect = !busy && Boolean(directory.trim()) &&
    (credentialInput ? Boolean(username.trim() && password) : !bound);
  const submit = async (create = false) => {
    if (!canConnect || creating !== create) return;
    const pending = connect(credentialInput ? { username, password } : undefined,
      create ? folderName.trim() : undefined);
    setPassword('');
    if (await pending) setFolderName('');
  };
  const result = status !== 'idle' && status !== 'loading'
    ? <span role="status">{t(`settings.companionSync.webdav.${status}`)}</span> : null;
  const savedCredentials = credentialDirectory && <span className="break-words">{t('settings.companionSync.webdav.credentialsSaved', { directory: credentialDirectory })}</span>;
  const addressLabel = t(creating ? 'settings.companionSync.webdav.parentFolder' : 'settings.companionSync.webdav.directory');
  return <>
    <div className="[&>[data-settings-row]+[data-settings-row]]:before:block">
      <PublishingTextRow plain title={addressLabel} label={addressLabel}
        description={t(creating ? 'settings.companionSync.webdav.parentFolderHint' : 'settings.companionSync.webdav.directoryHint')}
        disabled={busy || Boolean(bound)} type="url" value={directory} placeholder="https://" onChange={changeDirectory}
        onEnter={() => void submit()} />
      {!bound && <PublishingTextRow plain title={t('settings.companionSync.webdav.newFolder')}
        label={t('settings.companionSync.webdav.newFolder')} description={t('settings.companionSync.webdav.newFolderHint')}
        disabled={busy} value={folderName} placeholder="Foliole"
        onChange={value => { setFolderName(value); clearResult(); }} />}
      <PublishingTextRow plain title={t('settings.companionSync.webdav.username')}
        label={t('settings.companionSync.webdav.username')} description={t('settings.companionSync.webdav.usernameHint')}
        disabled={busy} value={username} onChange={value => { setUsername(value); clearResult(); }} />
      <PublishingTextRow plain title={t('settings.companionSync.webdav.password')}
        label={t('settings.companionSync.webdav.password')} description={t('settings.companionSync.webdav.passwordHint')}
        disabled={busy} type="password" value={password}
        onChange={value => { setPassword(value); clearResult(); }} onEnter={() => void submit()} />
    </div>
    <SettingsRow title={t('settings.companionSync.webdav.service')}
      description={result && savedCredentials ? <>{result}<br />{savedCredentials}</> : result || savedCredentials || t('settings.companionSync.webdav.testHint')}>
      <SettingsControlSlot>
        <SettingsButton disabled={!canConnect} onClick={() => void submit(creating)}>
          {t(creating ? 'settings.companionSync.webdav.createAndSave' : credentialInput ? 'settings.companionSync.webdav.credentialSave' : 'settings.companionSync.webdav.connect')}
        </SettingsButton>
      </SettingsControlSlot>
    </SettingsRow>
  </>;
}
