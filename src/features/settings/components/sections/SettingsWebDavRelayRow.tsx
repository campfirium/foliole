import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  loadDesktopWebDavRelayDirectory, loadDesktopWebDavSetupDraft, saveDesktopWebDavRelayDirectory,
  saveDesktopWebDavRelayCredentials
} from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { SettingsButton, SettingsControlSlot, SettingsRow } from '../../../../shared/ui';

import { PublishingTextRow } from './PublishingTextRow';
import { useWebDavSetupFields } from './useWebDavSetupFields';

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

function useWebDavRelayDirectory(groupId: string, bound?: boolean) {
  const [directory, setDirectory] = useState('');
  const [credentialDirectory, setCredentialDirectory] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'loadFailed' | 'idle' | 'running' | 'passed' | 'failed' | 'credentialPassed' | 'credentialFailed' |
    'credentialStorageUnavailable' | (typeof FOLDER_ERRORS)[keyof typeof FOLDER_ERRORS]
  >('loading');
  const setup = useWebDavSetupFields(groupId, () => setStatus('idle'), () => {
    setStatus(current => current === 'running' ? current : 'credentialStorageUnavailable');
  });
  const { hydrate, username, password, hasSavedPassword } = setup;

  useEffect(() => {
    const pending = loadDesktopWebDavRelayDirectory(groupId);
    if (!pending) return;
    let current = true;
    void Promise.all([pending, loadDesktopWebDavSetupDraft(groupId)]).then(([value, draft]) => {
      if (!current) return;
      const saved = value?.directory ?? value?.credential_directory ?? '';
      setDirectory(saved);
      const verified = splitDirectory(saved);
      const matchesDefault = draft?.folder === '' && URL.parse(draft.address)?.href === verified.address &&
        verified.folder === DEFAULT_FOLDER_NAME;
      hydrate(draft && !bound && !matchesDefault ? draft : verified, draft?.username ?? '', Boolean(draft?.has_password));
      setCredentialDirectory(value?.credential_directory ?? null);
      setStatus('idle');
    }, (error: unknown) => {
      if (current) setStatus(isSecureStorageError(error) ? 'credentialStorageUnavailable' : 'loadFailed');
    });
    return () => { current = false; };
  }, [bound, groupId, hydrate]);

  async function connect(address: string, authenticated: boolean, newFolderName?: string) {
    try {
      setStatus('running');
      await setup.persist();
      const credentials = authenticated ? { username: username.trim(), password } : undefined;
      const pending = credentials
        ? saveDesktopWebDavRelayCredentials(groupId, address, credentials.username, credentials.password, newFolderName,
          !password && hasSavedPassword ? true : undefined)
        : saveDesktopWebDavRelayDirectory(groupId, address);
      if (!pending) { setStatus('loadFailed'); return; }
      const saved = await pending;
      setDirectory(saved);
      hydrate(splitDirectory(saved), username, Boolean(credentials));
      if (credentials) setCredentialDirectory(saved);
      setStatus(credentials ? 'credentialPassed' : 'passed');
      return true;
    } catch (error) {
      setStatus(isSecureStorageError(error) ? 'credentialStorageUnavailable'
        : newFolderName !== undefined ? folderError(error) : authenticated ? 'credentialFailed' : 'failed');
      return false;
    }
  }

  return { ...setup, directory, credentialDirectory, status, connect };
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
  const { directory, fields, credentialDirectory, status, connect, changeField, username, password,
    hasSavedPassword, changeUsername, changePassword, saveDraft } = useWebDavRelayDirectory(groupId, bound);
  const busy = status === 'loading' || status === 'running';
  const saved = splitDirectory(directory);
  const sameDirectory = Boolean(directory) && fields.address.trim() === saved.address && fields.folder === saved.folder;
  const credentialsRequired = !sameDirectory || credentialActive || credentialDirectory === directory || username || password;
  const canConnect = !busy && Boolean(fields.address.trim()) &&
    (credentialsRequired ? Boolean(username.trim() && (password || hasSavedPassword)) : !bound);
  const submit = () => {
    if (!canConnect) return;
    void connect(sameDirectory ? directory : fields.address.trim(), Boolean(credentialsRequired),
      sameDirectory ? undefined : fields.folder.trim() || DEFAULT_FOLDER_NAME);
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
        onBlur={saveDraft} onEnter={saveDraft} onChange={value => changeField('address', value)} />
      <PublishingTextRow plain title={t('settings.companionSync.webdav.username')}
        label={t('settings.companionSync.webdav.username')} description={t('settings.companionSync.webdav.usernameHint')}
        disabled={busy} value={username} onBlur={saveDraft} onEnter={saveDraft} onChange={changeUsername} />
      <PublishingTextRow plain title={t('settings.companionSync.webdav.password')}
        label={t('settings.companionSync.webdav.password')} description={t('settings.companionSync.webdav.passwordHint')}
        disabled={busy} type="password" value={password}
        placeholder={hasSavedPassword ? t('settings.companionSync.webdav.passwordSaved') : ''}
        onBlur={saveDraft} onChange={changePassword} onEnter={submit} />
      <PublishingTextRow plain title={t('settings.companionSync.webdav.newFolder')}
        label={t('settings.companionSync.webdav.newFolder')} description={t('settings.companionSync.webdav.newFolderHint')}
        disabled={busy || Boolean(bound)} value={fields.folder} placeholder={DEFAULT_FOLDER_NAME}
        onBlur={saveDraft} onChange={value => changeField('folder', value)} onEnter={submit} />
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
