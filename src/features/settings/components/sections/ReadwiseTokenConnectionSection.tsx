import { useState } from 'react';

import {
  AppInput,
  AppStatusBadge,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName
} from '../../../../shared/ui';

import { useReadwiseTokenConnection } from './useReadwiseTokenConnection';

function badgeTone(status: ReturnType<typeof useReadwiseTokenConnection>['connection']['status']) {
  return status === 'connected' ? 'success' : status === 'not_connected' ? 'neutral' : 'warning';
}

function statusLabel(status: ReturnType<typeof useReadwiseTokenConnection>['connection']['status']) {
  if (status === 'connected') return 'Connected';
  if (status === 'not_connected') return 'Not connected';
  if (status === 'rate_limited') return 'Rate limited';
  if (status === 'storage_unavailable') return 'Storage unavailable';
  return 'Needs reconnect';
}

export function ReadwiseTokenConnectionSection() {
  const [token, setToken] = useState('');
  const connector = useReadwiseTokenConnection();
  const message = connector.error ?? connector.syncResult?.message ?? connector.connection.message;

  return (
    <SettingsSection
      actions={<AppStatusBadge label={statusLabel(connector.connection.status)} tone={badgeTone(connector.connection.status)} />}
      ariaLabel="Readwise Token connection"
      description="Connect with a Readwise access token. Foliole stores the token only on this device and uses it for Readwise API requests."
      title="Readwise Token"
    >
      <SettingsRow description={message} title="Connection">
        <SettingsControlSlot className={`${SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME} flex-col items-end gap-2`}>
          <div className="flex max-w-full flex-wrap justify-end gap-2">
            <AppInput
              aria-label="Readwise access token"
              autoComplete="off"
              className={SETTINGS_INPUT_WIDTH_CLASS_NAME}
              disabled={connector.isPending}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Access token"
              type="password"
              value={token}
            />
            <button
              className={settingsButtonClassName()}
              disabled={connector.isPending || !token.trim()}
              onClick={() => void connector.connect(token).then((next) => {
                if (next?.connected) setToken('');
              })}
              type="button"
            >
              Connect
            </button>
          </div>
          {connector.connection.connected ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button className={settingsButtonClassName()} disabled={connector.isPending} onClick={connector.sync} type="button">
                Sync library
              </button>
              <button className={settingsButtonClassName()} disabled={connector.isPending} onClick={connector.disconnect} type="button">
                Disconnect
              </button>
            </div>
          ) : null}
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
