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
  webdav_relay_folder_creation_failed: 'folderCreationFailed',
  webdav_relay_created_but_unverified: 'folderUnverified',
  webdav_relay_https_required: 'folderHttpsRequired'
} as const;

function folderError(error: unknown) {
  return error instanceof Error
    ? Object.entries(FOLDER_ERRORS).find(([code]) => error.message.includes(code))?.[1] ?? 'credentialFailed'
    : 'credentialFailed';
}

const DEFAULT_FOLDER_NAME = 'foliole';

function splitDirectory(directory: string) {
  const parent = URL.parse(directory);
  if (!parent) return { address: directory, folder: '' };
  const pathname = parent.pathname.replace(/\/$/, '');
  const separator = pathname.lastIndexOf('/');
  const segment = pathname.slice(separator + 1);
  parent.pathname = pathname.slice(0, separator + 1);
  try {
    return { address: parent.href, folder: decodeURIComponent(segment) };
  } catch {
    return { address: parent.href, folder: segment };
  }
}

function useWebDavRelayDirectory(groupId: string) {
  const [directory, setDirectory] = useState('');
  const [fields, setFields] = useState(() => splitDirectory(''));
  const [credentialDirectory, setCredentialDirectory] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'loadFailed' | 'idle' | 'running' | 'passed' | 'failed' | 'credentialPassed' | 'credentialFailed' |
    'credentialStorageUnavailable' | (typeof FOLDER_ERRORS)[keyof typeof FOLDER_ERRORS]
  >('loading');

  useEffect(() => {
    const pending = loadDesktopWebDavRelayDirectory(groupId);
    if (!pending) return;
    let current = true;
    void pending.then(value => {
      if (!current) return;
      const saved = value?.directory ?? value?.credential_directory ?? '';
      setDirectory(saved);
      setFields(splitDirectory(saved));
      setCredentialDirectory(value?.credential_directory ?? null);
      setStatus('idle');
    }, (error: unknown) => {
      if (current) setStatus(isSecureStorageError(error) ? 'credentialStorageUnavailable' : 'loadFailed');
    });
    return () => { current = false; };
  }, [groupId]);

  async function connect(address: string, credentials?: { username: string; password: string }, newFolderName?: string) {
    try {
      const pending = credentials
        ? saveDesktopWebDavRelayCredentials(groupId, address, credentials.username, credentials.password, newFolderName)
        : saveDesktopWebDavRelayDirectory(groupId, address);
      if (!pending) return;
      setStatus('running');
      const saved = await pending;
      setDirectory(saved);
      setFields(splitDirectory(saved));
      if (credentials) setCredentialDirectory(saved);
      setStatus(credentials ? 'credentialPassed' : 'passed');
      return true;
    } catch (error) {
      setStatus(isSecureStorageError(error) ? 'credentialStorageUnavailable'
        : newFolderName !== undefined ? folderError(error) : credentials ? 'credentialFailed' : 'failed');
      return false;
    }
  }

  const changeField = (field: keyof typeof fields, value: string) => {
    setFields(current => ({ ...current, [field]: value }));
    setStatus('idle');
  };
  const clearResult = () => setStatus('idle');
  return { directory, fields, credentialDirectory, status, connect, changeField, clearResult };
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { directory, fields, credentialDirectory, status, connect, changeField, clearResult } = useWebDavRelayDirectory(groupId);
  const busy = status === 'loading' || status === 'running';
  const saved = splitDirectory(directory);
  const sameDirectory = Boolean(directory) && fields.address.trim() === saved.address && fields.folder === saved.folder;
  const credentialsRequired = !sameDirectory || credentialActive || credentialDirectory === directory || username || password;
  const canConnect = !busy && Boolean(fields.address.trim()) &&
    (credentialsRequired ? Boolean(username.trim() && password) : !bound);
  const submit = () => {
    if (!canConnect) return;
    void connect(sameDirectory ? directory : fields.address.trim(), credentialsRequired ? { username, password } : undefined,
      sameDirectory ? undefined : fields.folder.trim() || DEFAULT_FOLDER_NAME);
    setPassword('');
  };
  const result = status !== 'idle' && status !== 'loading'
    ? <span role="status">{t(`settings.companionSync.webdav.${status}`)}</span> : null;
  const savedCredentials = credentialDirectory && <span className="break-words">{t('settings.companionSync.webdav.credentialsSaved', { directory: credentialDirectory })}</span>;
  const addressLabel = t('settings.companionSync.webdav.parentFolder');
  return <>
    <div className="[&>[data-settings-row]+[data-settings-row]]:before:block">
      <PublishingTextRow plain title={addressLabel} label={addressLabel}
        description={t('settings.companionSync.webdav.parentFolderHint')}
        disabled={busy || Boolean(bound)} type="url" value={fields.address} placeholder="https://"
        onChange={value => changeField('address', value)} />
      <PublishingTextRow plain title={t('settings.companionSync.webdav.username')}
        label={t('settings.companionSync.webdav.username')} description={t('settings.companionSync.webdav.usernameHint')}
        disabled={busy} value={username} onChange={value => { setUsername(value); clearResult(); }} />
      <PublishingTextRow plain title={t('settings.companionSync.webdav.password')}
        label={t('settings.companionSync.webdav.password')} description={t('settings.companionSync.webdav.passwordHint')}
        disabled={busy} type="password" value={password}
        onChange={value => { setPassword(value); clearResult(); }} onEnter={submit} />
      <PublishingTextRow plain title={t('settings.companionSync.webdav.newFolder')}
        label={t('settings.companionSync.webdav.newFolder')} description={t('settings.companionSync.webdav.newFolderHint')}
        disabled={busy || Boolean(bound)} value={fields.folder} placeholder={DEFAULT_FOLDER_NAME}
        onChange={value => changeField('folder', value)} onEnter={submit} />
    </div>
    <SettingsRow title={t('settings.companionSync.webdav.service')}
      description={result && savedCredentials ? <>{result}<br />{savedCredentials}</> : result || savedCredentials || t('settings.companionSync.webdav.testHint')}>
      <SettingsControlSlot>
        <SettingsButton disabled={!canConnect} onClick={submit}>
          {t('settings.companionSync.webdav.connect')}
        </SettingsButton>
      </SettingsControlSlot>
    </SettingsRow>
  </>;
}
