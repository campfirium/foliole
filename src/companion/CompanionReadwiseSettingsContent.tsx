import { useState } from 'react';

import { useReadwiseTokenConnection } from '../features/settings/components/sections/useReadwiseTokenConnection';

export function CompanionReadwiseSettingsContent() {
  const [token, setToken] = useState('');
  const connector = useReadwiseTokenConnection();
  const message = connector.error ?? connector.syncResult?.message ?? connector.connection.message;
  const disabled = connector.isPending;

  return (
    <div className="space-y-4 px-1">
      <div className="border-b border-companion-divider pb-4">
        <div className="text-base font-medium text-foreground">Readwise Token</div>
        <p className="mt-1 text-sm text-companion-text-secondary">{message}</p>
      </div>
      <label className="block text-sm font-medium text-foreground" htmlFor="companion-readwise-token">
        Access token
      </label>
      <input
        autoComplete="off"
        className="h-11 w-full rounded-md border border-companion-divider bg-canvas px-3 text-base text-foreground"
        disabled={disabled}
        id="companion-readwise-token"
        onChange={(event) => setToken(event.target.value)}
        placeholder="Access token"
        type="password"
        value={token}
      />
      <div className="flex flex-wrap gap-2">
        <button
          className="min-h-11 rounded-md border border-companion-divider px-4 text-sm font-medium text-foreground disabled:opacity-50"
          disabled={disabled || !token.trim()}
          onClick={() => void connector.connect(token).then((next) => {
            if (next?.connected) setToken('');
          })}
          type="button"
        >
          Connect
        </button>
        {connector.connection.connected ? (
          <>
            <button
              className="min-h-11 rounded-md border border-companion-divider px-4 text-sm font-medium text-foreground disabled:opacity-50"
              disabled={disabled}
              onClick={connector.sync}
              type="button"
            >
              Sync library
            </button>
            <button
              className="min-h-11 rounded-md border border-companion-divider px-4 text-sm font-medium text-foreground disabled:opacity-50"
              disabled={disabled}
              onClick={connector.disconnect}
              type="button"
            >
              Disconnect
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
